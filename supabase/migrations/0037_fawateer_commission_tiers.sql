-- Replace the سداد فواتير payment tiers. 0036 stays applied and is not rerun.
-- 0–300 = 5, above 300–1000 = 10, above 1000–1500 = 15,
-- above 1500–2000 = 20, above 2000–2500 = 25, above 2500–3000 = 30,
-- above 3000–3500 = 35, above 3500–4000 = 40.
-- A payment above 4000 is still rejected. The browser profit is still ignored.
-- Does not update existing transactions or service rows.
-- Does not grant access to transactions.profit or services.commission.

create or replace function public.fawateer_payment_commission(p_amount numeric)
returns numeric(14, 2)
language plpgsql
immutable
set search_path = public
as $$
begin
  if p_amount is null or p_amount = 'NaN'::numeric or p_amount < 0 then
    raise exception 'قيمة السداد غير صحيحة';
  end if;

  if p_amount > 4000 then
    raise exception 'لا توجد عمولة محددة لقيمة سداد أكبر من 4000 ر.س';
  end if;

  if p_amount <= 300 then
    return 5;
  end if;

  if p_amount <= 1000 then
    return 10;
  end if;

  if p_amount <= 1500 then
    return 15;
  end if;

  if p_amount <= 2000 then
    return 20;
  end if;

  if p_amount <= 2500 then
    return 25;
  end if;

  if p_amount <= 3000 then
    return 30;
  end if;

  if p_amount <= 3500 then
    return 35;
  end if;

  return 40;
end;
$$;

revoke all on function public.fawateer_payment_commission(numeric)
  from public, anon, authenticated, service_role;

comment on function public.fawateer_payment_commission(numeric) is
  'سداد فواتير only. 0–300 = 5, above 300–1000 = 10, above 1000–1500 = 15, above 1500–2000 = 20, above 2000–2500 = 25, above 2500–3000 = 30, above 3000–3500 = 35, above 3500–4000 = 40. Larger amounts are rejected.';
