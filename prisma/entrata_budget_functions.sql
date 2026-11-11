-- ======================================================================================
-- ENTRATA BUDGET EXPORT & UPDATE FUNCTIONS
-- Supports budget scopes: 'OPERATING' (default), 'CAPEX', 'ALL'
-- ======================================================================================

CREATE OR REPLACE FUNCTION public.fn_get_entrata_budget_common_data(
    p_property_id uuid,
    p_fiscal_year integer,
    p_format text DEFAULT 'CREATE',
    p_budget_scope text DEFAULT 'OPERATING'
)
RETURNS jsonb
LANGUAGE plpgsql
AS $function$
DECLARE
    v_result jsonb;
BEGIN
    WITH property_info AS (
      SELECT 
        p.id AS property_id,
        p.company_id,
        p.organisation_id,
        COALESCE(p.property_code, '') AS property_code,
        p.property_name,
        p.coa_template_id,
        pb.fiscal_year AS budget_fiscal_year,
        pb.source_budget_id,
        pb.budget_name,
        pb.budget_status_type_id,
        pb.is_default,
        pb.fiscal_start_date,
        pb.fiscal_end_date
      FROM public.properties p
      LEFT JOIN LATERAL (
        SELECT pb_inner.*
        FROM public.property_budgets pb_inner
        WHERE pb_inner.property_id = p.id
        ORDER BY CASE WHEN pb_inner.fiscal_year = p_fiscal_year THEN 0 ELSE 1 END, pb_inner.fiscal_year DESC
        LIMIT 1
      ) pb ON true
      WHERE p.id = p_property_id
      LIMIT 1
    ),
    snapshot_info AS (
      SELECT 
        bs.snapshot_id,
        bs.fiscal_year,
        bs.snapshot_type
      FROM public.budget_snapshots bs
      WHERE bs.property_id = p_property_id
        AND bs.snapshot_type = 'WORKING_BUDGET'
      ORDER BY CASE WHEN bs.fiscal_year = p_fiscal_year THEN 0 ELSE 1 END, bs.fiscal_year DESC
      LIMIT 1
    ),
    calc_lines_aggregated AS (
      SELECT 
        COALESCE(root_coa.account_code, bcl.account_code) AS account_code,
        SUM(COALESCE(bcl.jan_amount, 0)) AS jan_amount,
        SUM(COALESCE(bcl.feb_amount, 0)) AS feb_amount,
        SUM(COALESCE(bcl.mar_amount, 0)) AS mar_amount,
        SUM(COALESCE(bcl.apr_amount, 0)) AS apr_amount,
        SUM(COALESCE(bcl.may_amount, 0)) AS may_amount,
        SUM(COALESCE(bcl.jun_amount, 0)) AS jun_amount,
        SUM(COALESCE(bcl.jul_amount, 0)) AS jul_amount,
        SUM(COALESCE(bcl.aug_amount, 0)) AS aug_amount,
        SUM(COALESCE(bcl.sep_amount, 0)) AS sep_amount,
        SUM(COALESCE(bcl.oct_amount, 0)) AS oct_amount,
        SUM(COALESCE(bcl.nov_amount, 0)) AS nov_amount,
        SUM(COALESCE(bcl.dec_amount, 0)) AS dec_amount,
        SUM(COALESCE(bcl.full_year_amount, 0)) AS full_year_amount
      FROM public.budget_calc_lines bcl
      JOIN snapshot_info si ON si.snapshot_id = bcl.snapshot_id
      JOIN property_info pi ON true
      LEFT JOIN public.coa_template_overrides cto 
        ON cto.template_id = pi.coa_template_id 
       AND (cto.coa_id = bcl.coa_id OR cto.account_code = bcl.account_code)
       AND cto.is_active = true
       AND cto.mapped_default_coa_id IS NOT NULL
      LEFT JOIN public.chart_of_accounts root_coa 
        ON root_coa.coa_id = cto.mapped_default_coa_id
      WHERE bcl.line_type = 'ACCOUNT'
        AND COALESCE(root_coa.account_code, bcl.account_code) IS NOT NULL
      GROUP BY COALESCE(root_coa.account_code, bcl.account_code)
    ),
    profit_loss_adjustments_aggregated AS (
      SELECT 
        COALESCE(root_coa.account_code, pla.account_code) AS account_code,
        SUM(COALESCE(pla.jan_amount, 0)) AS jan_amount,
        SUM(COALESCE(pla.feb_amount, 0)) AS feb_amount,
        SUM(COALESCE(pla.mar_amount, 0)) AS mar_amount,
        SUM(COALESCE(pla.apr_amount, 0)) AS apr_amount,
        SUM(COALESCE(pla.may_amount, 0)) AS may_amount,
        SUM(COALESCE(pla.jun_amount, 0)) AS jun_amount,
        SUM(COALESCE(pla.jul_amount, 0)) AS jul_amount,
        SUM(COALESCE(pla.aug_amount, 0)) AS aug_amount,
        SUM(COALESCE(pla.sep_amount, 0)) AS sep_amount,
        SUM(COALESCE(pla.oct_amount, 0)) AS oct_amount,
        SUM(COALESCE(pla.nov_amount, 0)) AS nov_amount,
        SUM(COALESCE(pla.dec_amount, 0)) AS dec_amount,
        SUM(COALESCE(pla.full_year_amount, 0)) AS full_year_amount
      FROM public.profit_loss_adjustments pla
      JOIN snapshot_info si ON si.snapshot_id = pla.snapshot_id
      JOIN property_info pi ON true
      LEFT JOIN public.coa_template_overrides cto 
        ON cto.template_id = pi.coa_template_id 
       AND (cto.coa_id = pla.coa_id OR cto.account_code = pla.account_code)
       AND cto.is_active = true
       AND cto.mapped_default_coa_id IS NOT NULL
      LEFT JOIN public.chart_of_accounts root_coa 
        ON root_coa.coa_id = cto.mapped_default_coa_id
      WHERE COALESCE(root_coa.account_code, pla.account_code) IS NOT NULL
      GROUP BY COALESCE(root_coa.account_code, pla.account_code)
    ),
    property_coa AS (
      -- 1. OPERATING: standard P&L accounts via fn_get_coa_for_property (respects template exclusions)
      SELECT 
        coa.coa_id,
        coa.account_code,
        coa.account_name
      FROM property_info pi
      CROSS JOIN LATERAL public.fn_get_coa_for_property(pi.company_id, pi.organisation_id, pi.property_id, NULL) coa
      WHERE upper(p_budget_scope) = 'OPERATING'
        AND coa.head_name IN ('Income', 'Operating Expenses', 'Non Operating Income/Expenses')

      UNION ALL

      -- 2. CAPEX: Capital / Balance Sheet Asset accounts (bypasses template exclusions, matching fn_get_budget_screen_lines)
      SELECT 
        coa.coa_id,
        COALESCE(ovr.account_code, coa.account_code)::varchar AS account_code,
        COALESCE(ovr.account_name, coa.account_name)::varchar AS account_name
      FROM property_info pi
      JOIN public.chart_of_accounts coa 
        ON coa.company_id = pi.company_id 
       AND coa.organisation_id = pi.organisation_id
      LEFT JOIN public.coa_template_overrides ovr
        ON ovr.coa_id          = coa.coa_id
       AND ovr.template_id     = pi.coa_template_id
       AND ovr.company_id      = coa.company_id
       AND ovr.organisation_id = coa.organisation_id
       AND ovr.is_active       = true
      JOIN public.coa_account_groups grp
        ON grp.group_id        = COALESCE(ovr.group_id, coa.group_id)
       AND grp.company_id      = coa.company_id
       AND grp.organisation_id = coa.organisation_id
      JOIN public.coa_account_heads head
        ON head.head_id        = COALESCE(ovr.head_id, grp.head_id)
       AND head.company_id     = coa.company_id
       AND head.organisation_id = coa.organisation_id
      JOIN public.coa_account_types typ
        ON typ.type_id         = COALESCE(ovr.type_id, head.type_id)
       AND typ.company_id      = coa.company_id
       AND typ.organisation_id = coa.organisation_id
      WHERE upper(p_budget_scope) = 'CAPEX'
        AND (
            typ.type_name = 'Assets'
            OR grp.group_code IN ('FA', 'CSH', 'OCA', 'AR', 'PED', 'OA')
        )

      UNION ALL

      -- 3. ALL: full chart of accounts
      SELECT 
        coa.coa_id,
        coa.account_code,
        coa.account_name
      FROM property_info pi
      JOIN public.chart_of_accounts coa ON coa.company_id = pi.company_id
      WHERE upper(p_budget_scope) = 'ALL'
    ),
    all_coa_lines AS (
      SELECT 
        pcoa.account_code,
        COALESCE(ga.account_name, pcoa.account_name) AS account_name,
        ga.source_gl_account_id,
        (COALESCE(cla.jan_amount, 0) + CASE WHEN upper(p_budget_scope) IN ('OPERATING', 'ALL') THEN COALESCE(plaa.jan_amount, 0) ELSE 0 END) AS jan_amount,
        (COALESCE(cla.feb_amount, 0) + CASE WHEN upper(p_budget_scope) IN ('OPERATING', 'ALL') THEN COALESCE(plaa.feb_amount, 0) ELSE 0 END) AS feb_amount,
        (COALESCE(cla.mar_amount, 0) + CASE WHEN upper(p_budget_scope) IN ('OPERATING', 'ALL') THEN COALESCE(plaa.mar_amount, 0) ELSE 0 END) AS mar_amount,
        (COALESCE(cla.apr_amount, 0) + CASE WHEN upper(p_budget_scope) IN ('OPERATING', 'ALL') THEN COALESCE(plaa.apr_amount, 0) ELSE 0 END) AS apr_amount,
        (COALESCE(cla.may_amount, 0) + CASE WHEN upper(p_budget_scope) IN ('OPERATING', 'ALL') THEN COALESCE(plaa.may_amount, 0) ELSE 0 END) AS may_amount,
        (COALESCE(cla.jun_amount, 0) + CASE WHEN upper(p_budget_scope) IN ('OPERATING', 'ALL') THEN COALESCE(plaa.jun_amount, 0) ELSE 0 END) AS jun_amount,
        (COALESCE(cla.jul_amount, 0) + CASE WHEN upper(p_budget_scope) IN ('OPERATING', 'ALL') THEN COALESCE(plaa.jul_amount, 0) ELSE 0 END) AS jul_amount,
        (COALESCE(cla.aug_amount, 0) + CASE WHEN upper(p_budget_scope) IN ('OPERATING', 'ALL') THEN COALESCE(plaa.aug_amount, 0) ELSE 0 END) AS aug_amount,
        (COALESCE(cla.sep_amount, 0) + CASE WHEN upper(p_budget_scope) IN ('OPERATING', 'ALL') THEN COALESCE(plaa.sep_amount, 0) ELSE 0 END) AS sep_amount,
        (COALESCE(cla.oct_amount, 0) + CASE WHEN upper(p_budget_scope) IN ('OPERATING', 'ALL') THEN COALESCE(plaa.oct_amount, 0) ELSE 0 END) AS oct_amount,
        (COALESCE(cla.nov_amount, 0) + CASE WHEN upper(p_budget_scope) IN ('OPERATING', 'ALL') THEN COALESCE(plaa.nov_amount, 0) ELSE 0 END) AS nov_amount,
        (COALESCE(cla.dec_amount, 0) + CASE WHEN upper(p_budget_scope) IN ('OPERATING', 'ALL') THEN COALESCE(plaa.dec_amount, 0) ELSE 0 END) AS dec_amount,
        (
          (COALESCE(cla.jan_amount, 0) + CASE WHEN upper(p_budget_scope) IN ('OPERATING', 'ALL') THEN COALESCE(plaa.jan_amount, 0) ELSE 0 END) +
          (COALESCE(cla.feb_amount, 0) + CASE WHEN upper(p_budget_scope) IN ('OPERATING', 'ALL') THEN COALESCE(plaa.feb_amount, 0) ELSE 0 END) +
          (COALESCE(cla.mar_amount, 0) + CASE WHEN upper(p_budget_scope) IN ('OPERATING', 'ALL') THEN COALESCE(plaa.mar_amount, 0) ELSE 0 END) +
          (COALESCE(cla.apr_amount, 0) + CASE WHEN upper(p_budget_scope) IN ('OPERATING', 'ALL') THEN COALESCE(plaa.apr_amount, 0) ELSE 0 END) +
          (COALESCE(cla.may_amount, 0) + CASE WHEN upper(p_budget_scope) IN ('OPERATING', 'ALL') THEN COALESCE(plaa.may_amount, 0) ELSE 0 END) +
          (COALESCE(cla.jun_amount, 0) + CASE WHEN upper(p_budget_scope) IN ('OPERATING', 'ALL') THEN COALESCE(plaa.jun_amount, 0) ELSE 0 END) +
          (COALESCE(cla.jul_amount, 0) + CASE WHEN upper(p_budget_scope) IN ('OPERATING', 'ALL') THEN COALESCE(plaa.jul_amount, 0) ELSE 0 END) +
          (COALESCE(cla.aug_amount, 0) + CASE WHEN upper(p_budget_scope) IN ('OPERATING', 'ALL') THEN COALESCE(plaa.aug_amount, 0) ELSE 0 END) +
          (COALESCE(cla.sep_amount, 0) + CASE WHEN upper(p_budget_scope) IN ('OPERATING', 'ALL') THEN COALESCE(plaa.sep_amount, 0) ELSE 0 END) +
          (COALESCE(cla.oct_amount, 0) + CASE WHEN upper(p_budget_scope) IN ('OPERATING', 'ALL') THEN COALESCE(plaa.oct_amount, 0) ELSE 0 END) +
          (COALESCE(cla.nov_amount, 0) + CASE WHEN upper(p_budget_scope) IN ('OPERATING', 'ALL') THEN COALESCE(plaa.nov_amount, 0) ELSE 0 END) +
          (COALESCE(cla.dec_amount, 0) + CASE WHEN upper(p_budget_scope) IN ('OPERATING', 'ALL') THEN COALESCE(plaa.dec_amount, 0) ELSE 0 END)
        ) AS full_year_amount
      FROM property_coa pcoa
      LEFT JOIN calc_lines_aggregated cla ON cla.account_code = pcoa.account_code
      LEFT JOIN profit_loss_adjustments_aggregated plaa ON plaa.account_code = pcoa.account_code
      LEFT JOIN LATERAL (
        SELECT ga_inner.source_gl_account_id, ga_inner.account_name
        FROM public.gl_accounts ga_inner
        WHERE ga_inner.account_number = pcoa.account_code
          AND ga_inner.status = 'Enabled'
        ORDER BY 
          CASE WHEN LOWER(ga_inner.account_name) = LOWER(pcoa.account_name) THEN 0 ELSE 1 END,
          ga_inner.updated_at DESC
        LIMIT 1
      ) ga ON true
      WHERE pcoa.account_code IS NOT NULL 
        AND pcoa.account_code <> ''
        AND ga.source_gl_account_id IS NOT NULL
    ),
    deduped_gl_lines AS (
      SELECT 
        acl.source_gl_account_id,
        (ARRAY_AGG(acl.account_code ORDER BY (acl.full_year_amount <> 0) DESC, acl.account_code ASC))[1] AS account_code,
        (ARRAY_AGG(acl.account_name ORDER BY (acl.full_year_amount <> 0) DESC, acl.account_code ASC))[1] AS account_name,
        SUM(acl.jan_amount) AS jan_amount,
        SUM(acl.feb_amount) AS feb_amount,
        SUM(acl.mar_amount) AS mar_amount,
        SUM(acl.apr_amount) AS apr_amount,
        SUM(acl.may_amount) AS may_amount,
        SUM(acl.jun_amount) AS jun_amount,
        SUM(acl.jul_amount) AS jul_amount,
        SUM(acl.aug_amount) AS aug_amount,
        SUM(acl.sep_amount) AS sep_amount,
        SUM(acl.oct_amount) AS oct_amount,
        SUM(acl.nov_amount) AS nov_amount,
        SUM(acl.dec_amount) AS dec_amount,
        SUM(acl.full_year_amount) AS full_year_amount
      FROM all_coa_lines acl
      GROUP BY acl.source_gl_account_id
    ),
    formatted_gl_accounts AS (
      SELECT 
        jsonb_agg(
          jsonb_build_object(
            'id', 
            CASE 
              WHEN dgl.source_gl_account_id ~ '^[0-9]+$' THEN to_jsonb(dgl.source_gl_account_id::bigint) 
              WHEN dgl.source_gl_account_id IS NOT NULL THEN to_jsonb(dgl.source_gl_account_id) 
              ELSE to_jsonb(dgl.account_code)
            END,
            'accountNumber', dgl.account_code,
            'accountName', dgl.account_name,
            'budgetMonths', 
            CASE 
              WHEN upper(p_format) = 'UPDATE' THEN
                jsonb_build_object(
                  'budgetMonth', jsonb_build_array(
                    jsonb_build_object('month', '01/' || p_fiscal_year, 'amount', dgl.jan_amount),
                    jsonb_build_object('month', '02/' || p_fiscal_year, 'amount', dgl.feb_amount),
                    jsonb_build_object('month', '03/' || p_fiscal_year, 'amount', dgl.mar_amount),
                    jsonb_build_object('month', '04/' || p_fiscal_year, 'amount', dgl.apr_amount),
                    jsonb_build_object('month', '05/' || p_fiscal_year, 'amount', dgl.may_amount),
                    jsonb_build_object('month', '06/' || p_fiscal_year, 'amount', dgl.jun_amount),
                    jsonb_build_object('month', '07/' || p_fiscal_year, 'amount', dgl.jul_amount),
                    jsonb_build_object('month', '08/' || p_fiscal_year, 'amount', dgl.aug_amount),
                    jsonb_build_object('month', '09/' || p_fiscal_year, 'amount', dgl.sep_amount),
                    jsonb_build_object('month', '10/' || p_fiscal_year, 'amount', dgl.oct_amount),
                    jsonb_build_object('month', '11/' || p_fiscal_year, 'amount', dgl.nov_amount),
                    jsonb_build_object('month', '12/' || p_fiscal_year, 'amount', dgl.dec_amount)
                  )
                )
              ELSE
                jsonb_build_array(
                  jsonb_build_object('budgetMonth', '01/' || p_fiscal_year, 'amount', dgl.jan_amount),
                  jsonb_build_object('budgetMonth', '02/' || p_fiscal_year, 'amount', dgl.feb_amount),
                  jsonb_build_object('budgetMonth', '03/' || p_fiscal_year, 'amount', dgl.mar_amount),
                  jsonb_build_object('budgetMonth', '04/' || p_fiscal_year, 'amount', dgl.apr_amount),
                  jsonb_build_object('budgetMonth', '05/' || p_fiscal_year, 'amount', dgl.may_amount),
                  jsonb_build_object('budgetMonth', '06/' || p_fiscal_year, 'amount', dgl.jun_amount),
                  jsonb_build_object('budgetMonth', '07/' || p_fiscal_year, 'amount', dgl.jul_amount),
                  jsonb_build_object('budgetMonth', '08/' || p_fiscal_year, 'amount', dgl.aug_amount),
                  jsonb_build_object('budgetMonth', '09/' || p_fiscal_year, 'amount', dgl.sep_amount),
                  jsonb_build_object('budgetMonth', '10/' || p_fiscal_year, 'amount', dgl.oct_amount),
                  jsonb_build_object('budgetMonth', '11/' || p_fiscal_year, 'amount', dgl.nov_amount),
                  jsonb_build_object('budgetMonth', '12/' || p_fiscal_year, 'amount', dgl.dec_amount)
                )
            END
          )
          ORDER BY dgl.account_code ASC
        ) AS gl_accounts_json,
        COALESCE(SUM(dgl.full_year_amount), 0) AS total_budget_amount
      FROM deduped_gl_lines dgl
    )
    SELECT 
      jsonb_build_object(
        'propertyId', pi.property_id,
        'propertyCode', pi.property_code,
        'propertyName', pi.property_name,
        'fiscalYear', p_fiscal_year,
        'budgetScope', upper(p_budget_scope),
        'budgetName', COALESCE(
          CASE WHEN pi.budget_fiscal_year = p_fiscal_year THEN pi.budget_name ELSE NULL END,
          pi.property_name || ' ' || p_fiscal_year || CASE WHEN upper(p_budget_scope) = 'CAPEX' THEN ' Capex' ELSE '' END
        ),
        'sourceBudgetId', pi.source_budget_id,
        'fiscalStartMonth', '01/' || p_fiscal_year,
        'fiscalEndMonth', '12/' || p_fiscal_year,
        'budgetStatusTypeId', COALESCE(pi.budget_status_type_id::text, '3'),
        'isDefault', COALESCE(pi.is_default::text, '0'),
        'fiscalStartDate', COALESCE(to_char(pi.fiscal_start_date, 'MM/DD/YYYY'), '01/01/' || p_fiscal_year),
        'fiscalEndDate', COALESCE(to_char(pi.fiscal_end_date, 'MM/DD/YYYY'), '12/31/' || p_fiscal_year),
        'budgetTotal', fga.total_budget_amount,
        'glAccounts', fga.gl_accounts_json
      ) INTO v_result
    FROM property_info pi
    CROSS JOIN formatted_gl_accounts fga;

    RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_generate_entrata_send_budgets_json(
    p_property_id uuid,
    p_fiscal_year integer,
    p_include_envelope boolean DEFAULT true,
    p_budget_scope text DEFAULT 'OPERATING'
)
RETURNS jsonb
LANGUAGE plpgsql
AS $function$
DECLARE
    v_common jsonb;
    v_budgets_obj jsonb;
    v_result jsonb;
