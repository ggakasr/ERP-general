-- ============================================================
-- 032_health_check.sql — Health check RPC (WP-H3)
-- Kiểm tra connectivity, bảng core, config, migration version
-- ============================================================

CREATE OR REPLACE FUNCTION api_health_check()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER STABLE AS $$
DECLARE
  v_tables  jsonb := '{}'::jsonb;
  v_checks  jsonb := '{}'::jsonb;
  v_tbl     text;
  v_cnt     bigint;
  v_mig     text;
BEGIN
  -- 1. Check core tables exist and have rows
  FOR v_tbl IN
    SELECT unnest(ARRAY['tenants','app_users','documents','document_lines',
                         'gl_entries','audit_log','state_transitions','sod_matrix',
                         'roles','permissions'])
  LOOP
    BEGIN
      EXECUTE format('SELECT count(*)::bigint FROM public.%I', v_tbl) INTO v_cnt;
      v_tables := v_tables || jsonb_build_object(v_tbl, v_cnt);
    EXCEPTION WHEN undefined_table THEN
      v_tables := v_tables || jsonb_build_object(v_tbl, -1);
    END;
  END LOOP;

  -- 2. Config checks
  v_checks := v_checks || jsonb_build_object(
    'state_transitions', (SELECT count(*)::int FROM state_transitions) > 0,
    'sod_matrix',        (SELECT count(*)::int FROM sod_matrix) > 0,
    'doc_type_config',   (SELECT count(*)::int FROM doc_type_config) > 0,
    'roles',             (SELECT count(*)::int FROM roles) > 0
  );

  -- 3. Latest migration file (by name sort)
  SELECT name INTO v_mig
  FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'supabase_migrations' AND c.relkind = 'r'
  LIMIT 1;

  IF v_mig IS NOT NULL THEN
    SELECT coalesce(max(version), 'unknown') INTO v_mig
    FROM supabase_migrations.schema_migrations;
  ELSE
    v_mig := 'no_migration_table';
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'ts', now(),
    'version', v_mig,
    'tables', v_tables,
    'checks', v_checks
  );
END;
$$;

GRANT EXECUTE ON FUNCTION api_health_check() TO authenticated;
GRANT EXECUTE ON FUNCTION api_health_check() TO anon;
