-- ================================================================================
-- BALANCE SHEET STORED PROCEDURES
-- 1. fn_stage_balance_sheet_actuals_from_logs
-- 2. fn_transform_balance_sheet_actuals
-- 3. fn_project_actuals_from_balance_sheet_actuals
-- 4. fn_cleanup_balance_sheet_history
-- ================================================================================

-- --------------------------------------------------------------------------------
-- 1. fn_stage_balance_sheet_actuals_from_logs
-- --------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_stage_balance_sheet_actuals_from_logs(
    p_company_id uuid,
    p_organisation_id uuid,
    p_integration_source_id uuid,
    p_sync_run_id uuid,
    p_report_log_id uuid DEFAULT NULL::uuid
)
RETURNS TABLE(out_sync_run_id uuid, report_logs_processed integer, rows_inserted_or_updated integer, rows_skipped integer)
LANGUAGE plpgsql
AS $function$
DECLARE
    v_rows_inserted_or_updated integer := 0;
    v_report_logs_processed integer := 0;
    v_rows_skipped integer := 0;
    v_now timestamp(3) := CURRENT_TIMESTAMP;
BEGIN
    WITH report_logs AS (
        SELECT
            l.id AS report_log_id,
            l.company_id,
            l.organisation_id,
            l.integration_source_id,
            l.sync_run_id,
            l.source_property_id,
            l.property_id,
            l.property_code,
            COALESCE(l.report_code, 'balance_sheet') AS report_code,
            COALESCE(l.report_name, 'balance_sheet') AS report_name,
            l.report_version,
            l.method_version,
            l.gl_tree_id,
            NULLIF(l.gl_book_ids ->> 0, '')::text AS gl_book_id,
            COALESCE(l.accounting_method, 'accrual') AS accounting_method,
            COALESCE(
                p.fiscal_year_start_month,
                1
            ) AS fiscal_year_start_month,
            COALESCE(
                (l.request_payload -> 'method' -> 'params' -> 'filters' -> 'period' ->> 'fiscal_year')::integer,
                p."budgetYear",
                EXTRACT(YEAR FROM l.created_at)::integer
            ) AS fiscal_year,
            l.created_at,
            l.response_payload
        FROM public.integration_report_api_logs l
        LEFT JOIN public.properties p 
          ON (l.property_id IS NOT NULL AND p.id = l.property_id)
          OR (l.property_id IS NULL AND (p."externalId"::text = l.source_property_id OR p.property_code = l.property_code))
        WHERE l.company_id = p_company_id
          AND l.organisation_id = p_organisation_id
          AND l.integration_source_id = p_integration_source_id
          AND l.sync_run_id = p_sync_run_id
          AND (l.report_name = 'balance_sheet' OR l.report_code = 'balance_sheet')
          AND l.status = 'SUCCESS'
          AND l.response_code = 200
          AND l.response_payload IS NOT NULL
          AND (p_report_log_id IS NULL OR l.id = p_report_log_id)
    ),
    report_result AS (
        SELECT
            rl.*,
            result_item
        FROM report_logs rl
        CROSS JOIN LATERAL jsonb_array_elements(
            COALESCE(rl.response_payload -> 'response' -> 'result', '[]'::jsonb)
        ) AS result_item
    ),
    raw_report_rows AS (
        SELECT
            rr.*,
            row_item AS raw_record_payload
        FROM report_result rr
        CROSS JOIN LATERAL jsonb_array_elements(
            COALESCE(rr.result_item -> 'reportData', '[]'::jsonb)
        ) AS row_item
        WHERE row_item ->> 'account_number' IS NOT NULL
          AND TRIM(row_item ->> 'account_number') <> ''
    ),
    extracted_monthly_values AS (
        SELECT
            r.report_log_id,
            r.company_id,
            r.organisation_id,
            r.integration_source_id,
            r.sync_run_id,
            r.source_property_id,
            r.property_id,
            r.property_code,
            r.fiscal_year,
            r.fiscal_year_start_month,
            r.gl_tree_id,
            r.gl_book_id,
            r.accounting_method,
            r.report_code,
            r.report_name,
            r.report_version,
            r.method_version,
            TRIM(r.raw_record_payload ->> 'account_number') AS account_number,
            TRIM(r.raw_record_payload ->> 'account_name') AS account_name,
            r.raw_record_payload ->> 'path' AS account_path,
            COALESCE(
                NULLIF(split_part(split_part(r.raw_record_payload ->> 'path', '|', 1), '##', 2), ''),
                split_part(r.raw_record_payload ->> 'path', '|', 1),
                'Balance Sheet'
            ) AS account_group,
            r.raw_record_payload ->> 'property_name' AS property_name,
            r.raw_record_payload ->> 'lookup_code' AS lookup_code,
            COALESCE(NULLIF(r.raw_record_payload ->> 'current_period_amount', '')::numeric, 0) AS current_period_amount,
            COALESCE(NULLIF(r.raw_record_payload ->> 'prior_period_amount', '')::numeric, 0) AS prior_period_amount,
            COALESCE(NULLIF(r.raw_record_payload ->> 'prior_year_amount', '')::numeric, 0) AS prior_year_amount,
            COALESCE(NULLIF(r.raw_record_payload ->> 'prior_year_end', '')::numeric, 0) AS prior_year_end,
            r.raw_record_payload,
            kv.k AS month_key,
            COALESCE(NULLIF(kv.v, '')::numeric, 0) AS month_val,
            CASE LOWER(SUBSTRING(kv.k FROM 1 FOR 3))
                WHEN 'jan' THEN 1 WHEN 'feb' THEN 2 WHEN 'mar' THEN 3 WHEN 'apr' THEN 4
                WHEN 'may' THEN 5 WHEN 'jun' THEN 6 WHEN 'jul' THEN 7 WHEN 'aug' THEN 8
                WHEN 'sep' THEN 9 WHEN 'oct' THEN 10 WHEN 'nov' THEN 11 WHEN 'dec' THEN 12
                ELSE 0
            END AS calendar_month_num
        FROM raw_report_rows r
        CROSS JOIN LATERAL jsonb_each_text(r.raw_record_payload) AS kv(k, v)
        WHERE kv.k ~* '^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)_[0-9]{4}$'
    ),
    aggregated_accounts AS (
        SELECT
            emv.report_log_id,
            emv.company_id,
            emv.organisation_id,
            emv.integration_source_id,
            emv.sync_run_id,
            emv.source_property_id,
            emv.property_id,
            emv.property_code,
            emv.property_name,
            emv.lookup_code,
            emv.fiscal_year,
            emv.gl_tree_id,
            emv.gl_book_id,
            emv.accounting_method,
            emv.report_code,
            emv.report_name,
            emv.report_version,
            emv.method_version,
            emv.account_number,
            emv.account_name,
            emv.account_path,
            emv.account_group,
            emv.current_period_amount,
            emv.prior_period_amount,
            emv.prior_year_amount,
            emv.prior_year_end,
            emv.raw_record_payload,
            -- Fiscal Period 1 through 12 mapping:
            -- Period Index = ((calendar_month - start_month + 12) % 12) + 1
            -- Period 1 maps to jan_amount, Period 2 to feb_amount, etc.
            COALESCE(MAX(CASE WHEN (((emv.calendar_month_num - emv.fiscal_year_start_month + 12) % 12) + 1) = 1 THEN emv.month_val END), 0) AS jan_amount,
            COALESCE(MAX(CASE WHEN (((emv.calendar_month_num - emv.fiscal_year_start_month + 12) % 12) + 1) = 2 THEN emv.month_val END), 0) AS feb_amount,
            COALESCE(MAX(CASE WHEN (((emv.calendar_month_num - emv.fiscal_year_start_month + 12) % 12) + 1) = 3 THEN emv.month_val END), 0) AS mar_amount,
            COALESCE(MAX(CASE WHEN (((emv.calendar_month_num - emv.fiscal_year_start_month + 12) % 12) + 1) = 4 THEN emv.month_val END), 0) AS apr_amount,
            COALESCE(MAX(CASE WHEN (((emv.calendar_month_num - emv.fiscal_year_start_month + 12) % 12) + 1) = 5 THEN emv.month_val END), 0) AS may_amount,
            COALESCE(MAX(CASE WHEN (((emv.calendar_month_num - emv.fiscal_year_start_month + 12) % 12) + 1) = 6 THEN emv.month_val END), 0) AS jun_amount,
            COALESCE(MAX(CASE WHEN (((emv.calendar_month_num - emv.fiscal_year_start_month + 12) % 12) + 1) = 7 THEN emv.month_val END), 0) AS jul_amount,
            COALESCE(MAX(CASE WHEN (((emv.calendar_month_num - emv.fiscal_year_start_month + 12) % 12) + 1) = 8 THEN emv.month_val END), 0) AS aug_amount,
            COALESCE(MAX(CASE WHEN (((emv.calendar_month_num - emv.fiscal_year_start_month + 12) % 12) + 1) = 9 THEN emv.month_val END), 0) AS sep_amount,
            COALESCE(MAX(CASE WHEN (((emv.calendar_month_num - emv.fiscal_year_start_month + 12) % 12) + 1) = 10 THEN emv.month_val END), 0) AS oct_amount,
            COALESCE(MAX(CASE WHEN (((emv.calendar_month_num - emv.fiscal_year_start_month + 12) % 12) + 1) = 11 THEN emv.month_val END), 0) AS nov_amount,
            COALESCE(MAX(CASE WHEN (((emv.calendar_month_num - emv.fiscal_year_start_month + 12) % 12) + 1) = 12 THEN emv.month_val END), 0) AS dec_amount
        FROM extracted_monthly_values emv
        GROUP BY
            emv.report_log_id,
            emv.company_id,
            emv.organisation_id,
            emv.integration_source_id,
            emv.sync_run_id,
            emv.source_property_id,
            emv.property_id,
            emv.property_code,
            emv.property_name,
            emv.lookup_code,
            emv.fiscal_year,
            emv.gl_tree_id,
            emv.gl_book_id,
            emv.accounting_method,
            emv.report_code,
            emv.report_name,
            emv.report_version,
            emv.method_version,
            emv.account_number,
            emv.account_name,
            emv.account_path,
            emv.account_group,
            emv.current_period_amount,
            emv.prior_period_amount,
            emv.prior_year_amount,
            emv.prior_year_end,
            emv.raw_record_payload
    )
    INSERT INTO public.staging_balance_sheet_actuals (
        id,
        company_id,
        organisation_id,
        integration_source_id,
        sync_run_id,
        report_log_id,
        source_property_id,
        property_id,
        property_code,
        property_name,
        lookup_code,
        report_code,
        report_name,
        report_version,
        method_version,
        gl_tree_id,
        gl_book_id,
        accounting_method,
        account_number,
        account_name,
        account_path,
        account_group,
        fiscal_year,
        jan_amount,
        feb_amount,
        mar_amount,
        apr_amount,
        may_amount,
        jun_amount,
        jul_amount,
        aug_amount,
        sep_amount,
        oct_amount,
        nov_amount,
        dec_amount,
        full_year_amount,
        current_period_amount,
        prior_period_amount,
        prior_year_amount,
        prior_year_end,
        raw_record_payload,
        transform_status,
        created_at,
        updated_at
    )
    SELECT
        gen_random_uuid(),
        a.company_id,
        a.organisation_id,
        a.integration_source_id,
        a.sync_run_id,
        a.report_log_id,
        a.source_property_id,
        a.property_id,
        a.property_code,
        a.property_name,
        a.lookup_code,
        a.report_code,
        a.report_name,
        a.report_version,
        a.method_version,
        a.gl_tree_id,
        a.gl_book_id,
        a.accounting_method,
        a.account_number,
        a.account_name,
        a.account_path,
        a.account_group,
        a.fiscal_year,
        a.jan_amount,
        a.feb_amount,
        a.mar_amount,
        a.apr_amount,
        a.may_amount,
        a.jun_amount,
        a.jul_amount,
        a.aug_amount,
        a.sep_amount,
        a.oct_amount,
        a.nov_amount,
        a.dec_amount,
        (a.jan_amount + a.feb_amount + a.mar_amount + a.apr_amount + a.may_amount + a.jun_amount +
         a.jul_amount + a.aug_amount + a.sep_amount + a.oct_amount + a.nov_amount + a.dec_amount) AS full_year_amount,
        a.current_period_amount,
        a.prior_period_amount,
        a.prior_year_amount,
        a.prior_year_end,
        a.raw_record_payload,
        'PENDING',
        v_now,
        v_now
    FROM aggregated_accounts a
    ON CONFLICT (company_id, organisation_id, integration_source_id, sync_run_id, source_property_id, gl_tree_id, gl_book_id, account_number)
    DO UPDATE SET
        property_id = EXCLUDED.property_id,
        property_code = EXCLUDED.property_code,
        property_name = EXCLUDED.property_name,
        lookup_code = EXCLUDED.lookup_code,
        account_name = EXCLUDED.account_name,
        account_path = EXCLUDED.account_path,
        account_group = EXCLUDED.account_group,
        fiscal_year = EXCLUDED.fiscal_year,
        jan_amount = EXCLUDED.jan_amount,
        feb_amount = EXCLUDED.feb_amount,
        mar_amount = EXCLUDED.mar_amount,
        apr_amount = EXCLUDED.apr_amount,
        may_amount = EXCLUDED.may_amount,
        jun_amount = EXCLUDED.jun_amount,
        jul_amount = EXCLUDED.jul_amount,
        aug_amount = EXCLUDED.aug_amount,
        sep_amount = EXCLUDED.sep_amount,
        oct_amount = EXCLUDED.oct_amount,
        nov_amount = EXCLUDED.nov_amount,
        dec_amount = EXCLUDED.dec_amount,
        full_year_amount = EXCLUDED.full_year_amount,
        current_period_amount = EXCLUDED.current_period_amount,
        prior_period_amount = EXCLUDED.prior_period_amount,
        prior_year_amount = EXCLUDED.prior_year_amount,
        prior_year_end = EXCLUDED.prior_year_end,
        raw_record_payload = EXCLUDED.raw_record_payload,
        transform_status = 'PENDING',
        updated_at = v_now;

    GET DIAGNOSTICS v_rows_inserted_or_updated = ROW_COUNT;

    SELECT COUNT(DISTINCT l.id)
    INTO v_report_logs_processed
    FROM public.integration_report_api_logs l
    WHERE l.company_id = p_company_id
      AND l.organisation_id = p_organisation_id
      AND l.integration_source_id = p_integration_source_id
      AND l.sync_run_id = p_sync_run_id
      AND (l.report_name = 'balance_sheet' OR l.report_code = 'balance_sheet')
      AND l.status = 'SUCCESS'
      AND l.response_code = 200
      AND (p_report_log_id IS NULL OR l.id = p_report_log_id);

    RETURN QUERY
    SELECT
        p_sync_run_id AS out_sync_run_id,
        v_report_logs_processed AS report_logs_processed,
        v_rows_inserted_or_updated AS rows_inserted_or_updated,
        0 AS rows_skipped;
