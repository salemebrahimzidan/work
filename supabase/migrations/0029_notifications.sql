-- Personal in-app notifications. Unscheduled generator. No email or WhatsApp.
-- Does not change customers, transactions, services, activity, employees,
-- documents, tasks, subscriptions, profiles, or existing tenant policies.
-- company_activity stays an immutable history and is not a source or target.
-- Run this file as one script so the whole change commits or rolls back together.

-- ----------------------------------------------------------------------------
-- notifications. subject_id is polymorphic and has no foreign key, so a
-- deleted employee, document, or task does not block or cascade this row.
-- ----------------------------------------------------------------------------
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete restrict,
  recipient_user_id uuid not null,
  subject_type text not null,
  subject_id uuid not null,
  alert_type text not null,
  threshold text not null,
  dedup_key text not null,
  summary text not null,
  due_on date,
  status text not null default 'unread',
  read_at timestamptz,
  dismissed_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notifications_recipient_member_fkey
    foreign key (company_id, recipient_user_id)
    references public.company_members (company_id, user_id)
    on delete cascade,
  constraint notifications_dedup_key unique (company_id, recipient_user_id, dedup_key),
  constraint notifications_summary_not_blank check (length(btrim(summary)) > 0),
  constraint notifications_dedup_not_blank check (length(btrim(dedup_key)) > 0),
  constraint notifications_threshold_not_blank check (length(btrim(threshold)) > 0),
  constraint notifications_subject_type_check check (
    subject_type in ('employee', 'employee_document', 'task')
  ),
  constraint notifications_alert_type_check check (
    alert_type in (
      'iqama_expiry',
      'passport_expiry',
      'document_expiry',
      'task_due_soon',
      'task_due_today',
      'task_overdue',
      'task_urgent'
    )
  ),
  constraint notifications_threshold_check check (
    threshold in ('30', 'expired', '7', 'today', 'overdue', 'urgent')
  ),
  constraint notifications_status_check check (
    status in ('unread', 'read', 'dismissed', 'resolved')
  ),
  constraint notifications_unread_stamp_check check (
    status <> 'unread'
    or (read_at is null and dismissed_at is null and resolved_at is null)
  ),
  constraint notifications_read_stamp_check check (
    status <> 'read' or read_at is not null
  ),
  constraint notifications_dismissed_stamp_check check (
    status <> 'dismissed' or dismissed_at is not null
  ),
  constraint notifications_resolved_stamp_check check (
    status <> 'resolved' or resolved_at is not null
  )
);

comment on table public.notifications is
  'Personal actionable alerts. Not company_activity. The browser cannot insert rows.';
comment on column public.notifications.summary is
  'Employee name, document type, or task title only. No identity-document numbers.';
comment on column public.notifications.subject_id is
  'Polymorphic id. Not a foreign key, so the source row can be deleted.';
comment on column public.notifications.dedup_key is
  'Stable per recipient, subject, alert type, and threshold. One row forever.';

create index notifications_inbox_idx
  on public.notifications (recipient_user_id, company_id, status, created_at desc);

