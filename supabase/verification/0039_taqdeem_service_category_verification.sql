-- Read-only checks for 0039_taqdeem_service_category.sql.
-- Run once in the Supabase SQL Editor after 0039 has been applied.
-- Expect every query below to return zero rows.
-- Does not insert or update services.

-- 1–4. All 17 category codes are in the check. taqdeem is included.
-- Quoted match so taqib is not confused with taqdeem.
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
    ('tadhakir'),
    ('taqdeem')
) as required(code)
where not exists (
  select 1
  from pg_constraint
  where conname = 'services_category_check'
    and position('''' || required.code || '''' in pg_get_constraintdef(oid)) > 0
);

-- An unknown category must not be allowed.
select conname
from pg_constraint
where conname = 'services_category_check'
  and position('''not_a_category''' in pg_get_constraintdef(oid)) > 0;

-- 5. Applied 0037 Fawateer tiers are unchanged.
select p.proname
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'fawateer_payment_commission'
  and (
    pg_get_functiondef(p.oid) not like '%p_amount <= 300%'
    or pg_get_functiondef(p.oid) not like '%return 5%'
    or pg_get_functiondef(p.oid) not like '%p_amount <= 1000%'
    or pg_get_functiondef(p.oid) not like '%return 10%'
    or pg_get_functiondef(p.oid) not like '%p_amount <= 1500%'
    or pg_get_functiondef(p.oid) not like '%return 15%'
    or pg_get_functiondef(p.oid) not like '%p_amount <= 2000%'
    or pg_get_functiondef(p.oid) not like '%return 20%'
    or pg_get_functiondef(p.oid) not like '%p_amount <= 2500%'
    or pg_get_functiondef(p.oid) not like '%return 25%'
    or pg_get_functiondef(p.oid) not like '%p_amount <= 3000%'
    or pg_get_functiondef(p.oid) not like '%return 30%'
    or pg_get_functiondef(p.oid) not like '%p_amount <= 3500%'
    or pg_get_functiondef(p.oid) not like '%return 35%'
    or pg_get_functiondef(p.oid) not like '%return 40%'
    or pg_get_functiondef(p.oid) not like '%p_amount > 4000%'
  );

-- 6. Profit and commission stay hidden from API roles.
select table_name, column_name, grantee
from information_schema.column_privileges
where table_schema = 'public'
  and grantee in ('authenticated', 'anon', 'PUBLIC')
  and (
    (table_name = 'services' and column_name = 'commission')
    or (table_name = 'transactions' and column_name = 'profit')
  );

select grantee
from information_schema.routine_privileges
where routine_schema = 'public'
  and routine_name = 'fawateer_payment_commission'
  and grantee in ('PUBLIC', 'anon', 'authenticated', 'service_role');