END;
$function$;


-- --------------------------------------------------------------------------------
-- 2. fn_transform_balance_sheet_actuals
-- --------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_transform_balance_sheet_actuals(
    p_company_id uuid,
    p_organisation_id uuid,
    p_integration_source_id uuid,
    p_sync_run_id uuid
)
RETURNS TABLE(inserted_count integer, updated_count integer, warning_count integer, failed_count integer)
LANGUAGE plpgsql
AS $function$
DECLARE
    v_inserted_count integer := 0;
    v_updated_count integer := 0;
    v_warning_count integer := 0;
    v_failed_count integer := 0;
    v_now timestamp(3) := CURRENT_TIMESTAMP;
BEGIN
    -- 1. Create temporary table of resolved staging rows
    CREATE TEMP TABLE tmp_resolved_bs_rows ON COMMIT DROP AS
    SELECT
        sba.id AS staging_row_id,
        sba.company_id,
        sba.organisation_id,
        sba.integration_source_id,
        sba.sync_run_id,
        sba.report_log_id,
        sba.source_property_id,
        COALESCE(sba.property_id, p.id) AS resolved_property_id,
        COALESCE(sba.property_code, p.property_code) AS resolved_property_code,
        sba.gl_tree_id,
        sba.gl_book_id,
        sba.accounting_method,
        sba.account_number,
        sba.account_name,
        sba.account_path,
        sba.account_group,
        sba.fiscal_year,
        sba.jan_amount,
        sba.feb_amount,
        sba.mar_amount,
        sba.apr_amount,
        sba.may_amount,
        sba.jun_amount,
        sba.jul_amount,
        sba.aug_amount,
        sba.sep_amount,
        sba.oct_amount,
        sba.nov_amount,
        sba.dec_amount,
        sba.full_year_amount,
        sba.current_period_amount,
        sba.prior_period_amount,
        sba.prior_year_amount,
        sba.prior_year_end,
        sba.raw_record_payload,
        COALESCE(direct_coa.coa_id, ga.id) AS resolved_coa_id,
        COALESCE(direct_coa.account_name, ga.account_name, sba.account_name) AS resolved_account_name,
        ga.id AS resolved_gl_account_id,
        ga.account_name AS resolved_gl_account_name
    FROM public.staging_balance_sheet_actuals sba
    LEFT JOIN public.properties p
      ON (sba.property_id IS NOT NULL AND p.id = sba.property_id)
      OR (sba.property_id IS NULL AND (p."externalId"::text = sba.source_property_id OR p.property_code = sba.property_code))
    LEFT JOIN public.gl_trees gt 
      ON gt.company_id = sba.company_id
     AND gt.organisation_id = sba.organisation_id
     AND gt.source_gl_tree_id = sba.gl_tree_id
    LEFT JOIN public.gl_accounts ga 
      ON ga.company_id = sba.company_id
     AND ga.organisation_id = sba.organisation_id
     AND ga.gl_tree_id = gt.id
     AND ga.account_number = sba.account_number
    LEFT JOIN public.chart_of_accounts direct_coa
      ON direct_coa.company_id = sba.company_id
     AND direct_coa.organisation_id = sba.organisation_id
     AND direct_coa.account_code = sba.account_number
     AND (direct_coa.account_name = sba.account_name OR LOWER(TRIM(direct_coa.account_name)) = LOWER(TRIM(sba.account_name)))
    WHERE sba.company_id = p_company_id
      AND sba.organisation_id = p_organisation_id
      AND sba.integration_source_id = p_integration_source_id
      AND sba.sync_run_id = p_sync_run_id
      AND sba.transform_status IN ('PENDING', 'FAILED', 'TRANSFORMED_WITH_WARNING');

    -- 2. Mark failed properties (unresolvable property)
    UPDATE public.staging_balance_sheet_actuals sba
    SET
        transform_status = 'FAILED',
        transform_errors = jsonb_build_object(
            'reason', 'PROPERTY_NOT_FOUND',
            'message', 'Unable to resolve property. property_id could not be mapped.',
            'source_property_id', t.source_property_id
        ),
        transformed_at = v_now,
        updated_at = v_now
    FROM tmp_resolved_bs_rows t
    WHERE sba.id = t.staging_row_id
      AND t.resolved_property_id IS NULL;

    GET DIAGNOSTICS v_failed_count = ROW_COUNT;

    DELETE FROM tmp_resolved_bs_rows WHERE resolved_property_id IS NULL;

    -- 3. Create notifications in bulk for missing COA accounts
    INSERT INTO public.integration_data_notifications (
        id,
        company_id,
        organisation_id,
        integration_source_id,
        sync_run_id,
        report_log_id,
        notification_type,
        severity,
        entity_type,
        source_property_id,
        property_id,
        property_code,
        source_account_number,
        source_account_name,
        message,
        details,
        status,
        created_at
    )
    SELECT DISTINCT ON (t.resolved_property_id, t.account_number)
        gen_random_uuid(),
        p_company_id,
        p_organisation_id,
        p_integration_source_id,
        p_sync_run_id,
        t.report_log_id,
        'MISSING_COA_ACCOUNT',
        'WARNING',
        'BalanceSheetActuals',
        t.source_property_id,
        t.resolved_property_id,
        t.resolved_property_code,
        t.account_number,
        t.account_name,
        'Account from Entrata balance_sheet report was not found in gl_accounts. Actuals were transformed using source account number/name.',
        jsonb_build_object(
            'source_property_id', t.source_property_id,
            'property_id', t.resolved_property_id,
            'property_code', t.resolved_property_code,
            'gl_tree_id', t.gl_tree_id,
            'gl_book_id', t.gl_book_id,
            'account_number', t.account_number,
            'account_name', t.account_name,
            'fiscal_year', t.fiscal_year
        ),
        'OPEN',
        v_now
    FROM tmp_resolved_bs_rows t
    WHERE t.resolved_coa_id IS NULL
      AND t.resolved_gl_account_id IS NULL
      AND NOT EXISTS (
          SELECT 1
          FROM public.integration_data_notifications n
          WHERE n.company_id = p_company_id
            AND n.organisation_id = p_organisation_id
            AND n.integration_source_id = p_integration_source_id
            AND n.notification_type = 'MISSING_COA_ACCOUNT'
            AND n.entity_type = 'BalanceSheetActuals'
            AND n.source_property_id = t.source_property_id
            AND n.source_account_number = t.account_number
            AND n.status = 'OPEN'
      );

    -- 4. Count updates vs inserts
    SELECT COUNT(*)
    INTO v_updated_count
    FROM (
        SELECT DISTINCT ON (
            t.company_id,
            t.organisation_id,
            t.integration_source_id,
            t.resolved_property_id,
            t.fiscal_year,
            t.gl_tree_id,
            t.gl_book_id,
            t.account_number
        ) t.*
        FROM tmp_resolved_bs_rows t
        ORDER BY
            t.company_id,
            t.organisation_id,
            t.integration_source_id,
            t.resolved_property_id,
            t.fiscal_year,
            t.gl_tree_id,
            t.gl_book_id,
            t.account_number,
            t.staging_row_id DESC
    ) t
    JOIN public.property_balance_sheet_actuals pba
      ON pba.company_id = p_company_id
     AND pba.organisation_id = p_organisation_id
     AND pba.integration_source_id = p_integration_source_id
     AND pba.property_id = t.resolved_property_id
     AND pba.fiscal_year = t.fiscal_year
     AND COALESCE(pba.gl_tree_id, '') = COALESCE(t.gl_tree_id, '')
     AND COALESCE(pba.gl_book_id, '') = COALESCE(t.gl_book_id, '')
     AND pba.account_number = t.account_number;

    -- 5. Bulk upsert into property_balance_sheet_actuals
    INSERT INTO public.property_balance_sheet_actuals (
        id,
        company_id,
        organisation_id,
        integration_source_id,
        sync_run_id,
        report_log_id,
        property_id,
        property_code,
        source_property_id,
        fiscal_year,
        gl_tree_id,
        gl_book_id,
        accounting_method,
        coa_id,
        account_number,
        account_name,
        account_path,
        account_group,
        jan_amount,
        feb_amount,
        mar_amount,
        apr_amount,
        may_amount,
        jun_amount,
        jul_amount,
        aug_amount,
        sep_amount,
        oct_amount,
        nov_amount,
        dec_amount,
        full_year_amount,
        current_period_amount,
        prior_period_amount,
        prior_year_amount,
        prior_year_end,
        source_system,
        raw_record_payload,
        imported_at,
        created_at,
        updated_at
    )
    SELECT DISTINCT ON (
        t.company_id,
        t.organisation_id,
        t.integration_source_id,
        t.resolved_property_id,
        t.fiscal_year,
        t.gl_tree_id,
        t.gl_book_id,
        t.account_number
    )
        gen_random_uuid(),
        t.company_id,
        t.organisation_id,
        t.integration_source_id,
        t.sync_run_id,
        t.report_log_id,
        t.resolved_property_id,
        COALESCE(t.resolved_property_code, ''),
        t.source_property_id,
        t.fiscal_year,
        t.gl_tree_id,
        t.gl_book_id,
        t.accounting_method,
        t.resolved_coa_id,
        t.account_number,
        COALESCE(t.resolved_account_name, t.account_name),
        t.account_path,
        t.account_group,
        t.jan_amount,
        t.feb_amount,
        t.mar_amount,
        t.apr_amount,
        t.may_amount,
        t.jun_amount,
        t.jul_amount,
        t.aug_amount,
        t.sep_amount,
        t.oct_amount,
        t.nov_amount,
        t.dec_amount,
        t.full_year_amount,
        t.current_period_amount,
        t.prior_period_amount,
        t.prior_year_amount,
        t.prior_year_end,
        'ENTRATA_BALANCE_SHEET_REPORT',
        t.raw_record_payload,
        v_now,
        v_now,
        v_now
    FROM tmp_resolved_bs_rows t
    ORDER BY
        t.company_id,
        t.organisation_id,
        t.integration_source_id,
        t.resolved_property_id,
        t.fiscal_year,
        t.gl_tree_id,
        t.gl_book_id,
        t.account_number,
        t.staging_row_id DESC
    ON CONFLICT (company_id, organisation_id, integration_source_id, property_id, fiscal_year, gl_tree_id, gl_book_id, account_number)
    DO UPDATE SET
        sync_run_id = EXCLUDED.sync_run_id,
        report_log_id = EXCLUDED.report_log_id,
        property_code = EXCLUDED.property_code,
        source_property_id = EXCLUDED.source_property_id,
        accounting_method = EXCLUDED.accounting_method,
        coa_id = EXCLUDED.coa_id,
        account_name = EXCLUDED.account_name,
        account_path = EXCLUDED.account_path,
        account_group = EXCLUDED.account_group,
        jan_amount = EXCLUDED.jan_amount,
        feb_amount = EXCLUDED.feb_amount,
        mar_amount = EXCLUDED.mar_amount,
        apr_amount = EXCLUDED.apr_amount,
        may_amount = EXCLUDED.may_amount,
        jun_amount = EXCLUDED.jun_amount,
        jul_amount = EXCLUDED.jul_amount,
        aug_amount = EXCLUDED.aug_amount,
        sep_amount = EXCLUDED.sep_amount,
        oct_amount = EXCLUDED.oct_amount,
        nov_amount = EXCLUDED.nov_amount,
        dec_amount = EXCLUDED.dec_amount,
        full_year_amount = EXCLUDED.full_year_amount,
        current_period_amount = EXCLUDED.current_period_amount,
        prior_period_amount = EXCLUDED.prior_period_amount,
        prior_year_amount = EXCLUDED.prior_year_amount,
        prior_year_end = EXCLUDED.prior_year_end,
        raw_record_payload = EXCLUDED.raw_record_payload,
        updated_at = v_now;

    GET DIAGNOSTICS v_inserted_count = ROW_COUNT;
    v_inserted_count := GREATEST(0, v_inserted_count - v_updated_count);

    -- 6. Mark staging rows as TRANSFORMED or TRANSFORMED_WITH_WARNING
    UPDATE public.staging_balance_sheet_actuals sba
    SET
        property_id = t.resolved_property_id,
        property_code = t.resolved_property_code,
        transform_status = CASE
            WHEN t.resolved_coa_id IS NULL AND t.resolved_gl_account_id IS NULL THEN 'TRANSFORMED_WITH_WARNING'
            ELSE 'TRANSFORMED'
        END,
        transform_errors = CASE
            WHEN t.resolved_coa_id IS NULL AND t.resolved_gl_account_id IS NULL THEN jsonb_build_object(
                'warning', 'MISSING_COA_ACCOUNT',
                'message', 'Account was not resolved against chart_of_accounts or gl_accounts, but saved successfully.'
            )
            ELSE NULL
        END,
        transformed_at = v_now,
        updated_at = v_now
    FROM tmp_resolved_bs_rows t
    WHERE sba.id = t.staging_row_id;

    SELECT COUNT(*)
    INTO v_warning_count
    FROM tmp_resolved_bs_rows
    WHERE resolved_coa_id IS NULL AND resolved_gl_account_id IS NULL;

    RETURN QUERY
    SELECT
        v_inserted_count,
        v_updated_count,
        v_warning_count,
        v_failed_count;
