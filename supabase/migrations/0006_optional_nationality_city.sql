-- Nationality and city are optional. Existing values are left unchanged.

alter table public.customers alter column nationality drop not null;
alter table public.customers alter column city drop not null;

do $$
declare
  r record;
begin
  for r in
    select con.conname
    from pg_constraint con
    where con.conrelid = 'public.customers'::regclass
      and con.contype = 'c'
      and (
        pg_get_constraintdef(con.oid) like '%nationality%'
        or pg_get_constraintdef(con.oid) like '%city%'
      )
      and pg_get_constraintdef(con.oid) not like '%mobile_normalized%'
  loop
    execute format('alter table public.customers drop constraint %I', r.conname);
  end loop;
end $$;

-- Blank values stay out of the dashboard groups.
create or replace view public.customers_by_nationality
with (security_invoker = true) as
select nationality as label, count(*)::int as total
from public.customers
where nationality is not null and btrim(nationality) <> ''
group by nationality
order by count(*) desc, nationality;

create or replace view public.customers_by_city
with (security_invoker = true) as
select city as label, count(*)::int as total
from public.customers
where city is not null and btrim(city) <> ''
group by city
order by count(*) desc, city;
