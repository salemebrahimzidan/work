-- Read-only checks for 0037_fawateer_commission_tiers.sql.
-- Run once in the Supabase SQL Editor after 0037 has been applied.
-- Expect every failing query below to return zero rows.
-- The function calls do not insert or update transactions.
-- Do not rerun 0036.

-- 1. Tier boundaries. Expect zero rows.
select amount, expected, public.fawateer_payment_commission(amount) as actual
from (
  values
    (0::numeric, 5::numeric),
    (0.01, 5),
    (299.99, 5),
    (300, 5),
    (300.01, 10),
    (999.99, 10),
    (1000, 10),
    (1000.01, 15),
    (1499.99, 15),
    (1500, 15),
    (1500.01, 20),
    (1999.99, 20),
    (2000, 20),
    (2000.01, 25),
    (2499.99, 25),
    (2500, 25),
    (2500.01, 30),
    (2999.99, 30),
    (3000, 30),
    (3000.01, 35),
    (3499.99, 35),
    (3500, 35),
    (3500.01, 40),
    (3999.99, 40),
    (4000, 40)
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

-- 3. The pricing function is still not executable by API roles.
select grantee
from information_schema.routine_privileges
where routine_schema = 'public'
  and routine_name = 'fawateer_payment_commission'
  and grantee in ('PUBLIC', 'anon', 'authenticated', 'service_role');
-- Expect zero rows.

-- 4. The insert trigger still derives Fawateer profit from the payment amount.
select p.proname
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'transactions_copy_catalog_profit'
  and (
    pg_get_functiondef(p.oid) not like '%fawateer_payment_commission(new.transaction_value)%'
    or pg_get_functiondef(p.oid) not like '%v_category = ''fawateer''%'
    or pg_get_functiondef(p.oid) not like '%new.profit := round(v_commission, 2)%'
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

-- 7. The copy trigger stays BEFORE INSERT and is not callable by API roles.
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