BEGIN
    v_common := public.fn_get_entrata_budget_common_data(p_property_id, p_fiscal_year, 'CREATE', p_budget_scope);
    
    IF v_common IS NULL OR v_common->'glAccounts' IS NULL THEN
        RETURN NULL;
    END IF;

    v_budgets_obj := jsonb_build_object(
      'budgets', jsonb_build_object(
        'budget', jsonb_build_array(
          jsonb_build_object(
            'budgetName', v_common->>'budgetName',
            'fiscalStartMonth', v_common->>'fiscalStartMonth',
            'fiscalEndMonth', v_common->>'fiscalEndMonth',
            'budgetStatusTypeId', v_common->>'budgetStatusTypeId',
            'isDefault', v_common->>'isDefault',
            'fiscalStartDate', v_common->>'fiscalStartDate',
            'fiscalEndDate', v_common->>'fiscalEndDate',
            'fiscalYear', v_common->>'fiscalYear',
            'budgetTotal', v_common->>'budgetTotal',
            'glAccounts', jsonb_build_object(
              'glAccount', v_common->'glAccounts'
            )
          )
        )
      )
    );

    IF p_include_envelope THEN
      v_result := jsonb_build_object(
        'auth', jsonb_build_object('type', 'apikey'),
        'requestId', (v_common->>'propertyCode') || '_' || (EXTRACT(EPOCH FROM clock_timestamp()) * 1000)::bigint::text,
        'method', jsonb_build_object(
          'name', 'sendBudgets',
          'version', 'r1',
          'params', jsonb_build_object(
            'propertyId', v_common->>'propertyCode'
          ) || v_budgets_obj
        )
      );
    ELSE
      v_result := jsonb_build_object(
        'propertyId', v_common->>'propertyCode'
      ) || v_budgets_obj;
    END IF;

    RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_generate_entrata_update_budgets_json(
    p_property_id uuid,
    p_fiscal_year integer,
    p_budget_id text DEFAULT NULL::text,
    p_include_envelope boolean DEFAULT true,
    p_budget_scope text DEFAULT 'OPERATING'
)
RETURNS jsonb
LANGUAGE plpgsql
AS $function$
DECLARE
    v_common jsonb;
    v_target_budget_id bigint;
    v_budgets_obj jsonb;
    v_result jsonb;
