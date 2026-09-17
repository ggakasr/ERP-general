-- ERP General — 006 Security gate (ĐK8, P14)
-- Principle: clients never touch business tables directly.
--   * Reference/master data: SELECT only (RLS: authenticated).
--   * Documents, ledgers, audit, SoD log, handoffs, notifications, employees: no table grants —
--     only reachable through api_* functions that enforce role × scope × field.
--   * All writes go through api_* functions (state machine + SoD + audit).

DO $$
DECLARE t record;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.tablename);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t.tablename);
  END LOOP;
END $$;

REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['branches','departments','roles','accounts','partners','products','warehouses','boms','bom_lines',
    'fiscal_periods','doc_types','state_transitions','doc_child_rules','handoff_map','sod_matrix','ownership_matrix',
    'data_dictionary','kpi_catalog','shadow_it_register','impact_matrix','acceptance_criteria','permission_matrix',
    'app_users','user_roles']
  LOOP
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
    EXECUTE format('CREATE POLICY read_authenticated ON public.%I FOR SELECT TO authenticated USING (true)', t);
  END LOOP;
END $$;

-- functions: nothing executable by default, then only api_* for signed-in users
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;

DO $$
DECLARE f record;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure AS sig FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname LIKE 'api\_%'
  LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', f.sig);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
