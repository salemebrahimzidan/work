-- Read-only checks for 0035_fawateer_biller_categories.sql.
-- Run once in the Supabase SQL Editor after 0035 has been applied.
-- Expect every failing query below to return zero rows.

-- 1. The column exists and is selectable by authenticated only.
select grantee, privilege_type
from information_schema.column_privileges
where table_schema = 'public'
  and table_name = 'services'
  and column_name = 'biller_category'
  and grantee in ('PUBLIC', 'anon', 'authenticated', 'service_role')
order by 1;
-- Expect one row: authenticated SELECT.
-- Expect no PUBLIC, anon, or service_role row.

-- 2. Commission and profit SELECT stay denied.
select table_name, column_name, grantee
from information_schema.column_privileges
where table_schema = 'public'
  and grantee in ('authenticated', 'anon', 'PUBLIC')
  and (
    (table_name = 'services' and column_name = 'commission')
    or (table_name = 'transactions' and column_name = 'profit')
  );
-- Expect zero rows.

-- 3. The check allows only the eight categories and rejects an "all" value.
select pg_get_constraintdef(c.oid) as definition
from pg_constraint c
join pg_class t on t.oid = c.conrelid
join pg_namespace n on n.oid = t.relnamespace
where n.nspname = 'public'
  and t.relname = 'services'
  and c.conname = 'services_biller_category_check';
-- Expect one row containing communications, government, financial, internet,
-- travel, municipalities, media_education, and redbull_mobile.
-- Expect the definition not to contain الكل or an all token.

select c.conname
from pg_constraint c
join pg_class t on t.oid = c.conrelid
join pg_namespace n on n.oid = t.relnamespace
where n.nspname = 'public'
  and t.relname = 'services'
  and c.conname = 'services_biller_category_check'
  and (
    pg_get_constraintdef(c.oid) ilike '%الكل%'
    or pg_get_constraintdef(c.oid) ~* '[^a-z]all[^a-z]'
    or pg_get_constraintdef(c.oid) not like '%communications%'
    or pg_get_constraintdef(c.oid) not like '%government%'
    or pg_get_constraintdef(c.oid) not like '%financial%'
    or pg_get_constraintdef(c.oid) not like '%internet%'
    or pg_get_constraintdef(c.oid) not like '%travel%'
    or pg_get_constraintdef(c.oid) not like '%municipalities%'
    or pg_get_constraintdef(c.oid) not like '%media_education%'
    or pg_get_constraintdef(c.oid) not like '%redbull_mobile%'
  );
-- Expect zero rows.

-- 4. No service row was assigned a category by this migration.
-- This only proves the migration file did not contain an UPDATE.
-- Existing فواتير rows may still have a null biller_category.
select count(*) as fawateer_without_category
from public.services
where category = 'fawateer'
  and biller_category is null;
-- Informational. A number above zero means those services are not listed
-- under any of the eight categories until they are saved with one.
