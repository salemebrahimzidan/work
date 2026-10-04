-- Remove retired SaaS/HR modules. Does not apply itself.
-- Does not change customers, transactions, services, profit history, profiles,
-- companies, company_members, user_active_company, or migration 0031.
-- Does not drop company_id. Does not replace company-role authorization.
-- Applied migrations 0001–0031 are left unchanged.
--
-- The whole script is one transaction. BEGIN is first. COMMIT runs only after
-- cleanup and the final assertions. A failed check or DROP aborts the
-- transaction, so nothing is committed and the session can ROLLBACK.
--
-- When this file is later applied, every row in the retired tables is deleted:
--   branches, employees, employee_documents (metadata only; no storage bucket),
--   tasks, company_activity, notifications,
--   plans (including the seeded code 'legacy' / الباقة الحالية),
--   company_subscriptions (including the row for الإيمان روح الذهبية),
--   platform_admins (0027 does not seed this table).
-- companies, company_members, profiles, and office rows are not deleted.
--
-- No DROP ... CASCADE.
-- is_platform_admin() is language sql, so PostgreSQL records its dependency on
-- platform_admins. The policies that call it are dropped, then the function,
-- then the table. Pl/pgSQL retired functions do not record table dependencies;
-- their triggers are dropped explicitly before the functions.

begin;

-- ----------------------------------------------------------------------------
-- Preflight. No unschedule, policy drop, table drop, or function drop.
-- ----------------------------------------------------------------------------
do $preflight$
declare
  v_bad text;
  v_total integer;
  v_names integer;
  v_with_args integer;
  retired_tables text[] := array[
    'branches',
    'employees',
    'employee_documents',
    'tasks',
    'company_activity',
    'notifications',
    'plans',
    'company_subscriptions',
    'platform_admins'
  ];
  retired_functions text[] := array[
    'generate_notifications',
    'guard_notification_write',
    'log_hr_activity',
    'guard_task_write',
    'guard_company_activity',
    'guard_hr_tenant',
    'guard_billing_write',
    'is_platform_admin',
    'can_read_company_member_directory'
  ];
  retired_reference text :=
    'public\.(branches|employees|employee_documents|tasks|company_activity|notifications|plans|company_subscriptions|platform_admins)\M'
    '|\m(from|join|update|into|table)\s+(public\.)?(branches|employees|employee_documents|tasks|company_activity|notifications|plans|company_subscriptions|platform_admins)\M'
    '|tg_table_name\s*=\s*''(branches|employees|employee_documents|tasks|company_activity|notifications|plans|company_subscriptions|platform_admins)''';
