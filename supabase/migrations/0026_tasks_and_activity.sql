-- Tasks and an append-only company activity log.
-- Does not change customers, transactions, services, profit history, or their RLS.
-- Does not replace branches, employees, or employee_documents policies.
-- Adds logging triggers only. No history backfill.
--
-- Task delete: owner and admin only. Manager and user cannot delete.
-- Activity rows are written by triggers. The browser cannot insert them.
-- app.activity_write is intentionally unused: a custom setting can be set by
-- any SQL caller, so it is not an authorization check.

-- ----------------------------------------------------------------------------
-- tasks
-- ----------------------------------------------------------------------------
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete restrict,
  branch_id uuid,
  employee_id uuid,
  title text not null,
  description text,
  status text not null default 'open',
  priority text not null default 'normal',
  due_date date,
  assigned_to uuid,
  created_by uuid references public.profiles (id) on delete set null,
  completed_by uuid,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tasks_title_not_blank check (length(btrim(title)) > 0),
  constraint tasks_status_check check (
    status in ('open', 'in_progress', 'completed', 'cancelled')
  ),
  constraint tasks_priority_check check (
    priority in ('low', 'normal', 'high', 'urgent')
  ),
  constraint tasks_completion_check check (
    (
      status = 'completed'
      and completed_at is not null
      and completed_by is not null
    )
    or (
      status <> 'completed'
      and completed_at is null
      and completed_by is null
    )
  ),
  constraint tasks_branch_company_fkey
    foreign key (branch_id, company_id)
    references public.branches (id, company_id),
  constraint tasks_employee_company_fkey
    foreign key (employee_id, company_id)
    references public.employees (id, company_id),
  constraint tasks_assignee_company_fkey
    foreign key (company_id, assigned_to)
    references public.company_members (company_id, user_id),
  constraint tasks_completed_by_company_fkey
    foreign key (company_id, completed_by)
    references public.company_members (company_id, user_id)
);

comment on table public.tasks is
  'Company work item. assigned_to and completed_by are company members, not employees.';
comment on column public.tasks.status is
  'open, in_progress, completed, or cancelled. Add a later status by replacing tasks_status_check.';
comment on column public.tasks.priority is
  'low, normal, high, or urgent. Add a later priority by replacing tasks_priority_check.';
comment on column public.tasks.assigned_to is
  'company_members.user_id. Null is unassigned. Active status is checked when the assignee changes.';

create index tasks_company_open_due_idx
  on public.tasks (company_id, status, due_date)
  where status in ('open', 'in_progress');

create index tasks_company_assigned_open_idx
  on public.tasks (company_id, assigned_to, status)
  where assigned_to is not null
    and status in ('open', 'in_progress');

create index tasks_company_due_open_idx
  on public.tasks (company_id, due_date)
  where due_date is not null
    and status in ('open', 'in_progress');

create index tasks_company_employee_idx
  on public.tasks (company_id, employee_id)
  where employee_id is not null;

-- ----------------------------------------------------------------------------
-- company_activity — no foreign key to employees, documents, or tasks.
-- A subject can be deleted without taking its history with it.
-- ----------------------------------------------------------------------------
create table public.company_activity (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete restrict,
  actor_id uuid references public.profiles (id) on delete set null,
  event_type text not null,
  subject_type text not null,
  subject_id uuid not null,
  employee_id uuid,
  summary text not null,
  created_at timestamptz not null default now(),
  constraint company_activity_summary_not_blank check (length(btrim(summary)) > 0),
  constraint company_activity_event_type_check check (
    event_type in (
      'employee.created',
      'employee.updated',
      'document.created',
      'document.updated',
      'document.deleted',
      'task.created',
      'task.updated',
      'task.completed',
      'task.reopened',
      'task.cancelled'
    )
  ),
  constraint company_activity_subject_type_check check (
    subject_type in ('employee', 'employee_document', 'task')
  )
);

comment on table public.company_activity is
  'Append-only company timeline. Summaries do not store identity-document numbers.';
comment on column public.company_activity.employee_id is
  'Timeline key copied from the source row. Not a foreign key.';
comment on column public.company_activity.subject_id is
  'Id of the source row. Not a foreign key, so the source row can be deleted.';

create index company_activity_company_created_idx
  on public.company_activity (company_id, created_at desc);

create index company_activity_employee_created_idx
  on public.company_activity (company_id, employee_id, created_at desc)
  where employee_id is not null;