-- ----------------------------------------------------------------------------
-- Client updates may only move unread -> read, unread -> dismissed, or
-- read -> dismissed. The generator, in a migration/scheduler session, may
-- refresh open text and resolve or reopen a resolved row. Dismissed stays.
-- ----------------------------------------------------------------------------
create or replace function public.guard_notification_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    if not public.is_database_migration() then
      raise exception 'لا يمكن حذف إشعار';
    end if;
    return old;
  end if;

  if tg_op = 'INSERT' then
    if not public.is_database_migration() then
      raise exception 'لا يمكن إضافة إشعار مباشرة';
    end if;
    if new.status is distinct from 'unread' then
      raise exception 'لا يمكن إضافة إشعار مباشرة';
    end if;
    new.created_at := now();
    new.updated_at := now();
    new.read_at := null;
    new.dismissed_at := null;
    new.resolved_at := null;
    return new;
  end if;

  if public.is_database_migration() then
    if old.status = 'dismissed' then
      return old;
    end if;

    new.id := old.id;
    new.company_id := old.company_id;
    new.recipient_user_id := old.recipient_user_id;
    new.subject_type := old.subject_type;
    new.subject_id := old.subject_id;
    new.alert_type := old.alert_type;
    new.threshold := old.threshold;
    new.dedup_key := old.dedup_key;
    new.created_at := old.created_at;

    if old.status in ('unread', 'read') and new.status in ('unread', 'read') then
      new.status := old.status;
      new.read_at := old.read_at;
      new.dismissed_at := old.dismissed_at;
      new.resolved_at := old.resolved_at;
    elsif old.status in ('unread', 'read') and new.status = 'resolved' then
      new.read_at := old.read_at;
      new.dismissed_at := null;
      new.resolved_at := now();
    elsif old.status = 'resolved' and new.status = 'unread' then
      new.read_at := null;
      new.dismissed_at := null;
      new.resolved_at := null;
    elsif old.status = 'resolved' and new.status = 'resolved' then
      return old;
    else
      raise exception 'تغيير حالة الإشعار غير مسموح';
    end if;

    new.updated_at := now();
    return new;
  end if;

  if auth.uid() is null
     or auth.uid() is distinct from old.recipient_user_id
     or not public.is_company_member(old.company_id)
  then
    raise exception 'لا يمكنك تعديل هذا الإشعار';
  end if;

  if new.id is distinct from old.id
     or new.company_id is distinct from old.company_id
     or new.recipient_user_id is distinct from old.recipient_user_id
     or new.subject_type is distinct from old.subject_type
     or new.subject_id is distinct from old.subject_id
     or new.alert_type is distinct from old.alert_type
     or new.threshold is distinct from old.threshold
     or new.dedup_key is distinct from old.dedup_key
     or new.summary is distinct from old.summary
     or new.due_on is distinct from old.due_on
     or new.created_at is distinct from old.created_at
     or new.resolved_at is distinct from old.resolved_at
  then
    raise exception 'لا يمكنك تعديل محتوى الإشعار';
  end if;

  new.updated_at := now();

  if old.status = 'unread' and new.status = 'read' then
    new.read_at := now();
    new.dismissed_at := null;
    new.resolved_at := null;
  elsif old.status = 'unread' and new.status = 'dismissed' then
    new.read_at := old.read_at;
    new.dismissed_at := now();
    new.resolved_at := null;
  elsif old.status = 'read' and new.status = 'dismissed' then
    new.read_at := old.read_at;
    new.dismissed_at := now();
    new.resolved_at := null;
  elsif new.status = old.status
        and new.read_at is not distinct from old.read_at
        and new.dismissed_at is not distinct from old.dismissed_at
  then
    return old;
  else
    raise exception 'لا يمكنك تغيير حالة الإشعار إلى هذه القيمة';
  end if;

  return new;
end;
$$;

comment on function public.guard_notification_write() is
  'Freezes notification identity. Clients may only read or dismiss their own row.';

drop trigger if exists notifications_guard_write on public.notifications;
create trigger notifications_guard_write
  before insert or update or delete on public.notifications
  for each row execute function public.guard_notification_write();

