-- سداد فواتير commission is calculated from the payment amount at insert.
-- 0–750 = 10, above 750–1500 = 15, above 1500–3000 = 20,
-- above 3000–3500 = 25, above 3500–4000 = 30.
-- A payment above 4000 is rejected. The browser profit is ignored.
-- Other service categories keep the catalog commission copy.
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

  if p_amount <= 750 then
    return 10;
  end if;

  if p_amount <= 1500 then
    return 15;
  end if;

  if p_amount <= 3000 then
    return 20;
  end if;

  if p_amount <= 3500 then
    return 25;
  end if;

  return 30;
end;
$$;

revoke all on function public.fawateer_payment_commission(numeric)
  from public, anon, authenticated, service_role;

comment on function public.fawateer_payment_commission(numeric) is
  'سداد فواتير only. 0–750 = 10, above 750–1500 = 15, above 1500–3000 = 20, above 3000–3500 = 25, above 3500–4000 = 30. Larger amounts are rejected.';

create or replace function public.transactions_copy_catalog_profit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_manual boolean;
  v_commission numeric(14, 2);
  v_category text;
begin
  if auth.uid() is null then
    return new;
  end if;

  if new.company_id is null then
    raise exception 'العميل غير موجود';
  end if;

  select s.manual, s.commission, s.category
    into v_manual, v_commission, v_category
  from public.services s
  where s.company_id = new.company_id
    and s.name = new.service_name;

  if not found then
    raise exception 'الخدمة غير موجودة';
  end if;

  if v_category = 'fawateer' then
    new.profit := public.fawateer_payment_commission(new.transaction_value);
    return new;
  end if;

  if not v_manual then
    if v_commission is null then
      raise exception 'سعر هذه الخدمة غير محدد في النظام';
    end if;
    new.profit := round(v_commission, 2);
    return new;
  end if;

  if not public.has_company_role(new.company_id, array['owner', 'admin']) then
    raise exception 'لا تملك صلاحية إتمام هذه المعاملة';
  end if;

  if new.profit is null or new.profit < 0 or new.profit > 999999999999.99 then
    raise exception 'قيمة المعاملة غير مكتملة';
  end if;

  new.profit := round(new.profit, 2);
  return new;
end;
$$;

revoke all on function public.transactions_copy_catalog_profit()
  from public, anon, authenticated, service_role;

create or replace function public.admin_update_transaction_profit(
  p_transaction_id uuid,
  p_new_profit numeric
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  old_profit numeric(14, 2);
  stored_profit numeric(14, 2);
  v_company_id uuid;
  v_category text;
begin
  if auth.uid() is null then
    raise exception 'هذا الإجراء متاح للمشرفين فقط';
  end if;

  if p_new_profit is null or p_new_profit < 0 or p_new_profit > 999999999999.99 then
    raise exception 'قيمة الربح غير صحيحة';
  end if;

  stored_profit := round(p_new_profit, 2);

  select t.profit, t.company_id, s.category
    into old_profit, v_company_id, v_category
  from public.transactions t
  left join public.services s
    on s.company_id = t.company_id
   and s.name = t.service_name
  where t.id = p_transaction_id;

  if not found
     or v_company_id is distinct from public.current_company_id() then
    raise exception 'المعاملة غير موجودة';
  end if;

  if not public.has_company_role(v_company_id, array['owner', 'admin']) then
    raise exception 'هذا الإجراء متاح للمشرفين فقط';
  end if;

  if v_category = 'fawateer' then
    raise exception 'لا يمكن تعديل عمولة سداد فواتير';
  end if;

  perform set_config('app.admin_profit_update', 'on', true);

  update public.transactions
     set profit = stored_profit
   where id = p_transaction_id;

  insert into public.transaction_profit_changes (transaction_id, admin_id, old_profit, new_profit)
  values (p_transaction_id, auth.uid(), old_profit, stored_profit);
end;
$$;
