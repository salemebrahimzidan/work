-- HR foundation: branches, employees, and employee documents.
-- Does not change customers, transactions, services, profit history, or their RLS.
-- Roles come from company_members, not profiles.role.
--
-- manager may read all three tables and may insert/update employees and documents.
-- manager cannot delete HR rows and cannot create or edit branches.
-- user may only read. owner and admin have full access.
-- Run this file as one script so the whole change commits or rolls back together.

-- ----------------------------------------------------------------------------
-- branches
-- ----------------------------------------------------------------------------
create table public.branches (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete restrict,
  name text not null,
  code text,
  city text,
  address text,
  phone text,
  is_active boolean not null default true,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint branches_name_not_blank check (length(btrim(name)) > 0),
  constraint branches_code_not_blank check (code is null or length(btrim(code)) > 0),
  constraint branches_company_name_key unique (company_id, name),
  constraint branches_company_code_key unique (company_id, code),
  constraint branches_id_company_key unique (id, company_id)
);

comment on table public.branches is
  'Company branch. Names and codes are unique inside one company.';

-- ----------------------------------------------------------------------------
-- employees — staff records, not logins and not company_members
-- ----------------------------------------------------------------------------
create table public.employees (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete restrict,
  branch_id uuid,
  employee_number text,
  full_name text not null,
  nationality text,
  mobile text,
  email text,
  iqama_number text,
  iqama_expiry_date date,
  passport_number text,
  passport_expiry_date date,
  job_title text,
  employment_status text not null default 'active',
  hire_date date,
  notes text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint employees_name_not_blank check (length(btrim(full_name)) > 0),
  constraint employees_number_not_blank check (
    employee_number is null or length(btrim(employee_number)) > 0
  ),
  constraint employees_iqama_not_blank check (
    iqama_number is null or length(btrim(iqama_number)) > 0
  ),
  constraint employees_passport_not_blank check (
    passport_number is null or length(btrim(passport_number)) > 0
  ),
  constraint employees_employment_status_check check (
    employment_status in ('active', 'inactive', 'vacation', 'terminated')
  ),
  constraint employees_company_number_key unique (company_id, employee_number),
  constraint employees_company_iqama_key unique (company_id, iqama_number),
  constraint employees_company_passport_key unique (company_id, passport_number),
  constraint employees_id_company_key unique (id, company_id),
  constraint employees_branch_company_fkey
    foreign key (branch_id, company_id)
    references public.branches (id, company_id)
);

comment on table public.employees is
  'Company staff record. Not an auth user and not a company_members row.';
comment on column public.employees.employment_status is
  'active, inactive, vacation, or terminated. Add a later status by replacing employees_employment_status_check.';

create index employees_company_branch_idx
  on public.employees (company_id, branch_id);

create index employees_company_iqama_expiry_idx
  on public.employees (company_id, iqama_expiry_date)
  where iqama_expiry_date is not null;

create index employees_company_passport_expiry_idx
  on public.employees (company_id, passport_expiry_date)
  where passport_expiry_date is not null;

-- ----------------------------------------------------------------------------
-- employee_documents — file_path is metadata only; no storage bucket yet
-- ----------------------------------------------------------------------------
create table public.employee_documents (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete restrict,
  employee_id uuid not null,
  document_type text not null,
  document_number text,
  issue_date date,
  expiry_date date,
  file_path text,
  notes text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint employee_documents_type_not_blank check (length(btrim(document_type)) > 0),
  constraint employee_documents_number_not_blank check (
    document_number is null or length(btrim(document_number)) > 0
  ),
  constraint employee_documents_employee_company_fkey
    foreign key (employee_id, company_id)
    references public.employees (id, company_id)
);

comment on column public.employee_documents.document_type is
  'Recommended: iqama, passport, contract, insurance, other. Other non-blank types are allowed.';
comment on column public.employee_documents.file_path is
  'Metadata only. Storage upload and bucket policies are not created here.';

create index employee_documents_company_employee_idx
  on public.employee_documents (company_id, employee_id);

create index employee_documents_company_expiry_idx
  on public.employee_documents (company_id, expiry_date)
  where expiry_date is not null;

-- ----------------------------------------------------------------------------
-- Assign the active company and created_by. Freeze them on update.
-- Not security definer: current_company_id() already is.
-- ----------------------------------------------------------------------------
create or replace function public.guard_hr_tenant()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.company_id := public.current_company_id();
    if new.company_id is null then
      raise exception 'لا تملك صلاحية هذه الشركة';
    end if;
    new.created_by := auth.uid();
    new.created_at := now();
    new.updated_at := now();
    return new;
  end if;

  new.id := old.id;
  new.company_id := old.company_id;
  new.created_by := old.created_by;
  new.created_at := old.created_at;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists branches_guard_tenant on public.branches;
