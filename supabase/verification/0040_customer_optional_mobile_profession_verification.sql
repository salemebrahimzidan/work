-- Read-only checks for 0040_customer_optional_mobile_profession.sql.
-- Run once in the Supabase SQL Editor after 0040 has been applied.
-- Expect every failing query below to return zero rows.

-- 1. profession exists and mobile may be absent.
select column_name, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'customers'
  and column_name in ('mobile', 'mobile_normalized', 'profession')
  and is_nullable is distinct from 'YES';
-- Expect zero rows.

-- 2. The shared customer list exposes profession and still hides nothing required below.
select a.attname
from pg_attribute a
join pg_class c on c.oid = a.attrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname = 'customer_summary'
  and a.attnum > 0
  and not a.attisdropped
  and a.attname = 'profession';
-- Expect one row.

-- 3. A blank mobile is stored as null and is not treated as a duplicate number.
select p.proname
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'customers_guard_mobile'
  and (
    pg_get_functiondef(p.oid) not like '%new.mobile := null%'
    or pg_get_functiondef(p.oid) not like '%new.mobile_normalized := null%'
    or pg_get_functiondef(p.oid) not like '%المهنة غير صحيحة%'
  );
-- Expect zero rows.