BEGIN
    v_common := public.fn_get_entrata_budget_common_data(p_property_id, p_fiscal_year, 'UPDATE', p_budget_scope);
    
    IF v_common IS NULL OR v_common->'glAccounts' IS NULL THEN
        RETURN NULL;
    END IF;

    -- Resolve budgetId: prioritize explicit param, then sourceBudgetId from DB, fallback to 9692
    v_target_budget_id := COALESCE(
      NULLIF(p_budget_id, '')::bigint,
      NULLIF(v_common->>'sourceBudgetId', '')::bigint,
      9692
    );

    v_budgets_obj := jsonb_build_object(
      'budgets', jsonb_build_object(
        'budget', jsonb_build_array(
          jsonb_build_object(
            'budgetId', v_target_budget_id,
            'glAccounts', jsonb_build_object(
              'glAccount', v_common->'glAccounts'
            )
          )
        )
      )
    );

    IF p_include_envelope THEN
      v_result := jsonb_build_object(
        'auth', jsonb_build_object('type', 'apikey'),
        'requestId', (v_common->>'propertyCode') || '_' || (EXTRACT(EPOCH FROM clock_timestamp()) * 1000)::bigint::text,
        'method', jsonb_build_object(
          'name', 'updateBudgets',
          'version', 'r1',
          'params', jsonb_build_object(
            'propertyId', v_common->>'propertyCode'
          ) || v_budgets_obj
        )
      );
    ELSE
      v_result := jsonb_build_object(
        'propertyId', v_common->>'propertyCode'
      ) || v_budgets_obj;
    END IF;

    RETURN v_result;
END;
$function$;
