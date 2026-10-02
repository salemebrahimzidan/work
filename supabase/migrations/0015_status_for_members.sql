-- Any approved user may move a transaction through its status.
-- Waiting can become in progress or cancelled.
-- In progress can become completed or cancelled.

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
