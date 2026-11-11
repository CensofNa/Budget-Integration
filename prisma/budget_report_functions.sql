-- Budget Report Stored Procedures: Staging, Transformation, and Projection

CREATE OR REPLACE FUNCTION public.fn_project_budgets_from_master_report(
    p_company_id uuid,
    p_organisation_id uuid,
    p_integration_source_id uuid,
    p_sync_run_id uuid DEFAULT NULL::uuid,
    p_property_id uuid DEFAULT NULL::uuid,
    p_fiscal_year integer DEFAULT 2026,
    p_account_code character varying DEFAULT NULL::character varying
)
RETURNS TABLE(property_id uuid, fiscal_year integer, budget_snapshot_id uuid, calc_lines_upserted integer)
LANGUAGE plpgsql
AS $function$
DECLARE
    v_now timestamp(3) := CURRENT_TIMESTAMP;
    v_combo record;
    v_budget_snapshot_id uuid;
    v_start_month integer := 1;
    v_budget_year_type text := 'CALENDAR_YEAR';
    v_line record;
    v_calc_lines_upserted integer := 0;
BEGIN
    FOR v_combo IN
        SELECT DISTINCT pbr.property_id, pbr.fiscal_year
        FROM public.property_budget_reports pbr
        WHERE pbr.company_id = p_company_id
          AND pbr.organisation_id = p_organisation_id
          AND pbr.integration_source_id = p_integration_source_id
          AND (p_sync_run_id IS NULL OR pbr.sync_run_id = p_sync_run_id)
          AND (p_property_id IS NULL OR pbr.property_id = p_property_id)
          AND (p_fiscal_year IS NULL OR pbr.fiscal_year = p_fiscal_year)
    LOOP
        v_calc_lines_upserted := 0;

        -- Resolve property fiscal start month and budget year type
        SELECT 
            COALESCE(p.fiscal_year_start_month, 1),
            COALESCE(p.budget_year_type::text, 'CALENDAR_YEAR')
        INTO v_start_month, v_budget_year_type
        FROM public.properties p
        WHERE p.id = v_combo.property_id;

        IF v_budget_year_type IS NULL OR v_budget_year_type = '' THEN
            v_budget_year_type := 'CALENDAR_YEAR';
        END IF;

        IF UPPER(v_budget_year_type) = 'CALENDAR_YEAR' THEN
            v_start_month := 1;
        ELSIF v_start_month IS NULL OR v_start_month < 1 OR v_start_month > 12 THEN
            v_start_month := 1;
        END IF;

        -- 1. Find or create BUDGET snapshot ONLY
        SELECT bs.snapshot_id INTO v_budget_snapshot_id
        FROM public.budget_snapshots bs
        WHERE bs.company_id = p_company_id
          AND bs.organisation_id = p_organisation_id
          AND bs.property_id = v_combo.property_id
          AND bs.fiscal_year = v_combo.fiscal_year
          AND bs.snapshot_type = 'BUDGET'
        LIMIT 1;

        IF v_budget_snapshot_id IS NULL THEN
            INSERT INTO public.budget_snapshots (
                snapshot_id, company_id, organisation_id, property_id, fiscal_year,
                snapshot_type, status, source_system, source_batch_id, created_at, updated_at
            ) VALUES (
                gen_random_uuid(), p_company_id, p_organisation_id, v_combo.property_id, v_combo.fiscal_year,
                'BUDGET', 'ACTIVE', 'ENTRATA_BUDGET_REPORT', p_sync_run_id, v_now, v_now
            )
            RETURNING snapshot_id INTO v_budget_snapshot_id;
        END IF;

        -- 2. Pivot monthly budget amounts mapping relative slots M1..M12 and match against COA
        FOR v_line IN
            WITH monthly_budget AS (
                SELECT
                    pbr.account_number AS account_code,
                    MAX(pbr.account_name) AS account_name,
                    SUM(CASE WHEN (((EXTRACT(MONTH FROM pbr.post_month)::integer - v_start_month + 12) % 12) + 1) = 1  THEN COALESCE(pbr.budget_amount, 0) ELSE 0 END) AS jan_amount,
                    SUM(CASE WHEN (((EXTRACT(MONTH FROM pbr.post_month)::integer - v_start_month + 12) % 12) + 1) = 2  THEN COALESCE(pbr.budget_amount, 0) ELSE 0 END) AS feb_amount,
                    SUM(CASE WHEN (((EXTRACT(MONTH FROM pbr.post_month)::integer - v_start_month + 12) % 12) + 1) = 3  THEN COALESCE(pbr.budget_amount, 0) ELSE 0 END) AS mar_amount,
                    SUM(CASE WHEN (((EXTRACT(MONTH FROM pbr.post_month)::integer - v_start_month + 12) % 12) + 1) = 4  THEN COALESCE(pbr.budget_amount, 0) ELSE 0 END) AS apr_amount,
                    SUM(CASE WHEN (((EXTRACT(MONTH FROM pbr.post_month)::integer - v_start_month + 12) % 12) + 1) = 5  THEN COALESCE(pbr.budget_amount, 0) ELSE 0 END) AS may_amount,
                    SUM(CASE WHEN (((EXTRACT(MONTH FROM pbr.post_month)::integer - v_start_month + 12) % 12) + 1) = 6  THEN COALESCE(pbr.budget_amount, 0) ELSE 0 END) AS jun_amount,
                    SUM(CASE WHEN (((EXTRACT(MONTH FROM pbr.post_month)::integer - v_start_month + 12) % 12) + 1) = 7  THEN COALESCE(pbr.budget_amount, 0) ELSE 0 END) AS jul_amount,
                    SUM(CASE WHEN (((EXTRACT(MONTH FROM pbr.post_month)::integer - v_start_month + 12) % 12) + 1) = 8  THEN COALESCE(pbr.budget_amount, 0) ELSE 0 END) AS aug_amount,
                    SUM(CASE WHEN (((EXTRACT(MONTH FROM pbr.post_month)::integer - v_start_month + 12) % 12) + 1) = 9  THEN COALESCE(pbr.budget_amount, 0) ELSE 0 END) AS sep_amount,
                    SUM(CASE WHEN (((EXTRACT(MONTH FROM pbr.post_month)::integer - v_start_month + 12) % 12) + 1) = 10 THEN COALESCE(pbr.budget_amount, 0) ELSE 0 END) AS oct_amount,
                    SUM(CASE WHEN (((EXTRACT(MONTH FROM pbr.post_month)::integer - v_start_month + 12) % 12) + 1) = 11 THEN COALESCE(pbr.budget_amount, 0) ELSE 0 END) AS nov_amount,
                    SUM(CASE WHEN (((EXTRACT(MONTH FROM pbr.post_month)::integer - v_start_month + 12) % 12) + 1) = 12 THEN COALESCE(pbr.budget_amount, 0) ELSE 0 END) AS dec_amount,
                    SUM(COALESCE(pbr.budget_amount, 0)) AS full_year_amount
                FROM public.property_budget_reports pbr
                WHERE pbr.company_id = p_company_id
                  AND pbr.organisation_id = p_organisation_id
                  AND pbr.integration_source_id = p_integration_source_id
                  AND pbr.property_id = v_combo.property_id
                  AND pbr.fiscal_year = v_combo.fiscal_year
                  AND pbr.account_number IS NOT NULL
                  AND (p_account_code IS NULL OR pbr.account_number = p_account_code)
                  AND (
                      CASE
                          WHEN UPPER(v_budget_year_type) = 'CALENDAR_YEAR' OR v_start_month = 1
                          THEN EXTRACT(YEAR FROM pbr.post_month)::integer = v_combo.fiscal_year
                          ELSE TRUE
                      END
                  )
                GROUP BY pbr.property_id, pbr.fiscal_year, pbr.account_number
            ),
            line_rows AS (
                SELECT
                    mb.*,
                    COALESCE(prop_coa.coa_id, direct_coa.coa_id) AS coa_id,
                    COALESCE(prop_coa.group_name, grp.group_name) AS account_group,
                    ROW_NUMBER() OVER(ORDER BY mb.account_code, mb.account_name) AS sort_order
                FROM monthly_budget mb
                -- 1. Primary lookup from property's active COA template
                LEFT JOIN public.fn_get_coa_for_property(p_company_id, p_organisation_id, v_combo.property_id) prop_coa
                  ON mb.account_code = prop_coa.account_code
                -- 2. Fallback lookup from master chart_of_accounts ONLY if not mapped by property COA
                LEFT JOIN public.chart_of_accounts direct_coa
                  ON prop_coa.coa_id IS NULL
                 AND direct_coa.company_id = p_company_id
                 AND direct_coa.organisation_id = p_organisation_id
                 AND mb.account_code = direct_coa.account_code
                LEFT JOIN public.coa_account_groups grp
                  ON grp.group_id = direct_coa.group_id
                 AND grp.company_id = p_company_id
                 AND grp.organisation_id = p_organisation_id
            )
            SELECT * FROM line_rows ORDER BY sort_order
        LOOP
            -- Upsert BUDGET calc line
            INSERT INTO public.budget_calc_lines (
                calc_line_id, snapshot_id, company_id, organisation_id, property_id, fiscal_year, snapshot_type,
                coa_id, account_code, account_name, account_group, line_code, line_name, line_type,
                sort_order, is_editable, is_calculated, is_reference, is_assumption_driven,
                jan_amount, feb_amount, mar_amount, apr_amount, may_amount, jun_amount,
                jul_amount, aug_amount, sep_amount, oct_amount, nov_amount, dec_amount, full_year_amount,
                notes, created_at, updated_at
            ) VALUES (
                gen_random_uuid(), v_budget_snapshot_id, p_company_id, p_organisation_id, v_combo.property_id, v_combo.fiscal_year, 'BUDGET',
                v_line.coa_id, v_line.account_code, v_line.account_name, v_line.account_group, v_line.account_code, v_line.account_name, 'ACCOUNT',
                v_line.sort_order, false, false, false, false,
                v_line.jan_amount, v_line.feb_amount, v_line.mar_amount, v_line.apr_amount, v_line.may_amount, v_line.jun_amount,
                v_line.jul_amount, v_line.aug_amount, v_line.sep_amount, v_line.oct_amount, v_line.nov_amount, v_line.dec_amount, v_line.full_year_amount,
                CASE WHEN v_line.coa_id IS NULL THEN 'Projected from Entrata budget report. COA account not mapped.' ELSE NULL END,
                v_now, v_now
            )
            ON CONFLICT (snapshot_id, line_code)
            DO UPDATE SET
                coa_id = EXCLUDED.coa_id,
                account_name = EXCLUDED.account_name,
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
                notes = EXCLUDED.notes,
                updated_at = v_now;

            v_calc_lines_upserted := v_calc_lines_upserted + 1;
        END LOOP;

        property_id := v_combo.property_id;
        fiscal_year := v_combo.fiscal_year;
        budget_snapshot_id := v_budget_snapshot_id;
        calc_lines_upserted := v_calc_lines_upserted;

        RETURN NEXT;
    END LOOP;

    RETURN;
END;
$function$;
