-- Read-only checks for 0031_profit_access_hardening.sql.
-- Run once in the Supabase SQL Editor after 0031 has been applied.
-- This session is postgres and bypasses row security, so it cannot prove
-- what a manager JWT receives. Those API checks are listed at the bottom.
-- Expect: every query below returns zero unexpected rows, and the column
-- and policy queries return the rows described in their comments.

-- 1. Restricted columns are not selectable by API roles.
select table_name, column_name, grantee, privilege_type
from information_schema.column_privileges
where table_schema = 'public'
  and grantee in ('authenticated', 'anon', 'PUBLIC')
  and (
    (table_name = 'transactions' and column_name = 'profit')
    or (table_name = 'services' and column_name = 'commission')
  )
order by 1, 2, 3;
-- Expect zero rows.

-- 2. Ordinary transaction columns remain selectable.
select column_name
from information_schema.column_privileges
where table_schema = 'public'
  and table_name = 'transactions'
  and grantee = 'authenticated'
  and privilege_type = 'SELECT'
  and column_name in (
    'id', 'customer_id', 'service_name', 'note', 'created_by', 'created_at',
    'transaction_value', 'status', 'cancel_reason', 'company_id'
  )
order by 1;
-- Expect all 10 names.

-- 3. Commission is absent. transaction_value and catalog fields remain.
select column_name
from information_schema.column_privileges
where table_schema = 'public'
  and table_name = 'services'
  and grantee = 'authenticated'
  and privilege_type = 'SELECT'
order by 1;
-- Expect id, name, transaction_value, manual, sort_order, category, steps, company_id.
-- Do not expect commission.

-- 4. Shared views do not mention profit and stay security invoker.
select c.relname,
       c.reloptions,
       pg_get_viewdef(c.oid, true) as definition
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'v'
  and c.relname in ('transaction_details', 'customer_summary')
order by 1;
-- Expect security_invoker=true on both.
-- Expect neither definition to contain profit or total_profit.
-- Expect customer_summary to contain total_transaction_value.

-- 5. Financial functions are definer, pinned, and do not trust platform admin
--    or profiles.role. dashboard_stats is invoker and has no profit.
select p.proname,
       p.prosecdef as security_definer,
       p.proconfig
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'finance_company_id',
    'office_profit_totals',
    'transaction_office_profits',
    'service_commissions',
    'profit_report',
    'dashboard_stats',
    'admin_update_transaction_profit',
    'transactions_copy_catalog_profit'
  )
order by 1;
-- Expect security_definer true except dashboard_stats.
-- Expect search_path=public on each proconfig.

select p.proname
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'finance_company_id',
    'office_profit_totals',
    'transaction_office_profits',
    'service_commissions',
    'profit_report',
    'dashboard_stats'
  )
  and (
    pg_get_functiondef(p.oid) ilike '%is_platform_admin%'
    or pg_get_functiondef(p.oid) ilike '%profiles.role%'
    or (
      p.proname = 'dashboard_stats'
      and pg_get_functiondef(p.oid) ilike '%profit%'
    )
    or (
      p.proname = 'profit_report'
      and pg_get_functiondef(p.oid) not ilike '%current_company_id%'
      and pg_get_functiondef(p.oid) not ilike '%finance_company_id%'
    )
  )
order by 1;
-- Expect zero rows.

-- 6. Execute grants. service_role and anon must not have the new financial RPCs.
--    finance_company_id and the insert trigger must not be executable by API roles.
select routine_name, grantee, privilege_type
from information_schema.routine_privileges
where specific_schema = 'public'
  and routine_name in (
    'finance_company_id',
    'office_profit_totals',
    'transaction_office_profits',
    'service_commissions',
    'profit_report',
    'dashboard_stats',
    'admin_update_transaction_profit',
    'transactions_copy_catalog_profit'
  )
  and grantee in ('PUBLIC', 'anon', 'authenticated', 'service_role')
order by 1, 2;
-- Expect authenticated execute on office_profit_totals, transaction_office_profits,
-- service_commissions, profit_report, dashboard_stats, and admin_update_transaction_profit.
-- Expect no service_role, anon, or PUBLIC rows for the financial RPCs,
-- finance_company_id, or transactions_copy_catalog_profit.

-- 7. History policies.
select tablename, policyname, cmd, qual
from pg_policies
where schemaname = 'public'
  and tablename in (
    'profit_corrections',
    'transaction_profit_changes',
    'transaction_deletions'
  )
  and cmd = 'SELECT'
order by 1, 2;
-- Expect each qual to require owner/admin via has_company_role.
-- Expect no insert policy on profit_corrections.

select tablename, policyname, cmd
from pg_policies
where schemaname = 'public'
  and tablename = 'profit_corrections'
  and cmd = 'INSERT';
-- Expect zero rows.

-- Manual API tests this script cannot prove, using a real user JWT:
-- manager: transactions?select=profit is denied
-- user: services?select=commission is denied
-- manager: rpc/office_profit_totals, rpc/transaction_office_profits,
--   rpc/service_commissions, and rpc/profit_report are denied
-- user: rpc/dashboard_stats returns counts and no profit keys
-- manager: transaction_details and customer_summary responses contain no profit
-- manager: profit_corrections returns no rows
-- owner: the same financial RPCs return only the active company
-- a transaction id from another company is absent from transaction_office_profits
-- a forged company_id in the RPC body is ignored because the functions take none
-- manager/user catalog insert succeeds and stores the catalog commission
-- a caller-supplied profit on a catalog service is ignored
-- manager/user manual insert is denied
-- an unknown service_name insert is denied for every role
-- owner/admin manual insert with a valid profit succeeds
-- a later select=profit by manager/user is denied
