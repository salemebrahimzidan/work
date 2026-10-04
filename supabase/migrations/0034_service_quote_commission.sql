-- Let an active company member read the catalog service commission for quoting.
-- Does not grant SELECT on services.commission.
-- Does not expose transactions.profit or any office-profit function.
-- Does not change service_commissions(), finance_company_id(), or existing rows.
-- Run this file as one script. Do not apply it from the application.

-- ----------------------------------------------------------------------------
-- Quote catalog only. Company comes from the session, never from the caller.
-- SECURITY DEFINER is required because authenticated cannot select commission.
-- ----------------------------------------------------------------------------
create or replace function public.service_quote_commissions()
returns table (id uuid, commission numeric)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_company uuid;
begin
  if auth.uid() is null then
    raise exception 'لا تملك صلاحية عرض عمولة الخدمة';
  end if;

  v_company := public.current_company_id();
  if v_company is null or not public.is_company_member(v_company) then
    raise exception 'لا تملك صلاحية عرض عمولة الخدمة';
  end if;

  return query
  select s.id, s.commission
  from public.services s
  where s.company_id = v_company;
end;
$$;

revoke all on function public.service_quote_commissions() from public, anon, authenticated, service_role;
grant execute on function public.service_quote_commissions() to authenticated;
