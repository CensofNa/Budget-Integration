-- ====================================================================================
-- Function: public.fn_sync_box_score_to_reforecast
-- Description: Syncs monthly actuals from property_box_score_monthly and
--              property_resident_retention_monthly into occupancy_reforecast_details
--              up to the specified cutoff month (reforecastPostMonth) or the property's
--              reforecast_locked_till_month.
-- ====================================================================================

CREATE OR REPLACE FUNCTION public.fn_sync_box_score_to_reforecast(
    p_company_id uuid,
    p_organisation_id uuid,
    p_property_id uuid DEFAULT NULL::uuid,
    p_fiscal_year integer DEFAULT NULL::integer,
    p_reforecast_post_month character varying DEFAULT NULL::character varying
)
RETURNS TABLE(
    success boolean,
    message text,
    properties_updated integer,
    rows_updated integer
)
LANGUAGE plpgsql
AS $function$
DECLARE
    v_prop RECORD;
    v_reforecast_id uuid;
    v_cutoff_month integer := NULL;
    v_prop_cutoff integer;
    v_fiscal_year integer;
    v_props_count integer := 0;
    v_rows_count integer := 0;
    v_box RECORD;
    v_ret RECORD;
    m integer;
BEGIN
    -- 1. Parse optional reforecast post month (e.g. '2026-10', '2026-10-31', '10/2026', '10')
    IF p_reforecast_post_month IS NOT NULL AND trim(p_reforecast_post_month) <> '' THEN
        IF p_reforecast_post_month LIKE '%-%' THEN
            v_cutoff_month := split_part(p_reforecast_post_month, '-', 2)::integer;
        ELSIF p_reforecast_post_month LIKE '%/%' THEN
            v_cutoff_month := split_part(p_reforecast_post_month, '/', 1)::integer;
        ELSE
            v_cutoff_month := p_reforecast_post_month::integer;
        END IF;
    END IF;

    -- 2. Iterate matching properties
    FOR v_prop IN
        SELECT p.id, p.property_code, p.property_name, p."budgetYear", p.reforecast_locked_till_month
        FROM public.properties p
        WHERE p.company_id = p_company_id
          AND p.organisation_id = p_organisation_id
          AND (p_property_id IS NULL OR p.id = p_property_id)
          AND p.is_disabled = false
    LOOP
        v_fiscal_year := COALESCE(p_fiscal_year, v_prop."budgetYear", EXTRACT(YEAR FROM CURRENT_DATE)::integer);

        -- If p_reforecast_post_month was supplied, lock and update property.reforecast_locked_till_month
        IF v_cutoff_month IS NOT NULL THEN
            v_prop_cutoff := v_cutoff_month;
            UPDATE public.properties
            SET reforecast_locked_till_month = v_cutoff_month,
                updated_at = NOW()
            WHERE id = v_prop.id;
        ELSE
            v_prop_cutoff := v_prop.reforecast_locked_till_month;
        END IF;

        -- If no cutoff month defined or <= 0, skip
        IF v_prop_cutoff IS NULL OR v_prop_cutoff <= 0 THEN
            CONTINUE;
        END IF;

        IF v_prop_cutoff > 12 THEN
            v_prop_cutoff := 12;
        END IF;

        -- 3. Ensure occupancy_reforecasts record exists
        SELECT id INTO v_reforecast_id
        FROM public.occupancy_reforecasts
        WHERE property_id = v_prop.id AND year = v_fiscal_year;

        IF v_reforecast_id IS NULL THEN
            CONTINUE;
        END IF;

        v_props_count := v_props_count + 1;

        -- 4. Sync months 1 through v_prop_cutoff
        FOR m IN 1..v_prop_cutoff LOOP
            -- Fetch Box Score monthly data
            SELECT move_ins, move_outs, occupied_units
            INTO v_box
            FROM public.property_box_score_monthly
            WHERE property_id = v_prop.id
              AND fiscal_year = v_fiscal_year
              AND EXTRACT(MONTH FROM report_month) = m
            LIMIT 1;

            -- Fetch Resident Retention monthly data
            SELECT expiring_leases, renewal_percentage
            INTO v_ret
            FROM public.property_resident_retention_monthly
            WHERE property_id = v_prop.id
              AND fiscal_year = v_fiscal_year
              AND EXTRACT(MONTH FROM report_month) = m
            LIMIT 1;

            -- Update occupancy_reforecast_details if matching row exists
            UPDATE public.occupancy_reforecast_details
            SET move_ins = COALESCE(ROUND(v_box.move_ins)::integer, move_ins),
                move_outs = COALESCE(ROUND(v_box.move_outs)::integer, move_outs),
                ending_occ_units = COALESCE(ROUND(v_box.occupied_units)::integer, ending_occ_units),
                lease_expirations = COALESCE(ROUND(v_ret.expiring_leases)::integer, lease_expirations),
                renewal_percent = COALESCE(v_ret.renewal_percentage::double precision, renewal_percent)
            WHERE reforecast_id = v_reforecast_id
              AND month = m;

            IF FOUND THEN
                v_rows_count := v_rows_count + 1;
            END IF;
        END LOOP;
    END LOOP;

    RETURN QUERY SELECT
        true,
        format('Successfully synced actuals to reforecast for %s property(s) and %s detail row(s) through month %s', v_props_count, v_rows_count, COALESCE(v_cutoff_month, 0)),
        v_props_count,
        v_rows_count;
END;
$function$;
