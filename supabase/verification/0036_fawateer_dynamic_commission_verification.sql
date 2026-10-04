-- Read-only checks for 0036_fawateer_dynamic_commission.sql.
-- Run once in the Supabase SQL Editor after 0036 has been applied.
-- Expect every failing query below to return zero rows.
-- The function calls do not insert or update transactions.

-- 1. Tier boundaries. Expect zero rows.
select amount, expected, public.fawateer_payment_commission(amount) as actual
from (
  values
    (0::numeric, 10::numeric),
    (0.01, 10),
    (749.99, 10),
    (750, 10),
    (750.01, 15),
    (1499.99, 15),
    (1500, 15),
    (1500.01, 20),
    (2999.99, 20),
    (3000, 20),
    (3000.01, 25),
    (3499.99, 25),
    (3500, 25),
    (3500.01, 30),
    (3999.99, 30),
    (4000, 30)
) as tiers(amount, expected)
where public.fawateer_payment_commission(amount) is distinct from expected;

-- 2. 4000.01, a negative amount, and NaN are rejected.
do $$
declare
  v_message text;
begin
  begin
    perform public.fawateer_payment_commission(4000.01);
    v_message := 'accepted';
  exception
    when others then
      v_message := sqlerrm;
  end;
  if v_message not like '%4000%' then
    raise exception '4000.01 was not rejected: %', v_message;
  end if;

  begin
    perform public.fawateer_payment_commission(-1);
    v_message := 'accepted';
  exception
    when others then
      v_message := sqlerrm;
  end;
  if v_message not like '%قيمة السداد غير صحيحة%' then
    raise exception 'negative amount was not rejected: %', v_message;
  end if;

  begin
    perform public.fawateer_payment_commission('NaN'::numeric);
    v_message := 'accepted';
  exception
    when others then
      v_message := sqlerrm;
  end;
  if v_message not like '%قيمة السداد غير صحيحة%' then
    raise exception 'NaN was not rejected: %', v_message;
  end if;
end $$;

-- 3. The pricing function is not executable by API roles.
select grantee
from information_schema.routine_privileges
where routine_schema = 'public'
  and routine_name = 'fawateer_payment_commission'
  and grantee in ('PUBLIC', 'anon', 'authenticated', 'service_role');
-- Expect zero rows.

-- 4. The insert trigger still derives Fawateer profit and catalog profit.
select p.proname
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'transactions_copy_catalog_profit'
  and (
    pg_get_functiondef(p.oid) not like '%fawateer_payment_commission%'
    or pg_get_functiondef(p.oid) not like '%v_category = ''fawateer''%'
    or pg_get_functiondef(p.oid) not like '%new.profit := round(v_commission, 2)%'
    or pg_get_functiondef(p.oid) not like '%not v_manual%'
    or p.prosecdef is not true
  );
-- Expect zero rows.

-- 5. An owner cannot replace a Fawateer commission through the admin edit path.
select p.proname
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'admin_update_transaction_profit'
  and pg_get_functiondef(p.oid) not like '%لا يمكن تعديل عمولة سداد فواتير%';
-- Expect zero rows.

-- 6. Commission and profit SELECT stay denied.
select table_name, column_name, grantee
from information_schema.column_privileges
where table_schema = 'public'
  and grantee in ('authenticated', 'anon', 'PUBLIC')
  and (
    (table_name = 'services' and column_name = 'commission')
    or (table_name = 'transactions' and column_name = 'profit')
  );
-- Expect zero rows.

-- 7. The copy trigger is still before insert and is not callable by API roles.
select t.tgname
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname = 'transactions'
  and t.tgname = 'transactions_copy_catalog_profit'
  and (t.tgtype & 2) = 0;
-- Expect zero rows. Bit 2 is BEFORE.

select grantee
from information_schema.routine_privileges
where routine_schema = 'public'
  and routine_name = 'transactions_copy_catalog_profit'
  and grantee in ('PUBLIC', 'anon', 'authenticated', 'service_role');
-- Expect zero rows.

-- Manual checks with a company JWT, after 0036 is applied. Do not keep the rows.
-- Fawateer service, payment 500, caller profit 999 -> stored profit 10, value 500.
-- Payment 750 -> stored profit 10.
-- Payment 750.01 -> stored profit 15.
-- Payment 1500 -> stored profit 15.
-- Payment 1500.01 -> stored profit 20.
-- Payment 3000 -> stored profit 20.
-- Payment 3000.01 -> stored profit 25.
-- Payment 3500 -> stored profit 25.
-- Payment 3500.01 -> stored profit 30.
-- Payment 4000 -> stored profit 30.
-- Payment 4000.01 -> rejected.
-- A non-Fawateer catalog service still stores services.commission, not the caller profit.
-- A manager select=profit is denied.
-- admin_update_transaction_profit on the Fawateer row is rejected.
-- Delete the test transactions afterward.