-- ----------------------------------------------------------------------------
-- Rebuild current alerts. No arguments and no returned rows, so it cannot
-- be used to choose a company or to list an inbox. Unscheduled.
-- Dates use Asia/Riyadh. Summaries omit identity-document numbers.
-- ----------------------------------------------------------------------------
create or replace function public.generate_notifications()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date;
begin
  if not public.is_database_migration() then
    raise exception 'لا تملك صلاحية هذه الشركة';
  end if;

  v_today := (timezone('Asia/Riyadh', now()))::date;

  -- Unqualified: pg_temp may not exist until the first temporary table.
  drop table if exists desired_notifications;
  create temp table desired_notifications (
    company_id uuid not null,
    recipient_user_id uuid not null,
    subject_type text not null,
    subject_id uuid not null,
    alert_type text not null,
    threshold text not null,
    dedup_key text not null,
    summary text not null,
    due_on date
  );

  insert into desired_notifications (
    company_id, recipient_user_id, subject_type, subject_id,
    alert_type, threshold, dedup_key, summary, due_on
  )
  select distinct
    e.company_id,
    m.user_id,
    'employee',
    e.id,
    'iqama_expiry',
    '30',
    'iqama_expiry:' || e.id::text || ':30',
    'إقامة قاربت على الانتهاء: ' || btrim(e.full_name),
    e.iqama_expiry_date
  from public.employees e
  join public.company_members m on m.company_id = e.company_id
  join public.companies c on c.id = m.company_id
  where c.status = 'active'
    and m.status = 'active'
    and m.role in ('owner', 'admin', 'manager')
    and e.iqama_expiry_date >= v_today
    and e.iqama_expiry_date <= v_today + 30

  union

  select distinct
    e.company_id,
    m.user_id,
    'employee',
    e.id,
    'iqama_expiry',
    'expired',
    'iqama_expiry:' || e.id::text || ':expired',
    'إقامة منتهية: ' || btrim(e.full_name),
    e.iqama_expiry_date
  from public.employees e
  join public.company_members m on m.company_id = e.company_id
  join public.companies c on c.id = m.company_id
  where c.status = 'active'
    and m.status = 'active'
    and m.role in ('owner', 'admin', 'manager')
    and e.iqama_expiry_date < v_today

  union

  select distinct
    e.company_id,
    m.user_id,
    'employee',
    e.id,
    'passport_expiry',
    '30',
    'passport_expiry:' || e.id::text || ':30',
    'جواز سفر قارب على الانتهاء: ' || btrim(e.full_name),
    e.passport_expiry_date
  from public.employees e
  join public.company_members m on m.company_id = e.company_id
  join public.companies c on c.id = m.company_id
  where c.status = 'active'
    and m.status = 'active'
    and m.role in ('owner', 'admin', 'manager')
    and e.passport_expiry_date >= v_today
    and e.passport_expiry_date <= v_today + 30

  union

  select distinct
    e.company_id,
    m.user_id,
    'employee',
    e.id,
    'passport_expiry',
    'expired',
    'passport_expiry:' || e.id::text || ':expired',
    'جواز سفر منتهٍ: ' || btrim(e.full_name),
    e.passport_expiry_date
  from public.employees e
  join public.company_members m on m.company_id = e.company_id
  join public.companies c on c.id = m.company_id
  where c.status = 'active'
    and m.status = 'active'
    and m.role in ('owner', 'admin', 'manager')
    and e.passport_expiry_date < v_today

  union

  select distinct
    d.company_id,
    m.user_id,
    'employee_document',
    d.id,
    'document_expiry',
    '30',
    'document_expiry:' || d.id::text || ':30',
    'مستند قارب على الانتهاء: ' || btrim(d.document_type) || ' — ' || btrim(e.full_name),
    d.expiry_date
  from public.employee_documents d
  join public.employees e
    on e.id = d.employee_id
   and e.company_id = d.company_id
  join public.company_members m on m.company_id = d.company_id
  join public.companies c on c.id = m.company_id
  where c.status = 'active'
    and m.status = 'active'
    and m.role in ('owner', 'admin', 'manager')
    and d.expiry_date >= v_today
    and d.expiry_date <= v_today + 30

  union

  select distinct
    d.company_id,
    m.user_id,
    'employee_document',
    d.id,
    'document_expiry',
    'expired',
    'document_expiry:' || d.id::text || ':expired',
    'مستند منتهٍ: ' || btrim(d.document_type) || ' — ' || btrim(e.full_name),
    d.expiry_date
  from public.employee_documents d
  join public.employees e
    on e.id = d.employee_id
   and e.company_id = d.company_id
  join public.company_members m on m.company_id = d.company_id
  join public.companies c on c.id = m.company_id
  where c.status = 'active'
    and m.status = 'active'
    and m.role in ('owner', 'admin', 'manager')
    and d.expiry_date < v_today;

  insert into desired_notifications (
    company_id, recipient_user_id, subject_type, subject_id,
    alert_type, threshold, dedup_key, summary, due_on
  )
  select distinct
    t.company_id,
    recipient.user_id,
    'task',
    t.id,
    t.alert_type,
    t.threshold,
    t.dedup_key,
    t.summary,
    t.due_date
  from (
    select
      t.id,
      t.company_id,
      t.assigned_to,
      t.due_date,
      'task_due_soon'::text as alert_type,
      '7'::text as threshold,
      'task_due_soon:' || t.id::text || ':' || to_char(t.due_date, 'YYYY-MM-DD') as dedup_key,
      'مهمة تستحق خلال 7 أيام: ' || btrim(t.title) as summary,
      false as include_managers
    from public.tasks t
    join public.companies c on c.id = t.company_id
    where c.status = 'active'
      and t.status in ('open', 'in_progress')
      and t.due_date > v_today
      and t.due_date <= v_today + 7

    union all

    select
      t.id,
      t.company_id,
      t.assigned_to,
      t.due_date,
      'task_due_today',
      'today',
      'task_due_today:' || t.id::text || ':' || to_char(t.due_date, 'YYYY-MM-DD'),
      'مهمة تستحق اليوم: ' || btrim(t.title),
      false
    from public.tasks t
    join public.companies c on c.id = t.company_id
    where c.status = 'active'
      and t.status in ('open', 'in_progress')
      and t.due_date = v_today

    union all

    select
      t.id,
      t.company_id,
      t.assigned_to,
      t.due_date,
      'task_overdue',
      'overdue',
      'task_overdue:' || t.id::text,
      'مهمة متأخرة: ' || btrim(t.title),
      false
    from public.tasks t
    join public.companies c on c.id = t.company_id
    where c.status = 'active'
      and t.status in ('open', 'in_progress')
      and t.due_date < v_today

    union all

    select
      t.id,
      t.company_id,
      t.assigned_to,
      t.due_date,
      'task_urgent',
      'urgent',
      'task_urgent:' || t.id::text,
      'مهمة عاجلة: ' || btrim(t.title),
      true
    from public.tasks t
    join public.companies c on c.id = t.company_id
    where c.status = 'active'
      and t.status in ('open', 'in_progress')
      and t.priority = 'urgent'
  ) t
  join lateral (
    select m.user_id
    from public.company_members m
    where m.company_id = t.company_id
      and m.user_id = t.assigned_to
      and m.status = 'active'
      and t.assigned_to is not null

    union

    select m.user_id
    from public.company_members m
    where m.company_id = t.company_id
      and m.status = 'active'
      and m.role in ('owner', 'admin', 'manager')
      and (
        t.include_managers
        or t.assigned_to is null
        or not exists (
          select 1
          from public.company_members assignee
          where assignee.company_id = t.company_id
            and assignee.user_id = t.assigned_to
            and assignee.status = 'active'
        )
      )
  ) recipient on true;

  insert into public.notifications (
    company_id,
    recipient_user_id,
    subject_type,
    subject_id,
    alert_type,
    threshold,
    dedup_key,
    summary,
    due_on,
    status
  )
  select
    d.company_id,
    d.recipient_user_id,
    d.subject_type,
    d.subject_id,
    d.alert_type,
    d.threshold,
    d.dedup_key,
    d.summary,
    d.due_on,
    'unread'
  from desired_notifications d
  where not exists (
    select 1
    from public.notifications n
    where n.company_id = d.company_id
      and n.recipient_user_id = d.recipient_user_id
      and n.dedup_key = d.dedup_key
  );

  update public.notifications n
  set
    summary = d.summary,
    due_on = d.due_on
  from desired_notifications d
  where n.company_id = d.company_id
    and n.recipient_user_id = d.recipient_user_id
    and n.dedup_key = d.dedup_key
    and n.status in ('unread', 'read')
    and (
      n.summary is distinct from d.summary
      or n.due_on is distinct from d.due_on
    );

  update public.notifications n
  set
    status = 'resolved',
    resolved_at = now()
  where n.status in ('unread', 'read')
    and not exists (
      select 1
      from desired_notifications d
      where d.company_id = n.company_id
        and d.recipient_user_id = n.recipient_user_id
        and d.dedup_key = n.dedup_key
    );

  update public.notifications n
  set
    status = 'unread',
    summary = d.summary,
    due_on = d.due_on,
    read_at = null,
    dismissed_at = null,
    resolved_at = null
  from desired_notifications d
  where n.company_id = d.company_id
    and n.recipient_user_id = d.recipient_user_id
    and n.dedup_key = d.dedup_key
    and n.status = 'resolved';

  drop table if exists desired_notifications;
