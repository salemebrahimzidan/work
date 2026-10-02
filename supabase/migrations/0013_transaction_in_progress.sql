-- A pending transaction can move to in progress or be cancelled.
-- Only an in-progress transaction can be completed.

alter table public.transactions
  drop constraint if exists transactions_status_check;

alter table public.transactions
  add constraint transactions_status_check
  check (status in ('pending', 'in_progress', 'completed', 'cancelled'));

comment on column public.transactions.status is
  'pending when created, then in_progress or cancelled. Completed only from in_progress.';

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

create or replace function public.set_transaction_status(
  p_transaction_id uuid,
  p_status text,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.is_member() then
    raise exception 'لا تملك صلاحية تغيير حالة المعاملة';
  end if;

  if p_status not in ('in_progress', 'completed', 'cancelled') then
    raise exception 'حالة المعاملة غير صحيحة';
  end if;

  if p_status = 'cancelled' and length(btrim(coalesce(p_reason, ''))) = 0 then
    raise exception 'سبب الإلغاء مطلوب';
  end if;

  perform set_config('app.transaction_status_update', 'on', true);

  update public.transactions
     set status = p_status,
         cancel_reason = case
           when p_status = 'cancelled' then btrim(p_reason)
           else null
         end
   where id = p_transaction_id;

  if not found then
    raise exception 'المعاملة غير موجودة';
  end if;
end;
$$;
