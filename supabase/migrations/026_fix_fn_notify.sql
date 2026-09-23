-- 026_fix_fn_notify.sql  WP-F2: remove ambiguous fn_notify(uuid,text,text,uuid) overload
-- 016_fix_tenant_engine.sql added fn_notify(uuid,text,text,uuid, uuid DEFAULT NULL).
-- The old fn_notify(uuid,text,text,uuid) from 004_engine.sql / 010_email_outbox.sql
-- is still present. PostgreSQL treats the 5-arg-with-default as ambiguous when called
-- with 4 args → ERROR "function fn_notify(uuid,text,text,uuid) is not unique".
-- Fix: drop the 4-arg version; all callers use the DEFAULT for p_tenant_id.

DROP FUNCTION IF EXISTS fn_notify(uuid, text, text, uuid);
