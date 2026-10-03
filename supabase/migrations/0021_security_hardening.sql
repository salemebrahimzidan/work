-- Pin search_path and remove unused PUBLIC/anon EXECUTE grants.
-- Function bodies, triggers, RLS, and existing data are unchanged.

-- Pin search_path. pg_catalog remains first.
alter function public.app_timezone() set search_path = public;
alter function public.guard_customer_metadata() set search_path = public;
alter function public.block_write() set search_path = public;
alter function public.assign_new_transaction_id() set search_path = public;
alter function public.guard_transaction_delete() set search_path = public;
alter function public.guard_transaction_update() set search_path = public;
alter function public.normalize_mobile(text) set search_path = public;

-- Stop anon and PUBLIC from calling definer helpers. Members still can.
revoke all on function public.is_admin() from public, anon;
revoke all on function public.is_member() from public, anon;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_member() to authenticated;

-- Signup trigger: only the auth service role.
revoke all on function public.handle_new_user() from public, anon, authenticated;
grant execute on function public.handle_new_user() to supabase_auth_admin;

-- Other SECURITY DEFINER triggers: not anon RPCs.
revoke all on function public.guard_profile_role() from public, anon;
revoke all on function public.prepare_profit_correction() from public, anon;
grant execute on function public.guard_profile_role() to authenticated;
grant execute on function public.prepare_profit_correction() to authenticated;

-- Invoker triggers and timezone helper.
revoke all on function public.app_timezone() from public, anon;
revoke all on function public.guard_customer_metadata() from public, anon;
revoke all on function public.block_write() from public, anon;
revoke all on function public.assign_new_transaction_id() from public, anon;
revoke all on function public.guard_transaction_delete() from public, anon;
revoke all on function public.guard_transaction_update() from public, anon;
grant execute on function public.app_timezone() to authenticated;
grant execute on function public.guard_customer_metadata() to authenticated;
grant execute on function public.block_write() to authenticated;
grant execute on function public.assign_new_transaction_id() to authenticated;
grant execute on function public.guard_transaction_delete() to authenticated;
grant execute on function public.guard_transaction_update() to authenticated;
