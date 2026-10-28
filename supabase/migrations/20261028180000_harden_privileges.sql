-- Kruispad hardening (GST-459 go-live): lock down function/table privileges in the shared project.
-- Already applied on prod (GekkoFlow-DB); this migration is idempotent for fresh / re-run applies.
-- Postgres grants EXECUTE to PUBLIC by default, which exposed the actor-explicit apply_* functions
-- and mint_action_token to anon/authenticated once the schema is exposed via PostgREST.

do $$
begin
  if not exists (select 1 from pg_namespace where nspname = 'kruispad') then
    raise notice 'schema kruispad missing — skip harden';
    return;
  end if;

  -- Idempotent privilege lockdown
  revoke execute on all functions in schema kruispad from public, anon, authenticated;
  alter default privileges in schema kruispad revoke execute on functions from public;

  -- RLS helpers (evaluated as the invoking role inside policies)
  grant execute on function kruispad.is_admin() to authenticated;
  grant execute on function kruispad.current_role() to authenticated;

  -- Signed-in session wrappers
  grant execute on function kruispad.create_payment_request(date, text, kruispad.payment_type, text, numeric) to authenticated;
  grant execute on function kruispad.save_payment_request(uuid, date, text, kruispad.payment_type, text, numeric) to authenticated;
  grant execute on function kruispad.submit_payment_request(uuid) to authenticated;
  grant execute on function kruispad.register_attachment(uuid, text, text, text, bigint) to authenticated;
  grant execute on function kruispad.admin_set_role(uuid, kruispad.app_role) to authenticated;
  grant execute on function kruispad.fred_approve(uuid) to authenticated;
  grant execute on function kruispad.fred_decline(uuid, text) to authenticated;
  grant execute on function kruispad.anton_approve(uuid) to authenticated;
  grant execute on function kruispad.anton_decline(uuid, text) to authenticated;
  grant execute on function kruispad.finance_pay(uuid) to authenticated;
  grant execute on function kruispad.finance_decline(uuid, text) to authenticated;
  grant execute on function kruispad.print_document(uuid) to authenticated;

  -- Server (service_role) only: token mint/peek/execute and internals. The Vercel API uses the service role.
  grant execute on all functions in schema kruispad to service_role;
  grant all on all tables in schema kruispad to service_role;
  alter default privileges in schema kruispad grant all on tables to service_role;
  alter default privileges in schema kruispad grant execute on functions to service_role;

  -- anon has no business reading anything in the schema
  revoke all on all tables in schema kruispad from anon;
  revoke usage on schema kruispad from anon;

  perform pg_notify('pgrst', 'reload schema');
end
$$;
