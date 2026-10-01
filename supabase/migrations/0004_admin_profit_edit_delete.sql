-- ============================================================================
-- Admin may change a transaction's profit, or delete the transaction.
-- Direct UPDATE/DELETE stays denied for every authenticated user.
-- Normal users cannot call these functions successfully.
-- Existing rows are not modified by this migration.
-- ============================================================================

-- Historical corrections must not block deleting a transaction, and the
-- correction row itself is not removed.
do $$
declare
  fk_name text;
begin
  select c.conname into fk_name
  from pg_constraint c
  join pg_attribute a
    on a.attrelid = c.conrelid
   and a.attnum = any (c.conkey)
  where c.conrelid = 'public.profit_corrections'::regclass
    and c.contype = 'f'
    and a.attname = 'transaction_id';

  if fk_name is not null then
    execute format('alter table public.profit_corrections drop constraint %I', fk_name);
  end if;
end $$;

create table if not exists public.transaction_profit_changes (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null,
  admin_id uuid not null,
  old_profit numeric(14, 2) not null,
  new_profit numeric(14, 2) not null,
  changed_at timestamptz not null default now()
);

create table if not exists public.transaction_deletions (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null,
  admin_id uuid not null,
  service_name text not null,
  deleted_profit numeric(14, 2) not null,
  deleted_at timestamptz not null default now()
);

create index if not exists transaction_profit_changes_tx_idx
  on public.transaction_profit_changes (transaction_id, changed_at desc);
create index if not exists transaction_deletions_tx_idx
  on public.transaction_deletions (transaction_id, deleted_at desc);

-- Audit rows are append-only, including for the table owner.
drop trigger if exists transaction_profit_changes_no_update on public.transaction_profit_changes;
create trigger transaction_profit_changes_no_update
  before update on public.transaction_profit_changes
  for each row execute function public.block_write();

drop trigger if exists transaction_profit_changes_no_delete on public.transaction_profit_changes;
create trigger transaction_profit_changes_no_delete
  before delete on public.transaction_profit_changes
  for each row execute function public.block_write();

drop trigger if exists transaction_deletions_no_update on public.transaction_deletions;
create trigger transaction_deletions_no_update
  before update on public.transaction_deletions
  for each row execute function public.block_write();

drop trigger if exists transaction_deletions_no_delete on public.transaction_deletions;
create trigger transaction_deletions_no_delete
  before delete on public.transaction_deletions
  for each row execute function public.block_write();

-- A direct UPDATE is still rejected. The admin function sets a transaction-local
-- flag, and even then only the profit column may differ.
create or replace function public.guard_transaction_update()
returns trigger language plpgsql as $$
begin
  if current_setting('app.admin_profit_update', true) is distinct from 'on' then
    raise exception
      'السجلات المالية غير قابلة للتعديل أو الحذف (%.% / %)',
      tg_table_schema, tg_table_name, tg_op;
  end if;

  if new.id is distinct from old.id
     or new.customer_id is distinct from old.customer_id
     or new.service_name is distinct from old.service_name
     or new.note is distinct from old.note
     or new.created_by is distinct from old.created_by
     or new.created_at is distinct from old.created_at
     or new.profit is null
     or new.profit < 0
  then
    raise exception 'لا يمكن تعديل غير مبلغ الربح';
  end if;

  return new;
end;
$$;

create or replace function public.guard_transaction_delete()
returns trigger language plpgsql as $$
begin
  if current_setting('app.admin_transaction_delete', true) is distinct from 'on' then
    raise exception
      'السجلات المالية غير قابلة للتعديل أو الحذف (%.% / %)',
      tg_table_schema, tg_table_name, tg_op;
  end if;
  return old;
end;
$$;

drop trigger if exists transactions_no_update on public.transactions;
create trigger transactions_no_update
  before update on public.transactions
  for each row execute function public.guard_transaction_update();

drop trigger if exists transactions_no_delete on public.transactions;
create trigger transactions_no_delete
  before delete on public.transactions
  for each row execute function public.guard_transaction_delete();

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
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'هذا الإجراء متاح للمشرفين فقط';
  end if;

  if p_new_profit is null or p_new_profit < 0 or p_new_profit > 999999999999.99 then
    raise exception 'قيمة الربح غير صحيحة';
  end if;

  stored_profit := round(p_new_profit, 2);

  select t.profit into old_profit
  from public.transactions t
  where t.id = p_transaction_id;

  if not found then
    raise exception 'المعاملة غير موجودة';
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
  if auth.uid() is null or not public.is_admin() then
    raise exception 'هذا الإجراء متاح للمشرفين فقط';
  end if;

  select t.id, t.service_name, t.profit
    into rec
  from public.transactions t
  where t.id = p_transaction_id;

  if not found then
    raise exception 'المعاملة غير موجودة';
  end if;

  insert into public.transaction_deletions (transaction_id, admin_id, service_name, deleted_profit)
  values (rec.id, auth.uid(), rec.service_name, rec.profit);

  perform set_config('app.admin_transaction_delete', 'on', true);

  delete from public.transactions where id = p_transaction_id;
end;
$$;

alter table public.transaction_profit_changes enable row level security;
alter table public.transaction_deletions enable row level security;

drop policy if exists transaction_profit_changes_select on public.transaction_profit_changes;
create policy transaction_profit_changes_select on public.transaction_profit_changes
  for select to authenticated using (public.is_admin());

drop policy if exists transaction_deletions_select on public.transaction_deletions;
create policy transaction_deletions_select on public.transaction_deletions
  for select to authenticated using (public.is_admin());

revoke all on public.transaction_profit_changes from anon, authenticated;
revoke all on public.transaction_deletions from anon, authenticated;
grant select on public.transaction_profit_changes to authenticated;
grant select on public.transaction_deletions to authenticated;

-- No UPDATE or DELETE grant is added on transactions.
revoke all on function public.admin_update_transaction_profit(uuid, numeric) from public, anon;
revoke all on function public.admin_delete_transaction(uuid) from public, anon;
grant execute on function public.admin_update_transaction_profit(uuid, numeric) to authenticated;
grant execute on function public.admin_delete_transaction(uuid) to authenticated;
