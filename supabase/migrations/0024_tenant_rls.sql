-- Tenant isolation cutover for business tables.
-- Does not update or delete existing rows, profiles.role, or company memberships.
-- profiles policies stay on is_admin(). Business policies no longer use it.
-- Run this file as one script so the whole change commits or rolls back together.

-- ----------------------------------------------------------------------------
-- Customers. Active members of the active company. Delete stays owner/admin.
-- ----------------------------------------------------------------------------
drop policy if exists customers_select on public.customers;
create policy customers_select on public.customers
  for select to authenticated
  using (
    company_id = public.current_company_id()
    and public.is_company_member(company_id)
  );

drop policy if exists customers_insert on public.customers;
create policy customers_insert on public.customers
  for insert to authenticated
  with check (
    company_id = public.current_company_id()
    and public.is_company_member(company_id)
    and created_by = auth.uid()
  );

drop policy if exists customers_update on public.customers;
create policy customers_update on public.customers
  for update to authenticated
  using (
    company_id = public.current_company_id()
    and public.is_company_member(company_id)
  )
  with check (
    company_id = public.current_company_id()
    and public.is_company_member(company_id)
  );

drop policy if exists customers_delete_admin on public.customers;
create policy customers_delete_admin on public.customers
  for delete to authenticated
  using (
    company_id = public.current_company_id()
    and public.has_company_role(company_id, array['owner', 'admin'])
  );

-- ----------------------------------------------------------------------------
-- Transactions. Select and insert only. Direct update/delete stay denied.
-- ----------------------------------------------------------------------------
drop policy if exists transactions_select on public.transactions;
create policy transactions_select on public.transactions
  for select to authenticated
  using (
    company_id = public.current_company_id()
    and public.is_company_member(company_id)
  );

drop policy if exists transactions_insert on public.transactions;
create policy transactions_insert on public.transactions
  for insert to authenticated
  with check (
    company_id = public.current_company_id()
    and public.is_company_member(company_id)
    and created_by = auth.uid()
  );

-- ----------------------------------------------------------------------------
-- Services. Every active member can read. Only owner/admin can change them.
-- ----------------------------------------------------------------------------
drop policy if exists services_select on public.services;
create policy services_select on public.services
  for select to authenticated
  using (
    company_id = public.current_company_id()
    and public.is_company_member(company_id)
  );

drop policy if exists services_insert_admin on public.services;
create policy services_insert_admin on public.services
  for insert to authenticated
  with check (
    company_id = public.current_company_id()
    and public.has_company_role(company_id, array['owner', 'admin'])
  );

drop policy if exists services_update_admin on public.services;
create policy services_update_admin on public.services
  for update to authenticated
  using (
    company_id = public.current_company_id()
    and public.has_company_role(company_id, array['owner', 'admin'])
  )
  with check (
    company_id = public.current_company_id()
    and public.has_company_role(company_id, array['owner', 'admin'])
  );

drop policy if exists services_delete_admin on public.services;
create policy services_delete_admin on public.services
  for delete to authenticated
  using (
    company_id = public.current_company_id()
    and public.has_company_role(company_id, array['owner', 'admin'])
  );

-- ----------------------------------------------------------------------------
-- History. Members may read corrections for the active company.
-- Profit-change and deletion logs stay owner/admin. No write policies.
-- ----------------------------------------------------------------------------
drop policy if exists profit_corrections_select on public.profit_corrections;
create policy profit_corrections_select on public.profit_corrections
  for select to authenticated
  using (
    company_id = public.current_company_id()
    and public.is_company_member(company_id)
  );

drop policy if exists profit_corrections_insert_admin on public.profit_corrections;

drop policy if exists transaction_profit_changes_select on public.transaction_profit_changes;
create policy transaction_profit_changes_select on public.transaction_profit_changes
  for select to authenticated
  using (
    company_id = public.current_company_id()
    and public.has_company_role(company_id, array['owner', 'admin'])
  );

drop policy if exists transaction_deletions_select on public.transaction_deletions;
create policy transaction_deletions_select on public.transaction_deletions
  for select to authenticated
  using (
    company_id = public.current_company_id()
    and public.has_company_role(company_id, array['owner', 'admin'])
  );