END;
$function$;


-- --------------------------------------------------------------------------------
-- 3. fn_project_actuals_from_balance_sheet_actuals
-- --------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_project_actuals_from_balance_sheet_actuals(
    p_company_id uuid,
    p_organisation_id uuid,
    p_integration_source_id uuid,
    p_sync_run_id uuid DEFAULT NULL::uuid,
    p_property_id uuid DEFAULT NULL::uuid,
    p_fiscal_year integer DEFAULT NULL::integer
)
RETURNS TABLE(property_id uuid, fiscal_year integer, snapshot_id uuid, calc_lines_upserted integer)
LANGUAGE plpgsql
AS $function$
DECLARE
    v_combo record;
    v_line record;
    v_snapshot_id uuid;
    v_existing_line_id uuid;
    v_calc_lines_upserted integer;
    v_now timestamp(3) := CURRENT_TIMESTAMP;
BEGIN
    FOR v_combo IN
        SELECT DISTINCT
            pba.property_id,
            pba.fiscal_year
        FROM public.property_balance_sheet_actuals pba
        WHERE pba.company_id = p_company_id
          AND pba.organisation_id = p_organisation_id
          AND pba.integration_source_id = p_integration_source_id
          AND pba.property_id IS NOT NULL
          AND pba.fiscal_year IS NOT NULL
          AND pba.account_number IS NOT NULL
          AND COALESCE(pba.source_system, '') = 'ENTRATA_BALANCE_SHEET_REPORT'
          AND (p_sync_run_id IS NULL OR pba.sync_run_id = p_sync_run_id)
          AND (p_property_id IS NULL OR pba.property_id = p_property_id)
          AND (p_fiscal_year IS NULL OR pba.fiscal_year = p_fiscal_year)
        ORDER BY
            pba.property_id,
            pba.fiscal_year
    LOOP
        v_snapshot_id := NULL;
        v_calc_lines_upserted := 0;

        -- 1. Find existing ACTUALS snapshot for property/year
        SELECT bs.snapshot_id
        INTO v_snapshot_id
        FROM public.budget_snapshots bs
        WHERE bs.company_id = p_company_id
          AND bs.organisation_id = p_organisation_id
          AND bs.property_id = v_combo.property_id
          AND bs.fiscal_year = v_combo.fiscal_year
          AND bs.snapshot_type = 'ACTUALS'
        LIMIT 1;

        -- 2. Create ACTUALS snapshot if missing
        IF v_snapshot_id IS NULL THEN
            v_snapshot_id := gen_random_uuid();

            INSERT INTO public.budget_snapshots (
                snapshot_id,
                company_id,
                organisation_id,
                property_id,
                fiscal_year,
                snapshot_type,
                status,
                source_system,
                source_batch_id,
                created_at,
                updated_at
            )
            VALUES (
                v_snapshot_id,
                p_company_id,
                p_organisation_id,
                v_combo.property_id,
                v_combo.fiscal_year,
                'ACTUALS',
                'ACTIVE',
                'ENTRATA',
                p_sync_run_id,
                v_now,
                v_now
            );
        END IF;

        -- 3. Upsert calc lines from property_balance_sheet_actuals
        FOR v_line IN
            WITH bs_accounts AS (
                SELECT
                    pba.property_id,
                    pba.fiscal_year,
                    pba.account_number AS account_code,
                    pba.account_name,
                    pba.account_group,
                    pba.jan_amount,
                    pba.feb_amount,
                    pba.mar_amount,
                    pba.apr_amount,
                    pba.may_amount,
                    pba.jun_amount,
                    pba.jul_amount,
                    pba.aug_amount,
                    pba.sep_amount,
                    pba.oct_amount,
                    pba.nov_amount,
                    pba.dec_amount,
                    pba.full_year_amount
                FROM public.property_balance_sheet_actuals pba
                WHERE pba.company_id = p_company_id
                  AND pba.organisation_id = p_organisation_id
                  AND pba.integration_source_id = p_integration_source_id
                  AND pba.property_id = v_combo.property_id
                  AND pba.fiscal_year = v_combo.fiscal_year
                  AND pba.account_number IS NOT NULL
                  AND COALESCE(pba.source_system, '') = 'ENTRATA_BALANCE_SHEET_REPORT'
            ),
            line_rows AS (
                SELECT
                    ba.*,
                    coa.coa_id,
                    COALESCE(coa.account_name, ba.account_name) AS resolved_account_name,
                    COALESCE(grp.group_name, ba.account_group, 'Balance Sheet') AS resolved_group,
                    ROW_NUMBER() OVER(ORDER BY ba.account_code, ba.account_name) AS sort_order
                FROM bs_accounts ba
                LEFT JOIN public.chart_of_accounts coa
                  ON coa.company_id = p_company_id
                 AND coa.organisation_id = p_organisation_id
                 AND coa.account_code = ba.account_code
                 AND (coa.account_name = ba.account_name OR LOWER(TRIM(coa.account_name)) = LOWER(TRIM(ba.account_name)))
                LEFT JOIN public.coa_account_groups grp
                  ON grp.company_id = p_company_id
                 AND grp.organisation_id = p_organisation_id
                 AND grp.group_id = coa.group_id
            )
            SELECT * FROM line_rows ORDER BY sort_order
        LOOP
            v_existing_line_id := NULL;

            SELECT bcl.calc_line_id
            INTO v_existing_line_id
            FROM public.budget_calc_lines bcl
            WHERE bcl.snapshot_id = v_snapshot_id
              AND bcl.account_code = v_line.account_code
            LIMIT 1;

            IF v_existing_line_id IS NOT NULL THEN
                UPDATE public.budget_calc_lines bcl
                SET
                    company_id = p_company_id,
                    organisation_id = p_organisation_id,
                    property_id = v_combo.property_id,
                    fiscal_year = v_combo.fiscal_year,
                    snapshot_type = 'ACTUALS',
                    coa_id = v_line.coa_id,
                    account_code = v_line.account_code,
                    account_name = v_line.resolved_account_name,
                    account_group = v_line.resolved_group,
                    line_code = v_line.account_code,
                    line_name = v_line.resolved_account_name,
                    line_type = COALESCE(bcl.line_type, 'ACCOUNT'),
                    jan_amount = COALESCE(v_line.jan_amount, 0),
                    feb_amount = COALESCE(v_line.feb_amount, 0),
                    mar_amount = COALESCE(v_line.mar_amount, 0),
                    apr_amount = COALESCE(v_line.apr_amount, 0),
                    may_amount = COALESCE(v_line.may_amount, 0),
                    jun_amount = COALESCE(v_line.jun_amount, 0),
                    jul_amount = COALESCE(v_line.jul_amount, 0),
                    aug_amount = COALESCE(v_line.aug_amount, 0),
                    sep_amount = COALESCE(v_line.sep_amount, 0),
                    oct_amount = COALESCE(v_line.oct_amount, 0),
                    nov_amount = COALESCE(v_line.nov_amount, 0),
                    dec_amount = COALESCE(v_line.dec_amount, 0),
                    full_year_amount = COALESCE(v_line.full_year_amount, 0),
                    notes = CASE
                        WHEN v_line.coa_id IS NULL THEN 'Projected from Entrata balance_sheet report. COA account was not mapped.'
                        ELSE 'Projected from Entrata balance_sheet report.'
                    END,
                    updated_at = v_now
                WHERE bcl.calc_line_id = v_existing_line_id;
            ELSE
                INSERT INTO public.budget_calc_lines (
                    calc_line_id,
                    snapshot_id,
                    company_id,
                    organisation_id,
                    property_id,
                    fiscal_year,
                    snapshot_type,
                    coa_id,
                    account_code,
                    account_name,
                    account_group,
                    line_code,
                    line_name,
                    line_type,
                    sort_order,
                    is_editable,
                    is_calculated,
                    jan_amount,
                    feb_amount,
                    mar_amount,
                    apr_amount,
                    may_amount,
                    jun_amount,
                    jul_amount,
                    aug_amount,
                    sep_amount,
                    oct_amount,
                    nov_amount,
                    dec_amount,
                    full_year_amount,
                    notes,
                    created_at,
                    updated_at
                )
                VALUES (
                    gen_random_uuid(),
                    v_snapshot_id,
                    p_company_id,
                    p_organisation_id,
                    v_combo.property_id,
                    v_combo.fiscal_year,
                    'ACTUALS',
                    v_line.coa_id,
                    v_line.account_code,
                    v_line.resolved_account_name,
                    v_line.resolved_group,
                    v_line.account_code,
                    v_line.resolved_account_name,
                    'ACCOUNT',
                    v_line.sort_order,
                    false,
                    false,
                    COALESCE(v_line.jan_amount, 0),
                    COALESCE(v_line.feb_amount, 0),
                    COALESCE(v_line.mar_amount, 0),
                    COALESCE(v_line.apr_amount, 0),
                    COALESCE(v_line.may_amount, 0),
                    COALESCE(v_line.jun_amount, 0),
                    COALESCE(v_line.jul_amount, 0),
                    COALESCE(v_line.aug_amount, 0),
                    COALESCE(v_line.sep_amount, 0),
                    COALESCE(v_line.oct_amount, 0),
                    COALESCE(v_line.nov_amount, 0),
                    COALESCE(v_line.dec_amount, 0),
                    COALESCE(v_line.full_year_amount, 0),
                    CASE
                        WHEN v_line.coa_id IS NULL THEN 'Projected from Entrata balance_sheet report. COA account was not mapped.'
                        ELSE 'Projected from Entrata balance_sheet report.'
                    END,
                    v_now,
                    v_now
                );
            END IF;

            v_calc_lines_upserted := v_calc_lines_upserted + 1;
        END LOOP;

        RETURN QUERY
        SELECT
            v_combo.property_id,
            v_combo.fiscal_year,
            v_snapshot_id,
            v_calc_lines_upserted;
    END LOOP;
