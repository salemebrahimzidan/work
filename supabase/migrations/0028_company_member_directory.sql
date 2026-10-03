-- Same-company active member directory for task assignment.
-- SELECT only. Does not grant membership writes or change roles.
-- Does not change customers, transactions, services, branches, employees,
-- documents, task authorization, subscriptions, or platform admins.
-- Does not change profiles RLS. Email stays in auth.users.
-- Run this file as one script so the whole change commits or rolls back together.
--
-- company_members_select_own stays as it is: a user can still read every
-- membership row that belongs to auth.uid(), including another company and
-- a non-active status. This policy only adds other people's rows.
--
-- Recursion: current_company_id() and is_company_member() are SECURITY DEFINER
-- and owned by the migration role, which bypasses RLS. This helper is also
-- SECURITY DEFINER and does not query company_members directly, so the new
-- SELECT policy does not re-enter itself. The policy has no subquery on
-- company_members.

-- ----------------------------------------------------------------------------
-- Boolean only. No company argument, so it cannot probe an arbitrary company.
-- ----------------------------------------------------------------------------
create or replace function public.can_read_company_member_directory()
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
begin
  if auth.uid() is null then
    return false;
  end if;

  v_company_id := public.current_company_id();
  if v_company_id is null then
    return false;
  end if;

  return public.is_company_member(v_company_id);
end;
$$;

comment on function public.can_read_company_member_directory() is
  'True when auth.uid() is an active member of the current active company. Returns no membership rows and accepts no company id.';

revoke all on function public.can_read_company_member_directory() from public, anon, authenticated, service_role;
grant execute on function public.can_read_company_member_directory() to authenticated;

-- ----------------------------------------------------------------------------
-- Active members of the caller's current company. Writes stay ungranted.
-- ----------------------------------------------------------------------------
drop policy if exists company_members_select_directory on public.company_members;
create policy company_members_select_directory
  on public.company_members
  for select
  to authenticated
  using (
    status = 'active'
    and company_id = public.current_company_id()
    and public.can_read_company_member_directory()
  );

comment on policy company_members_select_directory on public.company_members is
  'Active members of the current company. Does not permit insert, update, or delete.';