create index company_activity_subject_created_idx
  on public.company_activity (company_id, subject_type, subject_id, created_at desc);

-- ----------------------------------------------------------------------------
-- Task writes. Security definer is required so the assignee check can see
-- other company_members rows. Those rows are hidden by company_members_select_own.
-- The function returns trigger, so PostgREST cannot run its body.
-- ----------------------------------------------------------------------------
create or replace function public.guard_task_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    if not public.has_company_role(old.company_id, array['owner', 'admin']) then
      raise exception 'لا يمكنك حذف مهمة';
    end if;
    return old;
  end if;

  if tg_op = 'INSERT' then
    new.company_id := public.current_company_id();
    if new.company_id is null then
      raise exception 'لا تملك صلاحية هذه الشركة';
    end if;
    if not public.has_company_role(new.company_id, array['owner', 'admin', 'manager']) then
      raise exception 'لا يمكنك إنشاء مهمة';
    end if;
    new.created_by := auth.uid();
    new.created_at := now();
    new.updated_at := now();
  else
    new.id := old.id;
    new.company_id := old.company_id;
    new.created_by := old.created_by;
    new.created_at := old.created_at;
    new.updated_at := now();

    if not public.has_company_role(old.company_id, array['owner', 'admin', 'manager']) then
      if old.assigned_to is distinct from auth.uid() then
        raise exception 'لا يمكنك تعديل هذه المهمة';
      end if;
      if old.status = 'cancelled' then
        raise exception 'لا يمكنك تعديل مهمة ملغاة';
      end if;
      if new.title is distinct from old.title
         or new.description is distinct from old.description
         or new.priority is distinct from old.priority
         or new.due_date is distinct from old.due_date
         or new.branch_id is distinct from old.branch_id
         or new.employee_id is distinct from old.employee_id
         or new.assigned_to is distinct from old.assigned_to
      then
        raise exception 'لا يمكنك تعديل غير حالة المهمة';
      end if;
      if new.status not in ('open', 'in_progress', 'completed') then
        raise exception 'لا يمكنك تغيير الحالة إلى هذه القيمة';
      end if;
    end if;
  end if;

  if new.assigned_to is not null
     and (
       tg_op = 'INSERT'
       or new.assigned_to is distinct from old.assigned_to
     )
     and not exists (
       select 1
       from public.company_members m
       join public.companies c on c.id = m.company_id
       where m.company_id = new.company_id
         and m.user_id = new.assigned_to
         and m.status = 'active'
         and c.status = 'active'
     )
  then
    raise exception 'لا يمكن إسناد المهمة إلى عضو غير نشط';
  end if;

  if tg_op = 'INSERT' or new.status is distinct from old.status then
    if new.status = 'completed' then
      if not public.is_company_member(new.company_id) then
        raise exception 'لا تملك صلاحية هذه الشركة';
      end if;
      new.completed_by := auth.uid();
      new.completed_at := now();
    else
      new.completed_by := null;
      new.completed_at := null;
    end if;
  else
    new.completed_by := old.completed_by;
    new.completed_at := old.completed_at;
  end if;

  return new;
end;
$$;

drop trigger if exists tasks_guard_write on public.tasks;
create trigger tasks_guard_write
  before insert or update or delete on public.tasks
  for each row execute function public.guard_task_write();

-- ----------------------------------------------------------------------------
-- Direct inserts see this trigger at depth 1 and are rejected.
-- An insert made from the logging trigger sees depth 2 or more.
-- Update and delete are always rejected. No session setting is consulted.
-- ----------------------------------------------------------------------------
create or replace function public.guard_company_activity()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if pg_catalog.pg_trigger_depth() <= 1 then
      raise exception 'لا يمكن إضافة سجل نشاط مباشرة';
    end if;
    if new.actor_id is distinct from auth.uid()
       or new.company_id is distinct from public.current_company_id()
       or auth.uid() is null
       or public.current_company_id() is null
    then
      raise exception 'لا تملك صلاحية هذه الشركة';
    end if;
    new.created_at := now();
    return new;
  end if;

  raise exception 'سجل النشاط غير قابل للتعديل أو الحذف';
end;
$$;

drop trigger if exists company_activity_guard on public.company_activity;
create trigger company_activity_guard
  before insert or update or delete on public.company_activity
  for each row execute function public.guard_company_activity();

