-- Read-only checks for 0034_service_quote_commission.sql.
-- Run once in the Supabase SQL Editor after 0034 has been applied.
-- This session is postgres and bypasses row security, so it cannot prove
-- what a member JWT receives. Those API checks are listed at the bottom.
-- Expect: every failing query below returns zero rows, and the privilege
-- queries return only the grants described in their comments.

-- 1. Direct commission and profit SELECT stay denied.
select table_name, column_name, grantee, privilege_type
from information_schema.column_privileges
where table_schema = 'public'
  and grantee in ('authenticated', 'anon', 'PUBLIC')
  and (
    (table_name = 'services' and column_name = 'commission')
    or (table_name = 'transactions' and column_name = 'profit')
  )
order by 1, 2, 3;
-- Expect zero rows.

-- 2. The quote RPC is a zero-argument definer function pinned to public.
select p.proname,
       p.pronargs,
       p.prosecdef as security_definer,
       p.proconfig
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'service_quote_commissions';
-- Expect one row: pronargs 0, security_definer true, search_path=public.

-- 3. The quote RPC resolves the company on the server and returns commission only.
select p.proname
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'service_quote_commissions'
  and (
    pg_get_function_identity_arguments(p.oid) <> ''
    or pg_get_functiondef(p.oid) not ilike '%auth.uid()%'
    or pg_get_functiondef(p.oid) not ilike '%current_company_id()%'
    or pg_get_functiondef(p.oid) not ilike '%is_company_member%'
    or pg_get_functiondef(p.oid) ilike '%finance_company_id%'
    or pg_get_functiondef(p.oid) ilike '%p_company%'
    or pg_get_functiondef(p.oid) ilike '%transactions%'
    or pg_get_functiondef(p.oid) ilike '%profit%'
  );
-- Expect zero rows.

-- 4. Execute grants. authenticated only.
select routine_name, grantee, privilege_type
from information_schema.routine_privileges
where specific_schema = 'public'
  and routine_name = 'service_quote_commissions'
  and grantee in ('PUBLIC', 'anon', 'authenticated', 'service_role')
order by 2;
-- Expect one row: authenticated EXECUTE.
-- Expect no PUBLIC, anon, or service_role row.

-- 5. Owner/admin financial RPCs are unchanged: still definer and still gated.
select p.proname
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'service_commissions',
    'transaction_office_profits',
    'office_profit_totals',
    'profit_report'
  )
  and (
    not p.prosecdef
    or pg_get_functiondef(p.oid) not ilike '%finance_company_id%'
  )
order by 1;
-- Expect zero rows.

-- 6. finance_company_id still requires owner/admin and is not executable by API roles.
select p.proname
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'finance_company_id'
  and pg_get_functiondef(p.oid) not ilike '%owner%admin%';
-- Expect zero rows.

select routine_name, grantee
from information_schema.routine_privileges
where specific_schema = 'public'
  and routine_name in ('finance_company_id', 'transactions_copy_catalog_profit')
  and grantee in ('PUBLIC', 'anon', 'authenticated', 'service_role');
-- Expect zero rows.

-- 7. A normal member still cannot update a service. The update policy is owner/admin.
select policyname, cmd, qual
from pg_policies
where schemaname = 'public'
  and tablename = 'services'
  and cmd = 'UPDATE'
  and (
    qual not ilike '%has_company_role%'
    or qual not ilike '%owner%'
    or qual not ilike '%admin%'
  );
-- Expect zero rows.

-- 8. Catalog insert still copies commission inside the database.
select p.proname
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'transactions_copy_catalog_profit'
  and (
    not p.prosecdef
    or pg_get_functiondef(p.oid) not ilike '%s.commission%'
    or pg_get_functiondef(p.oid) not ilike '%new.profit%'
  );
-- Expect zero rows.

-- Manual API tests this script cannot prove, using a real user JWT:
-- user/manager: rpc/service_quote_commissions returns only the active company's
--   service id and commission
-- user/manager: a forged company_id in the RPC body is ignored because the
--   function takes no arguments
-- user/manager: services?select=commission is denied
-- user/manager: transactions?select=profit is denied
-- user/manager: rpc/service_commissions, rpc/transaction_office_profits,
--   rpc/office_profit_totals, and rpc/profit_report are denied
-- user/manager: update services set commission is denied
-- user/manager: a catalog transaction insert does not need a client profit,
--   and the stored profit equals the catalog commission
-- owner/admin: service_commissions and the profit RPCs still return only the
--   active company
-- anon: rpc/service_quote_commissions is denied
