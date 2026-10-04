-- Read-only checks for 0032_remove_unused_saas_modules.sql.
-- Run once in the Supabase SQL Editor after 0032 has been applied.
-- Do not run this file before 0032. It does not drop or update anything.
-- A failed check raises an exception. A clean run returns one row: ok.

do $verify$
declare
  v_missing text;
  v_present text;
  v_job integer;
  v_other_jobs integer;
begin
  -- 1. Retired tables are gone.
  select string_agg(name, ', ')
    into v_present
  from (
    select unnest(array[
      'branches',
      'employees',
      'employee_documents',
      'tasks',
      'company_activity',
      'notifications',
      'plans',
      'company_subscriptions',
      'platform_admins'
    ]) as name
  ) wanted
  where to_regclass('public.' || wanted.name) is not null;

  if v_present is not null then
    raise exception 'retired tables still exist: %', v_present;
  end if;

  -- 2. Only the notification job is gone. pg_cron itself stays.
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise exception 'pg_cron extension is missing';
  end if;

  select count(*)
    into v_job
  from cron.job
  where jobname = 'generate_notifications_hourly'
     or position('generate_notifications' in command) > 0;

  if v_job <> 0 then
    raise exception 'generate_notifications is still scheduled';
  end if;

  -- 3 and 4. Office tables and the company session tables remain.
  select string_agg(name, ', ')
    into v_missing
  from (
    select unnest(array[
      'profiles',
      'companies',
      'company_members',
      'user_active_company',
      'customers',
      'transactions',
      'services',
      'profit_corrections',
      'transaction_profit_changes',
      'transaction_deletions'
    ]) as name
  ) wanted
  where to_regclass('public.' || wanted.name) is null;

  if v_missing is not null then
    raise exception 'preserved tables are missing: %', v_missing;
  end if;

  select string_agg(format('%s.%s', tables.table_name, cols.column_name), ', ')
    into v_missing
  from (
    select unnest(array['customers', 'transactions', 'services']) as table_name
  ) tables
  cross join (
    select unnest(array['company_id']) as column_name
  ) cols
  where not exists (
    select 1
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = tables.table_name
      and c.column_name = cols.column_name
  );

  if v_missing is not null then
    raise exception 'company_id is missing: %', v_missing;
  end if;

  if not exists (
    select 1
    from information_schema.views
    where table_schema = 'public'
      and table_name in ('transaction_details', 'customer_summary')
    having count(*) = 2
  ) then
    raise exception 'transaction_details or customer_summary is missing';
  end if;

  -- 5. Office functions remain. Retired functions are gone.
  select string_agg(name, ', ')
    into v_missing
  from (
    select unnest(array[
      'handle_new_user',
      'current_company_id',
      'is_company_member',
      'has_company_role',
      'set_active_company',
      'finance_company_id',
      'dashboard_stats',
      'office_profit_totals',
      'transaction_office_profits',
      'service_commissions',
      'profit_report',
      'admin_update_transaction_profit',
      'admin_delete_transaction',
      'set_transaction_status',
      'transactions_copy_catalog_profit'
    ]) as name
  ) wanted
  where not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = wanted.name
  );

  if v_missing is not null then
    raise exception 'preserved functions are missing: %', v_missing;
  end if;

  select string_agg(name, ', ')
    into v_present
  from (
    select unnest(array[
      'guard_hr_tenant',
      'guard_task_write',
      'guard_company_activity',
      'log_hr_activity',
      'is_platform_admin',
      'guard_billing_write',
      'can_read_company_member_directory',
      'guard_notification_write',
      'generate_notifications'
    ]) as name
  ) wanted
  where exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = wanted.name
  );

  if v_present is not null then
    raise exception 'retired functions still exist: %', v_present;
  end if;

  -- 6. API roles have no direct SELECT on the financial columns.
  -- information_schema.column_privileges also lists table-level INSERT and
  -- UPDATE on every column. 0031 kept those grants and removed only SELECT,
  -- so this check names anon and authenticated and tests SELECT alone.
  -- A grant to PUBLIC is included by has_column_privilege. The SQL Editor
  -- owner is not the role under test.
  if has_column_privilege('anon', 'public.transactions', 'profit', 'SELECT')
     or has_column_privilege('authenticated', 'public.transactions', 'profit', 'SELECT')
     or has_column_privilege('anon', 'public.services', 'commission', 'SELECT')
     or has_column_privilege('authenticated', 'public.services', 'commission', 'SELECT')
  then
    raise exception 'anon or authenticated can still select profit or commission';
  end if;

  select string_agg(column_name, ', ')
    into v_missing
  from (
    select unnest(array[
      'id', 'customer_id', 'service_name', 'note', 'created_by', 'created_at',
      'transaction_value', 'status', 'cancel_reason', 'company_id'
    ]) as column_name
  ) wanted
  where not exists (
    select 1
    from information_schema.column_privileges c
    where c.table_schema = 'public'
      and c.table_name = 'transactions'
      and c.grantee = 'authenticated'
      and c.privilege_type = 'SELECT'
      and c.column_name = wanted.column_name
  );

  if v_missing is not null then
    raise exception 'transaction columns are no longer selectable: %', v_missing;
  end if;

  select string_agg(column_name, ', ')
    into v_missing
  from (
    select unnest(array[
      'id', 'name', 'transaction_value', 'manual', 'sort_order', 'category', 'steps', 'company_id'
    ]) as column_name
  ) wanted
  where not exists (
    select 1
    from information_schema.column_privileges c
    where c.table_schema = 'public'
      and c.table_name = 'services'
      and c.grantee = 'authenticated'
      and c.privilege_type = 'SELECT'
      and c.column_name = wanted.column_name
  );

  if v_missing is not null then
    raise exception 'service columns are no longer selectable: %', v_missing;
  end if;

  -- 7. Office and company-session policies remain. The task directory policy does not.
  if exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in (
        'customers', 'transactions', 'services',
        'companies', 'company_members', 'user_active_company'
      )
      and c.relrowsecurity is not true
  ) then
    raise exception 'row security is off on an office or company table';
  end if;

  select string_agg(format('%s.%s', wanted.tablename, wanted.policyname), ', ')
    into v_missing
  from (
    values
      ('customers', 'customers_select'),
      ('customers', 'customers_insert'),
      ('transactions', 'transactions_select'),
      ('transactions', 'transactions_insert'),
      ('services', 'services_select'),
      ('companies', 'companies_select_member'),
      ('company_members', 'company_members_select_own'),
      ('user_active_company', 'user_active_company_select_own'),
      ('profit_corrections', 'profit_corrections_select'),
      ('transaction_profit_changes', 'transaction_profit_changes_select'),
      ('transaction_deletions', 'transaction_deletions_select')
  ) as wanted(tablename, policyname)
  where not exists (
    select 1
    from pg_policies p
    where p.schemaname = 'public'
      and p.tablename = wanted.tablename
      and p.policyname = wanted.policyname
  );

  if v_missing is not null then
    raise exception 'office policies are missing: %', v_missing;
  end if;

  if exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'company_members'
      and policyname = 'company_members_select_directory'
  ) then
    raise exception 'company_members_select_directory is still present';
  end if;

  -- 8. 0031 finance execute grants remain, and internal helpers stay closed.
  select string_agg(name, ', ')
    into v_missing
  from (
    select unnest(array[
      'office_profit_totals',
      'transaction_office_profits',
      'service_commissions',
      'profit_report',
      'dashboard_stats',
      'admin_update_transaction_profit',
      'admin_delete_transaction',
      'set_transaction_status'
    ]) as name
  ) wanted
  where not exists (
    select 1
    from information_schema.routine_privileges r
    where r.specific_schema = 'public'
      and r.routine_name = wanted.name
      and r.grantee = 'authenticated'
      and r.privilege_type = 'EXECUTE'
  );

  if v_missing is not null then
    raise exception 'authenticated execute is missing: %', v_missing;
  end if;

  if exists (
    select 1
    from information_schema.routine_privileges
    where specific_schema = 'public'
      and routine_name in ('finance_company_id', 'transactions_copy_catalog_profit')
      and grantee in ('PUBLIC', 'anon', 'authenticated', 'service_role')
      and privilege_type = 'EXECUTE'
  ) then
    raise exception 'finance_company_id or transactions_copy_catalog_profit is executable by an API role';
  end if;

  -- 9. No remaining function source uses a qualified or SQL-clause reference
  --    to a retired table. A bare word in a comment is not a match.
  --    pg_get_functiondef rejects aggregates, so only ordinary functions and
  --    procedures are read, and only after that set is materialized.
  if exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = any (array[
        'branches', 'employees', 'employee_documents', 'tasks', 'company_activity',
        'notifications', 'plans', 'company_subscriptions', 'platform_admins'
      ])
  ) then
    raise exception 'a retired table is still present for the dependency check';
  end if;

  with eligible as materialized (
    select p.oid, p.proname
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind in ('f', 'p')
  )
  select string_agg(format('%I(%s)', eligible.proname, pg_get_function_identity_arguments(eligible.oid)), ', ')
    into v_present
  from eligible
  where pg_get_functiondef(eligible.oid) ~*
      'public\.(branches|employees|employee_documents|tasks|company_activity|notifications|plans|company_subscriptions|platform_admins)\M|\m(from|join|update|into|table)\s+(public\.)?(branches|employees|employee_documents|tasks|company_activity|notifications|plans|company_subscriptions|platform_admins)\M|tg_table_name\s*=\s*''(branches|employees|employee_documents|tasks|company_activity|notifications|plans|company_subscriptions|platform_admins)''';

  if v_present is not null then
    raise exception 'a remaining function still references a retired table: %', v_present;
  end if;

  with preserved_views as materialized (
    select c.oid, c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('v', 'm')
  )
  select string_agg(format('%I', preserved_views.relname), ', ')
    into v_present
  from preserved_views
  where pg_get_viewdef(preserved_views.oid) ~*
      'public\.(branches|employees|employee_documents|tasks|company_activity|notifications|plans|company_subscriptions|platform_admins)\M|\m(from|join)\s+(public\.)?(branches|employees|employee_documents|tasks|company_activity|notifications|plans|company_subscriptions|platform_admins)\M';

  if v_present is not null then
    raise exception 'a remaining view still references a retired table: %', v_present;
  end if;

  select count(*)
    into v_other_jobs
  from cron.job
  where jobname is distinct from 'generate_notifications_hourly';

  raise notice '0032 verification passed. other cron jobs left in place: %', v_other_jobs;
end
$verify$;

select 'ok' as result;