end;
$$;

comment on function public.generate_notifications() is
  'Idempotent alert rebuild for the migration or scheduler session. Returns no rows and takes no company id.';

revoke all on function public.guard_notification_write() from public, anon, service_role;
grant execute on function public.guard_notification_write() to authenticated;

revoke all on function public.generate_notifications() from public, anon, authenticated, service_role;

-- ----------------------------------------------------------------------------
-- RLS. A member reads and updates only their own current-company inbox.
-- ----------------------------------------------------------------------------
alter table public.notifications enable row level security;

drop policy if exists notifications_select_own on public.notifications;
create policy notifications_select_own
  on public.notifications
  for select
  to authenticated
  using (
    company_id = public.current_company_id()
    and recipient_user_id = auth.uid()
    and public.is_company_member(company_id)
  );

drop policy if exists notifications_update_own on public.notifications;
create policy notifications_update_own
  on public.notifications
  for update
  to authenticated
  using (
    company_id = public.current_company_id()
    and recipient_user_id = auth.uid()
    and public.is_company_member(company_id)
  )
  with check (
    company_id = public.current_company_id()
    and recipient_user_id = auth.uid()
    and public.is_company_member(company_id)
  );

revoke all on public.notifications from anon, authenticated, service_role;
grant select, update on public.notifications to authenticated;

-- First build. Safe to run again later by the same trusted session. No cron.
select public.generate_notifications();
