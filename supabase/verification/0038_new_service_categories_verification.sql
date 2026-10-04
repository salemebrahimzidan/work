-- Read-only checks for 0038_new_service_categories.sql.
-- Run once in the Supabase SQL Editor after 0038 has been applied.
-- Expect the query below to return zero rows.
-- Does not insert or update services.

select code
from (
  values
    ('sdad'),
    ('taqeeb'),
    ('fawateer'),
    ('ijar'),
    ('tashirat'),
    ('tameen'),
    ('mutalabat'),
    ('taqib'),
    ('amal'),
    ('tamweel'),
    ('khassa'),
    ('zakat'),
    ('mawarid'),
    ('mawaeed'),
    ('manasat'),
    ('tadhakir')
) as required(code)
where not exists (
  select 1
  from pg_constraint
  where conname = 'services_category_check'
    and pg_get_constraintdef(oid) like '%' || required.code || '%'
);

-- An unknown category must not be allowed. Expect zero rows.
select conname
from pg_constraint
where conname = 'services_category_check'
  and pg_get_constraintdef(oid) like '%not_a_category%';

-- Fawateer pricing from 0037 is still the applied function. Expect zero rows.
select p.proname
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'fawateer_payment_commission'
  and (
    pg_get_functiondef(p.oid) not like '%<= 300%'
    or pg_get_functiondef(p.oid) not like '%return 40%'
    or pg_get_functiondef(p.oid) not like '%4000%'
  );
