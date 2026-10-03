-- Hourly notification refresh. Does not change generate_notifications(),
-- is_database_migration(), notification rows, RLS, triggers, or grants.
-- No Edge Function, pg_net, HTTP, Vault secret, or service_role key.
-- Run this file as one script so the whole change commits or rolls back together.

-- pg_cron stores cron.job.username from current_user. It has no username
-- argument on cron.schedule(job_name, schedule, command). The worker then
-- opens a new connection as that username, so session_user is the stored
-- role and no JWT is present. Scheduling is refused unless this session
-- already passes is_database_migration().

do $trusted$
begin
  if not public.is_database_migration() then
    raise exception 'notification scheduler requires the trusted database session';
  end if;
end
$trusted$;

create extension if not exists pg_cron with schema pg_catalog;

grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;
grant all privileges on all sequences in schema cron to postgres;

revoke all on schema cron from public;
revoke all on schema cron from anon, authenticated, service_role;
revoke all privileges on all tables in schema cron from public;
revoke all privileges on all tables in schema cron from anon, authenticated, service_role;
revoke all privileges on all sequences in schema cron from public;
revoke all privileges on all sequences in schema cron from anon, authenticated, service_role;

-- Do not add a second generator job, and do not alter any other job.
do $guard$
begin
  if exists (
    select 1
    from cron.job
    where jobname = 'generate_notifications_hourly'
      and username is distinct from session_user
  ) then
    raise exception 'generate_notifications_hourly already exists for another role';
  end if;

  if exists (
    select 1
    from cron.job
    where position('generate_notifications' in command) > 0
      and jobname is distinct from 'generate_notifications_hourly'
  ) then
    raise exception 'another cron job already calls generate_notifications';
  end if;
end
$guard$;

select cron.schedule(
  'generate_notifications_hourly',
  '10 * * * *',
  'select public.generate_notifications();'
);

do $check$
declare
  v_count integer;
  v_username text;
  v_schedule text;
  v_command text;
begin
  select count(*)
    into v_count
  from cron.job
  where jobname = 'generate_notifications_hourly';

  if v_count <> 1 then
    raise exception 'expected exactly one generate_notifications_hourly job';
  end if;

  select username, schedule, command
    into v_username, v_schedule, v_command
  from cron.job
  where jobname = 'generate_notifications_hourly';

  if v_username is distinct from session_user
     or session_user not in ('postgres', 'supabase_admin')
     or auth.uid() is not null
     or v_schedule is distinct from '10 * * * *'
     or v_command is distinct from 'select public.generate_notifications();'
  then
    raise exception 'notification cron job is not bound to the trusted session';
  end if;
end
$check$;