-- ----------------------------------------------------------------------------
-- RPCs. company_id comes from the transaction row, not from the caller.
-- ----------------------------------------------------------------------------
create or replace function public.admin_update_transaction_profit(
  p_transaction_id uuid,
  p_new_profit numeric
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  old_profit numeric(14, 2);
  stored_profit numeric(14, 2);
  v_company_id uuid;
begin
  if auth.uid() is null then
    raise exception 'هذا الإجراء متاح للمشرفين فقط';
  end if;

  if p_new_profit is null or p_new_profit < 0 or p_new_profit > 999999999999.99 then
    raise exception 'قيمة الربح غير صحيحة';
  end if;

  stored_profit := round(p_new_profit, 2);

  select t.profit, t.company_id
    into old_profit, v_company_id
  from public.transactions t
  where t.id = p_transaction_id;

  if not found
     or v_company_id is distinct from public.current_company_id() then
    raise exception 'المعاملة غير موجودة';
  end if;

  if not public.has_company_role(v_company_id, array['owner', 'admin']) then
    raise exception 'هذا الإجراء متاح للمشرفين فقط';
  end if;

  perform set_config('app.admin_profit_update', 'on', true);

  update public.transactions
     set profit = stored_profit
   where id = p_transaction_id;

  insert into public.transaction_profit_changes (transaction_id, admin_id, old_profit, new_profit)
  values (p_transaction_id, auth.uid(), old_profit, stored_profit);
end;
$$;

create or replace function public.admin_delete_transaction(p_transaction_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  rec record;
begin
  if auth.uid() is null then
    raise exception 'هذا الإجراء متاح للمشرفين فقط';
  end if;

  select t.id, t.service_name, t.profit, t.company_id
    into rec
  from public.transactions t
  where t.id = p_transaction_id;

  if not found
     or rec.company_id is distinct from public.current_company_id() then
    raise exception 'المعاملة غير موجودة';
  end if;

  if not public.has_company_role(rec.company_id, array['owner', 'admin']) then
    raise exception 'هذا الإجراء متاح للمشرفين فقط';
  end if;

  insert into public.transaction_deletions (transaction_id, admin_id, service_name, deleted_profit)
  values (rec.id, auth.uid(), rec.service_name, rec.profit);

  perform set_config('app.admin_transaction_delete', 'on', true);

  delete from public.transactions where id = p_transaction_id;
end;
$$;

create or replace function public.set_transaction_status(
  p_transaction_id uuid,
  p_status text,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
begin
  if auth.uid() is null then
    raise exception 'لا تملك صلاحية تغيير حالة المعاملة';
  end if;

  select t.company_id
    into v_company_id
  from public.transactions t
  where t.id = p_transaction_id;

  if not found
     or v_company_id is distinct from public.current_company_id() then
    raise exception 'المعاملة غير موجودة';
  end if;

  if not public.is_company_member(v_company_id) then
    raise exception 'لا تملك صلاحية تغيير حالة المعاملة';
  end if;

  if p_status not in ('in_progress', 'completed', 'cancelled') then
    raise exception 'حالة المعاملة غير صحيحة';
  end if;

  if p_status = 'cancelled' and length(btrim(coalesce(p_reason, ''))) = 0 then
    raise exception 'سبب الإلغاء مطلوب';
  end if;

  perform set_config('app.transaction_status_update', 'on', true);

  update public.transactions
     set status = p_status,
         cancel_reason = case
           when p_status = 'cancelled' then btrim(p_reason)
           else null
         end
   where id = p_transaction_id;

  if not found then
    raise exception 'المعاملة غير موجودة';
  end if;
end;
$$;

revoke all on function public.admin_update_transaction_profit(uuid, numeric) from public, anon;
revoke all on function public.admin_delete_transaction(uuid) from public, anon;
revoke all on function public.set_transaction_status(uuid, text, text) from public, anon;
grant execute on function public.admin_update_transaction_profit(uuid, numeric) to authenticated;
grant execute on function public.admin_delete_transaction(uuid) to authenticated;
grant execute on function public.set_transaction_status(uuid, text, text) to authenticated;

-- ----------------------------------------------------------------------------
-- Future signups. Existing profiles are not updated (conflict does nothing).
-- No company membership is created here.
-- ----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    'pending'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;
grant execute on function public.handle_new_user() to supabase_auth_admin;