begin
  if to_regclass('public.companies') is null
     or to_regclass('public.company_members') is null
     or to_regclass('public.user_active_company') is null
     or to_regclass('public.customers') is null
     or to_regclass('public.transactions') is null
     or to_regclass('public.services') is null
     or to_regclass('public.profit_corrections') is null
     or to_regclass('public.transaction_profit_changes') is null
     or to_regclass('public.transaction_deletions') is null
     or to_regclass('public.profiles') is null
  then
    raise exception 'an office table is missing; cleanup was not started';
  end if;

  if not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'transactions_copy_catalog_profit'
      and pg_get_function_identity_arguments(p.oid) = ''
  ) or not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'finance_company_id'
      and pg_get_function_identity_arguments(p.oid) = ''
  ) then
    raise exception '0031 finance helper is missing; cleanup was not started';
  end if;

  -- Exact signatures from pg_proc. Each retired function must exist once,
  -- with an empty argument list. DROP FUNCTION name() targets that signature.
  select count(*),
         count(distinct p.proname),
         count(*) filter (where pg_get_function_identity_arguments(p.oid) <> '')
    into v_total, v_names, v_with_args
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = any (retired_functions);

  if v_total <> 9 or v_names <> 9 or v_with_args <> 0 then
    select string_agg(
      format('%I(%s)', p.proname, pg_get_function_identity_arguments(p.oid)),
      ', ' order by p.proname
    )
      into v_bad
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = any (retired_functions);

    raise exception 'retired function signatures are not the nine zero-argument functions: %', coalesce(v_bad, 'none found');
  end if;

  -- Preserved tables must not reference a retired table.
  select string_agg(format('%I.%I -> %I.%I', sn.nspname, src.relname, dn.nspname, dst.relname), ', ')
    into v_bad
  from pg_constraint fk
  join pg_class src on src.oid = fk.conrelid
  join pg_namespace sn on sn.oid = src.relnamespace
  join pg_class dst on dst.oid = fk.confrelid
  join pg_namespace dn on dn.oid = dst.relnamespace
  where fk.contype = 'f'
    and dn.nspname = 'public'
    and dst.relname = any (retired_tables)
    and not (sn.nspname = 'public' and src.relname = any (retired_tables));

  if v_bad is not null then
    raise exception 'preserved table still references a retired table: %', v_bad;
  end if;

  -- Fail only for a preserved view or materialized view.
  -- No retired view or materialized view is defined on these tables.
  select string_agg(
    format('%s %I depends on %I', case view_rel.relkind when 'm' then 'materialized view' else 'view' end, view_rel.relname, retired_rel.relname),
    ', '
  )
    into v_bad
  from pg_depend d
  join pg_rewrite rewrite on rewrite.oid = d.objid and d.classid = 'pg_rewrite'::regclass
  join pg_class view_rel on view_rel.oid = rewrite.ev_class
  join pg_namespace view_ns on view_ns.oid = view_rel.relnamespace
  join pg_class retired_rel on retired_rel.oid = d.refobjid and d.refclassid = 'pg_class'::regclass
  join pg_namespace retired_ns on retired_ns.oid = retired_rel.relnamespace
  where view_ns.nspname = 'public'
    and view_rel.relkind in ('v', 'm')
    and retired_ns.nspname = 'public'
    and retired_rel.relname = any (retired_tables)
    and view_rel.relname <> all (retired_tables);

  if v_bad is not null then
    raise exception 'preserved view still depends on a retired table: %', v_bad;
  end if;

  -- Catalog dependencies. Language sql records these. Pl/pgSQL does not.
  select string_agg(
    format('%I(%s) depends on %I', p.proname, pg_get_function_identity_arguments(p.oid), c.relname),
    ', '
  )
    into v_bad
  from pg_depend d
  join pg_proc p on p.oid = d.objid and d.classid = 'pg_proc'::regclass
  join pg_namespace pn on pn.oid = p.pronamespace
  join pg_class c on c.oid = d.refobjid and d.refclassid = 'pg_class'::regclass
  join pg_namespace cn on cn.oid = c.relnamespace
  where pn.nspname = 'public'
    and cn.nspname = 'public'
    and c.relname = any (retired_tables)
    and p.proname <> all (retired_functions)
    and d.deptype in ('n', 'a');

  if v_bad is not null then
    raise exception 'preserved function still depends on a retired table: %', v_bad;
  end if;

  -- Additional source check. Matches schema-qualified names and SQL clauses,
  -- not a bare word in a comment or another function's name.
  select string_agg(
    format('%I(%s)', p.proname, pg_get_function_identity_arguments(p.oid)),
    ', '
  )
    into v_bad
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'

  
    and p.proname <> all (retired_functions)
    and pg_get_functiondef(p.oid) ~* retired_reference;

  if v_bad is not null then
    raise exception 'preserved function source still references a retired table: %', v_bad;
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'company_members'
      and policyname = 'company_members_select_own'
  ) then
    raise exception 'company_members_select_own is missing; cleanup was not started';
  end if;

  select string_agg(format('%s.%s', wanted.tablename, wanted.policyname), ', ')
    into v_bad
  from (
    values
      ('company_members', 'company_members_select_directory'),
      ('plans', 'plans_select_platform'),
      ('platform_admins', 'platform_admins_select_self')
  ) as wanted(tablename, policyname)
  where not exists (
    select 1
    from pg_policies p
    where p.schemaname = 'public'
      and p.tablename = wanted.tablename
      and p.policyname = wanted.policyname
  );

  if v_bad is not null then
    raise exception 'a retired policy is missing; cleanup was not started: %', v_bad;
  end if;

  select string_agg(format('%s.%s', wanted.table_name, wanted.trigger_name), ', ')
    into v_bad
  from (
    values
      ('notifications', 'notifications_guard_write'),
      ('company_activity', 'company_activity_guard'),
      ('tasks', 'tasks_guard_write'),
      ('tasks', 'tasks_log_activity'),
      ('employees', 'employees_log_activity'),
      ('employee_documents', 'employee_documents_log_activity'),
      ('branches', 'branches_guard_tenant'),
      ('employees', 'employees_guard_tenant'),
      ('employee_documents', 'employee_documents_guard_tenant'),
      ('plans', 'plans_guard_write'),
      ('company_subscriptions', 'company_subscriptions_guard_write'),
      ('platform_admins', 'platform_admins_guard_write')
  ) as wanted(table_name, trigger_name)
  where not exists (
    select 1
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = wanted.table_name
      and t.tgname = wanted.trigger_name
      and not t.tgisinternal
  );

  if v_bad is not null then
    raise exception 'a retired trigger is missing; cleanup was not started: %', v_bad;
  end if;

  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise exception 'pg_cron is not installed; cleanup was not started';
  end if;

  if exists (
    select 1
    from cron.job
    where position('generate_notifications' in command) > 0
      and jobname is distinct from 'generate_notifications_hourly'
  ) then
    raise exception 'another cron job calls generate_notifications; cleanup was not started';
  end if;

  if exists (
    select 1
    from cron.job
    where jobname = 'generate_notifications_hourly'
      and command is distinct from 'select public.generate_notifications();'
  ) then
    raise exception 'generate_notifications_hourly does not run the expected command; cleanup was not started';
  end if;