END;
$function$;


-- --------------------------------------------------------------------------------
-- 4. fn_cleanup_balance_sheet_history
-- Retains latest 1 SUCCESS and latest 1 FAILED report log per property,
-- purging older logs and their associated staging records.
-- --------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_cleanup_balance_sheet_history(
    p_company_id uuid,
    p_organisation_id uuid,
    p_source_property_id text
)
RETURNS integer
LANGUAGE plpgsql
AS $function$
DECLARE
    v_deleted_count integer := 0;
BEGIN
    WITH ranked_logs AS (
        SELECT
            id,
            status,
            ROW_NUMBER() OVER (
                PARTITION BY status 
                ORDER BY created_at DESC
            ) AS rank_num
        FROM public.integration_report_api_logs
        WHERE company_id = p_company_id
          AND organisation_id = p_organisation_id
          AND (report_name = 'balance_sheet' OR report_code = 'balance_sheet')
          AND source_property_id = p_source_property_id
    ),
    logs_to_delete AS (
        SELECT id FROM ranked_logs WHERE rank_num > 1
    ),
    deleted_staging AS (
        DELETE FROM public.staging_balance_sheet_actuals
        WHERE report_log_id IN (SELECT id FROM logs_to_delete)
    ),
    deleted_logs AS (
        DELETE FROM public.integration_report_api_logs
        WHERE id IN (SELECT id FROM logs_to_delete)
        RETURNING id
    )
    SELECT COUNT(*) INTO v_deleted_count FROM deleted_logs;

    RETURN v_deleted_count;
END;
$function$;
