-- Each service carries the transaction amount and office commission.
-- Choosing that service on a new transaction fills both fields from this table.

create table if not exists public.services (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  transaction_value numeric(14, 2),
  commission numeric(14, 2),
  manual boolean not null default false,
  sort_order integer not null default 0,
  constraint services_name_not_blank check (length(btrim(name)) > 0),
  constraint services_name_key unique (name),
  constraint services_transaction_value_nonnegative check (
    transaction_value is null
    or (transaction_value >= 0 and transaction_value <= 999999999999.99)
  ),
  constraint services_commission_nonnegative check (
    commission is null
    or (commission >= 0 and commission <= 999999999999.99)
  )
);

comment on table public.services is
  'Catalog prices. transaction_value is قيمة المعاملة and commission is عمولة المكتب.';
comment on column public.services.manual is
  'When true, the transaction form leaves both amounts for the user to type.';

insert into public.services (name, sort_order, manual)
values
  ('تجديد إقامة', 1, false),
  ('نقل كفالة', 2, false),
  ('إصدار تأشيرة', 3, false),
  ('تجديد رخصة', 4, false),
  ('تأمين طبي', 5, false),
  ('خروج وعودة', 6, false),
  ('تجديد جواز', 7, false),
  ('خدمة أخرى', 8, true)
on conflict (name) do nothing;

alter table public.services enable row level security;

drop policy if exists services_select on public.services;
create policy services_select on public.services
  for select to authenticated
  using (public.is_member());

drop policy if exists services_insert_admin on public.services;
create policy services_insert_admin on public.services
  for insert to authenticated
  with check (public.is_admin());

drop policy if exists services_update_admin on public.services;
create policy services_update_admin on public.services
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists services_delete_admin on public.services;
create policy services_delete_admin on public.services
  for delete to authenticated
  using (public.is_admin());

revoke all on public.services from anon, authenticated;
grant select, insert, update, delete on public.services to authenticated;
