-- A new customer needs a name only. Mobile stays unique inside the company when it is present.
-- Customers without a mobile do not share one normalized value.
-- profession is optional. Existing rows are unchanged.

alter table public.customers
  add column if not exists profession text;

alter table public.customers
  drop constraint if exists customers_profession_check;

alter table public.customers
  add constraint customers_profession_check
  check (
    profession is null
    or (
      profession = btrim(profession)
      and length(profession) between 1 and 80
      and profession !~ '[[:cntrl:]]'
    )
  );

comment on column public.customers.profession is
  'المهنة. اختيارية، حتى 80 حرفاً.';

alter table public.customers
  alter column mobile drop not null;

alter table public.customers
  drop constraint if exists customers_mobile_check;

alter table public.customers
  add constraint customers_mobile_check
  check (mobile is null or length(btrim(mobile)) > 0);

alter table public.customers
  alter column mobile_normalized drop not null;

alter table public.customers
  drop constraint if exists customers_mobile_normalized_not_blank;

alter table public.customers
  add constraint customers_mobile_normalized_not_blank
  check (mobile_normalized is null or length(mobile_normalized) > 0);

create or replace function public.customers_guard_mobile()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  normalized text;
begin
  if tg_op = 'INSERT' then
    new.company_id := public.current_company_id();
    if new.company_id is null then
      raise exception 'لا تملك صلاحية هذه الشركة';
    end if;
  else
    new.company_id := old.company_id;
  end if;

  if new.profession is not null then
    new.profession := btrim(new.profession);
    if new.profession = '' then
      new.profession := null;
    elsif length(new.profession) > 80 or new.profession ~ '[[:cntrl:]]' then
      raise exception 'المهنة غير صحيحة';
    end if;
  end if;

  if new.mobile is null or btrim(new.mobile) = '' then
    new.mobile := null;
    new.mobile_normalized := null;
    return new;
  end if;

  normalized := coalesce(nullif(public.normalize_mobile(new.mobile), ''), btrim(new.mobile));
  if normalized is null or length(normalized) = 0 then
    raise exception 'رقم الجوال غير صحيح';
  end if;

  new.mobile_normalized := normalized;

  if tg_op = 'INSERT' or new.mobile_normalized is distinct from old.mobile_normalized then
    if exists (
      select 1
      from public.customers c
      where c.company_id = new.company_id
        and c.mobile_normalized = new.mobile_normalized
        and c.id is distinct from new.id
    ) then
      raise exception 'هذا العميل مسجل مسبقًا';
    end if;
  end if;

  return new;
end;
$$;

drop view if exists public.customer_summary;

create view public.customer_summary
with (security_invoker = true) as
select
  c.id,
  c.full_name,
  c.mobile,
  c.profession,
  c.nationality,
  c.city,
  c.district,
  c.created_at,
  coalesce(agg.transactions_count, 0)::int as transactions_count,
  coalesce(agg.total_transaction_value, 0)::numeric(14, 2) as total_transaction_value,
  c.national_id
from public.customers c
left join (
  select
    t.customer_id,
    count(t.id)::int as transactions_count,
    coalesce(sum(t.transaction_value), 0)::numeric(14, 2) as total_transaction_value
  from public.transactions t
  group by t.customer_id
) agg on agg.customer_id = c.id;

revoke all on table public.customer_summary from public, anon, authenticated, service_role;
grant select on table public.customer_summary to authenticated;