create trigger branches_guard_tenant
  before insert or update on public.branches
  for each row execute function public.guard_hr_tenant();

drop trigger if exists employees_guard_tenant on public.employees;
create trigger employees_guard_tenant
  before insert or update on public.employees
  for each row execute function public.guard_hr_tenant();

drop trigger if exists employee_documents_guard_tenant on public.employee_documents;
create trigger employee_documents_guard_tenant
  before insert or update on public.employee_documents
  for each row execute function public.guard_hr_tenant();

-- ----------------------------------------------------------------------------
-- RLS
-- ----------------------------------------------------------------------------
alter table public.branches enable row level security;
alter table public.employees enable row level security;
alter table public.employee_documents enable row level security;

drop policy if exists branches_select on public.branches;
create policy branches_select on public.branches
  for select to authenticated
  using (
    company_id = public.current_company_id()
    and public.is_company_member(company_id)
  );

drop policy if exists branches_insert_admin on public.branches;
create policy branches_insert_admin on public.branches
  for insert to authenticated
  with check (
    company_id = public.current_company_id()
    and public.has_company_role(company_id, array['owner', 'admin'])
  );

drop policy if exists branches_update_admin on public.branches;
create policy branches_update_admin on public.branches
  for update to authenticated
  using (
    company_id = public.current_company_id()
    and public.has_company_role(company_id, array['owner', 'admin'])
  )
  with check (
    company_id = public.current_company_id()
    and public.has_company_role(company_id, array['owner', 'admin'])
  );

drop policy if exists branches_delete_admin on public.branches;
create policy branches_delete_admin on public.branches
  for delete to authenticated
  using (
    company_id = public.current_company_id()
    and public.has_company_role(company_id, array['owner', 'admin'])
  );

drop policy if exists employees_select on public.employees;
create policy employees_select on public.employees
  for select to authenticated
  using (
    company_id = public.current_company_id()
    and public.is_company_member(company_id)
  );

drop policy if exists employees_insert_manager on public.employees;
create policy employees_insert_manager on public.employees
  for insert to authenticated
  with check (
    company_id = public.current_company_id()
    and public.has_company_role(company_id, array['owner', 'admin', 'manager'])
  );

drop policy if exists employees_update_manager on public.employees;
create policy employees_update_manager on public.employees
  for update to authenticated
  using (
    company_id = public.current_company_id()
    and public.has_company_role(company_id, array['owner', 'admin', 'manager'])
  )
  with check (
    company_id = public.current_company_id()
    and public.has_company_role(company_id, array['owner', 'admin', 'manager'])
  );

drop policy if exists employees_delete_admin on public.employees;
create policy employees_delete_admin on public.employees
  for delete to authenticated
  using (
    company_id = public.current_company_id()
    and public.has_company_role(company_id, array['owner', 'admin'])
  );

drop policy if exists employee_documents_select on public.employee_documents;
create policy employee_documents_select on public.employee_documents
  for select to authenticated
  using (
    company_id = public.current_company_id()
    and public.is_company_member(company_id)
  );

drop policy if exists employee_documents_insert_manager on public.employee_documents;
create policy employee_documents_insert_manager on public.employee_documents
  for insert to authenticated
  with check (
    company_id = public.current_company_id()
    and public.has_company_role(company_id, array['owner', 'admin', 'manager'])
  );

drop policy if exists employee_documents_update_manager on public.employee_documents;
create policy employee_documents_update_manager on public.employee_documents
  for update to authenticated
  using (
    company_id = public.current_company_id()
    and public.has_company_role(company_id, array['owner', 'admin', 'manager'])
  )
  with check (
    company_id = public.current_company_id()
    and public.has_company_role(company_id, array['owner', 'admin', 'manager'])
  );

drop policy if exists employee_documents_delete_admin on public.employee_documents;
create policy employee_documents_delete_admin on public.employee_documents
  for delete to authenticated
  using (
    company_id = public.current_company_id()
    and public.has_company_role(company_id, array['owner', 'admin'])
  );

revoke all on public.branches from anon, authenticated, service_role;
revoke all on public.employees from anon, authenticated, service_role;
revoke all on public.employee_documents from anon, authenticated, service_role;

grant select, insert, update, delete on public.branches to authenticated;
grant select, insert, update, delete on public.employees to authenticated;
grant select, insert, update, delete on public.employee_documents to authenticated;

revoke all on function public.guard_hr_tenant() from public, anon, service_role;
grant execute on function public.guard_hr_tenant() to authenticated;
