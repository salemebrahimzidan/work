-- A waiting transaction can only move to in progress or be cancelled.
-- Completion is allowed only after it is in progress.

create or replace function public.guard_transaction_update()
returns trigger language plpgsql as $$
begin
  if current_setting('app.transaction_status_update', true) = 'on' then
    if new.id is distinct from old.id
       or new.customer_id is distinct from old.customer_id
       or new.service_name is distinct from old.service_name
       or new.note is distinct from old.note
       or new.created_by is distinct from old.created_by
       or new.created_at is distinct from old.created_at
       or new.transaction_value is distinct from old.transaction_value
       or new.profit is distinct from old.profit
    then
      raise exception 'لا يمكن تعديل غير حالة المعاملة';
    end if;

    if old.status = 'pending' then
      if new.status not in ('in_progress', 'cancelled') then
        raise exception 'المعاملة قيد الانتظار يمكن نقلها إلى قيد التنفيذ أو إلغاؤها فقط';
      end if;
    elsif old.status = 'in_progress' then
      if new.status not in ('completed', 'cancelled') then
        raise exception 'حالة المعاملة غير صحيحة';
      end if;
    else
      raise exception 'لا يمكن تغيير حالة معاملة منتهية';
    end if;

    if new.status = 'cancelled' and length(btrim(coalesce(new.cancel_reason, ''))) = 0 then
      raise exception 'سبب الإلغاء مطلوب';
    end if;

    if new.status <> 'cancelled' then
      new.cancel_reason := null;
    end if;

    return new;
  end if;

  if current_setting('app.admin_profit_update', true) is distinct from 'on' then
    raise exception
      'السجلات المالية غير قابلة للتعديل أو الحذف (%.% / %)',
      tg_table_schema, tg_table_name, tg_op;
  end if;

  if new.id is distinct from old.id
     or new.customer_id is distinct from old.customer_id
     or new.service_name is distinct from old.service_name
     or new.note is distinct from old.note
     or new.created_by is distinct from old.created_by
     or new.created_at is distinct from old.created_at
     or new.transaction_value is distinct from old.transaction_value
     or new.status is distinct from old.status
     or new.cancel_reason is distinct from old.cancel_reason
     or new.profit is null
     or new.profit < 0
  then
    raise exception 'لا يمكن تعديل غير عمولة المكتب';
  end if;

  return new;
end;
$$;
