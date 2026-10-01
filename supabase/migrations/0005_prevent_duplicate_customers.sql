-- ============================================================================
-- One customer per normalized mobile number.
-- Existing customers, including ones that already share a number, are kept.
-- A UNIQUE index is created only when the current data has no duplicates,
-- so this migration does not fail on an already-duplicated database.
-- The trigger blocks new duplicates either way.
-- ============================================================================

create or replace function public.normalize_mobile(p_mobile text)
returns text
language sql
immutable
as $$
  select regexp_replace(coalesce(p_mobile, ''), '[[:space:]().\-]+', '', 'g')
$$;

alter table public.customers
  add column if not exists mobile_normalized text;

update public.customers
set mobile_normalized = coalesce(nullif(public.normalize_mobile(mobile), ''), btrim(mobile))
where mobile_normalized is distinct from coalesce(nullif(public.normalize_mobile(mobile), ''), btrim(mobile));

alter table public.customers
  alter column mobile_normalized set not null;

alter table public.customers
  drop constraint if exists customers_mobile_normalized_not_blank;

alter table public.customers
  add constraint customers_mobile_normalized_not_blank
  check (length(mobile_normalized) > 0);

comment on column public.customers.mobile_normalized is
  'Mobile with spaces and separators removed. Identifies the customer. Existing duplicate values are left as they are.';

create or replace function public.customers_guard_mobile()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  normalized text;
begin
  normalized := coalesce(nullif(public.normalize_mobile(new.mobile), ''), btrim(new.mobile));
  if normalized is null or length(normalized) = 0 then
    raise exception 'رقم الجوال غير صحيح';
  end if;

  new.mobile_normalized := normalized;

  -- Existing rows that already share a number can still be edited.
  -- A new number, or a changed number, cannot match another customer.
  if tg_op = 'INSERT' or new.mobile_normalized is distinct from old.mobile_normalized then
    if exists (
      select 1
      from public.customers c
      where c.mobile_normalized = new.mobile_normalized
        and c.id is distinct from new.id
    ) then
      raise exception 'هذا العميل مسجل مسبقًا';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists customers_guard_mobile on public.customers;
create trigger customers_guard_mobile
  before insert or update on public.customers
  for each row execute function public.customers_guard_mobile();

create index if not exists customers_mobile_normalized_idx
  on public.customers (mobile_normalized);

do $$
begin
  if not exists (
    select 1
    from public.customers
    group by mobile_normalized
    having count(*) > 1
  ) then
    drop index if exists public.customers_mobile_normalized_idx;
    create unique index if not exists customers_mobile_normalized_key
      on public.customers (mobile_normalized);
  end if;
end $$;

revoke all on function public.normalize_mobile(text) from public, anon;
grant execute on function public.normalize_mobile(text) to authenticated;