end
$preflight$;

-- ----------------------------------------------------------------------------
-- Cleanup. The preflight above has already passed.
-- ----------------------------------------------------------------------------
do $cron$
declare
  v_other_before integer;
  v_other_after integer;
begin
  select count(*)
    into v_other_before
  from cron.job
  where jobname is distinct from 'generate_notifications_hourly';

  if exists (
    select 1
    from cron.job
    where jobname = 'generate_notifications_hourly'
  ) then
    perform cron.unschedule('generate_notifications_hourly');
  end if;

  if exists (
    select 1
    from cron.job
    where jobname = 'generate_notifications_hourly'
       or (
         position('generate_notifications' in command) > 0
         and jobname is distinct from 'generate_notifications_hourly'
       )
  ) then
    raise exception 'generate_notifications is still scheduled';
  end if;

  select count(*)
    into v_other_after
  from cron.job
  where jobname is distinct from 'generate_notifications_hourly';

  if v_other_after is distinct from v_other_before then
    raise exception 'an unrelated cron job was changed';
  end if;
end
$cron$;

-- Policies that call a retired function must go before that function.
-- company_members itself stays, including company_members_select_own.
drop policy company_members_select_directory on public.company_members;
drop policy plans_select_platform on public.plans;
drop policy platform_admins_select_self on public.platform_admins;

-- Triggers depend on the functions. Drop the triggers before the functions.
drop trigger notifications_guard_write on public.notifications;
drop trigger company_activity_guard on public.company_activity;
drop trigger tasks_guard_write on public.tasks;
drop trigger tasks_log_activity on public.tasks;
drop trigger employees_log_activity on public.employees;
drop trigger employee_documents_log_activity on public.employee_documents;
drop trigger branches_guard_tenant on public.branches;
drop trigger employees_guard_tenant on public.employees;
drop trigger employee_documents_guard_tenant on public.employee_documents;
drop trigger plans_guard_write on public.plans;
drop trigger company_subscriptions_guard_write on public.company_subscriptions;
drop trigger platform_admins_guard_write on public.platform_admins;

-- Confirmed zero-argument signatures. Parentheses select that overload only.
-- is_platform_admin() is dropped before platform_admins because it is language sql.
drop function public.generate_notifications();
drop function public.guard_notification_write();
drop function public.log_hr_activity();
drop function public.guard_task_write();
drop function public.guard_company_activity();
drop function public.guard_hr_tenant();
drop function public.guard_billing_write();
drop function public.is_platform_admin();
drop function public.can_read_company_member_directory();

-- Child tables before the retired tables they reference.
-- notifications and company_activity reference only preserved tables.
-- tasks references branches and employees.
-- employee_documents references employees. employees references branches.
-- company_subscriptions references plans.
drop table public.notifications;
drop table public.company_activity;
drop table public.tasks;
drop table public.employee_documents;
drop table public.employees;
drop table public.branches;
drop table public.company_subscriptions;
drop table public.plans;
drop table public.platform_admins;

-- Final assertions. A failure here aborts the transaction before COMMIT.
do $assert$
declare
  v_left text;
begin
  select string_agg(wanted.name, ', ')
    into v_left
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

  if v_left is not null then
    raise exception 'retired tables still exist: %', v_left;
  end if;

  select string_agg(wanted.name, ', ')
    into v_left
  from (
    select unnest(array[
      'generate_notifications',
      'guard_notification_write',
      'log_hr_activity',
      'guard_task_write',
      'guard_company_activity',
      'guard_hr_tenant',
      'guard_billing_write',
      'is_platform_admin',
      'can_read_company_member_directory'
    ]) as name
  ) wanted
  where exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = wanted.name
  );

  if v_left is not null then
    raise exception 'retired functions still exist: %', v_left;
  end if;

  if exists (
    select 1
    from cron.job
    where jobname = 'generate_notifications_hourly'
  ) then
    raise exception 'generate_notifications_hourly is still scheduled';
  end if;

  if to_regclass('public.customers') is null
     or to_regclass('public.transactions') is null
     or to_regclass('public.services') is null
     or to_regclass('public.companies') is null
     or to_regclass('public.company_members') is null
     or to_regclass('public.user_active_company') is null
  then
    raise exception 'an office table is missing before commit';
  end if;

  if not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'finance_company_id'
      and pg_get_function_identity_arguments(p.oid) = ''
  ) or not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'transactions_copy_catalog_profit'
      and pg_get_function_identity_arguments(p.oid) = ''
  ) then
    raise exception 'a 0031 finance function is missing before commit';
  end if;
end
$assert$;

commit;