-- ----------------------------------------------------------------------------
-- One activity row per real change. Summaries use a name, a document type,
-- or a task title. Identity-document numbers are never written.
-- Not security definer: the activity guard and RLS still apply.
-- ----------------------------------------------------------------------------
create or replace function public.log_hr_activity()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_company_id uuid;
  v_event text;
  v_subject_type text;
  v_subject_id uuid;
  v_employee_id uuid;
  v_summary text;
begin
  if auth.uid() is null then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  v_company_id := public.current_company_id();
  if v_company_id is null then
    raise exception 'لا تملك صلاحية هذه الشركة';
  end if;

  if tg_table_name = 'employees' then
    if new.company_id is distinct from v_company_id then
      raise exception 'لا تملك صلاحية هذه الشركة';
    end if;
    v_subject_type := 'employee';
    v_subject_id := new.id;
    v_employee_id := new.id;
    if tg_op = 'INSERT' then
      v_event := 'employee.created';
      v_summary := 'تم إضافة موظف: ' || btrim(new.full_name);
    elsif new.branch_id is distinct from old.branch_id
       or new.employee_number is distinct from old.employee_number
       or new.full_name is distinct from old.full_name
       or new.nationality is distinct from old.nationality
       or new.mobile is distinct from old.mobile
       or new.email is distinct from old.email
       or new.iqama_number is distinct from old.iqama_number
       or new.iqama_expiry_date is distinct from old.iqama_expiry_date
       or new.passport_number is distinct from old.passport_number
       or new.passport_expiry_date is distinct from old.passport_expiry_date
       or new.job_title is distinct from old.job_title
       or new.employment_status is distinct from old.employment_status
       or new.hire_date is distinct from old.hire_date
       or new.notes is distinct from old.notes
    then
      v_event := 'employee.updated';
      v_summary := 'تم تحديث موظف: ' || btrim(new.full_name);
    end if;
  elsif tg_table_name = 'employee_documents' then
    v_subject_type := 'employee_document';
    if tg_op = 'DELETE' then
      if old.company_id is distinct from v_company_id then
        raise exception 'لا تملك صلاحية هذه الشركة';
      end if;
      v_event := 'document.deleted';
      v_subject_id := old.id;
      v_employee_id := old.employee_id;
      v_summary := 'تم حذف مستند: ' || btrim(old.document_type);
    else
      if new.company_id is distinct from v_company_id then
        raise exception 'لا تملك صلاحية هذه الشركة';
      end if;
      v_subject_id := new.id;
      v_employee_id := new.employee_id;
      if tg_op = 'INSERT' then
        v_event := 'document.created';
        v_summary := 'تم إضافة مستند: ' || btrim(new.document_type);
      elsif new.employee_id is distinct from old.employee_id
         or new.document_type is distinct from old.document_type
         or new.document_number is distinct from old.document_number
         or new.issue_date is distinct from old.issue_date
         or new.expiry_date is distinct from old.expiry_date
         or new.file_path is distinct from old.file_path
         or new.notes is distinct from old.notes
      then
        v_event := 'document.updated';
        v_summary := 'تم تحديث مستند: ' || btrim(new.document_type);
      end if;
    end if;
  elsif tg_table_name = 'tasks' then
    if new.company_id is distinct from v_company_id then
      raise exception 'لا تملك صلاحية هذه الشركة';
    end if;
    v_subject_type := 'task';
    v_subject_id := new.id;
    v_employee_id := new.employee_id;
    if tg_op = 'INSERT' then
      if new.status = 'completed' then
        v_event := 'task.completed';
        v_summary := 'تم إنجاز مهمة: ' || btrim(new.title);
      elsif new.status = 'cancelled' then
        v_event := 'task.cancelled';
        v_summary := 'تم إلغاء مهمة: ' || btrim(new.title);
      else
        v_event := 'task.created';
        v_summary := 'تم إنشاء مهمة: ' || btrim(new.title);
      end if;
    elsif new.status = 'completed' and old.status is distinct from 'completed' then
      v_event := 'task.completed';
      v_summary := 'تم إنجاز مهمة: ' || btrim(new.title);
    elsif new.status = 'cancelled' and old.status is distinct from 'cancelled' then
      v_event := 'task.cancelled';
      v_summary := 'تم إلغاء مهمة: ' || btrim(new.title);
    elsif old.status = 'completed' and new.status is distinct from 'completed' then
      v_event := 'task.reopened';
      v_summary := 'تمت إعادة فتح مهمة: ' || btrim(new.title);
    elsif new.title is distinct from old.title
       or new.description is distinct from old.description
       or new.priority is distinct from old.priority
       or new.due_date is distinct from old.due_date
       or new.branch_id is distinct from old.branch_id
       or new.employee_id is distinct from old.employee_id
       or new.assigned_to is distinct from old.assigned_to
       or new.status is distinct from old.status
    then
      v_event := 'task.updated';
      v_summary := 'تم تحديث مهمة: ' || btrim(new.title);
    end if;
  end if;

  if v_event is null then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  insert into public.company_activity (
    company_id,
    actor_id,
    event_type,
    subject_type,
    subject_id,
    employee_id,
    summary
  ) values (
    v_company_id,
    auth.uid(),
    v_event,
    v_subject_type,
    v_subject_id,
    v_employee_id,
    v_summary
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists employees_log_activity on public.employees;
create trigger employees_log_activity
  after insert or update on public.employees
  for each row execute function public.log_hr_activity();

drop trigger if exists employee_documents_log_activity on public.employee_documents;
create trigger employee_documents_log_activity
  after insert or update or delete on public.employee_documents
  for each row execute function public.log_hr_activity();

drop trigger if exists tasks_log_activity on public.tasks;
create trigger tasks_log_activity
  after insert or update on public.tasks
  for each row execute function public.log_hr_activity();

-- ----------------------------------------------------------------------------
-- RLS
-- ----------------------------------------------------------------------------
alter table public.tasks enable row level security;
alter table public.company_activity enable row level security;

drop policy if exists tasks_select on public.tasks;
create policy tasks_select on public.tasks
  for select to authenticated
  using (
    company_id = public.current_company_id()
    and public.is_company_member(company_id)
  );

drop policy if exists tasks_insert_manager on public.tasks;
create policy tasks_insert_manager on public.tasks
  for insert to authenticated
  with check (
    company_id = public.current_company_id()
    and public.has_company_role(company_id, array['owner', 'admin', 'manager'])
  );

drop policy if exists tasks_update_manager on public.tasks;
create policy tasks_update_manager on public.tasks
  for update to authenticated
  using (
    company_id = public.current_company_id()
    and public.has_company_role(company_id, array['owner', 'admin', 'manager'])
  )
  with check (
    company_id = public.current_company_id()
    and public.has_company_role(company_id, array['owner', 'admin', 'manager'])
  );

drop policy if exists tasks_update_assignee on public.tasks;
create policy tasks_update_assignee on public.tasks
  for update to authenticated
  using (
    company_id = public.current_company_id()
    and public.is_company_member(company_id)
    and assigned_to = auth.uid()
  )
  with check (
    company_id = public.current_company_id()
    and public.is_company_member(company_id)
    and assigned_to = auth.uid()
    and status in ('open', 'in_progress', 'completed')
  );

drop policy if exists tasks_delete_admin on public.tasks;
create policy tasks_delete_admin on public.tasks
  for delete to authenticated
  using (
    company_id = public.current_company_id()
    and public.has_company_role(company_id, array['owner', 'admin'])
  );

drop policy if exists company_activity_select on public.company_activity;
create policy company_activity_select on public.company_activity
  for select to authenticated
  using (
    company_id = public.current_company_id()
    and public.is_company_member(company_id)
  );

-- Authenticated has INSERT, so this policy is required. It is evaluated
-- after company_activity_guard returns. A direct insert is then at depth 0.
-- The logging trigger is still on the stack, so its insert has depth > 0.
-- app.activity_write is not read.
drop policy if exists company_activity_insert_from_trigger on public.company_activity;
create policy company_activity_insert_from_trigger on public.company_activity
  for insert to authenticated
  with check (
    pg_catalog.pg_trigger_depth() > 0
    and company_id = public.current_company_id()
    and actor_id = auth.uid()
  );

revoke all on public.tasks from anon, authenticated, service_role;
revoke all on public.company_activity from anon, authenticated, service_role;

grant select, insert, update, delete on public.tasks to authenticated;
grant select, insert on public.company_activity to authenticated;

revoke all on function public.guard_task_write() from public, anon, service_role;
revoke all on function public.guard_company_activity() from public, anon, service_role;
revoke all on function public.log_hr_activity() from public, anon, service_role;

grant execute on function public.guard_task_write() to authenticated;
grant execute on function public.guard_company_activity() to authenticated;
grant execute on function public.log_hr_activity() to authenticated;
