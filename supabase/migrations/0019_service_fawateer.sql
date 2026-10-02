-- Add سداد فواتير as a third service catalog.

alter table public.services
  drop constraint if exists services_category_check;

alter table public.services
  add constraint services_category_check
  check (category in ('sdad', 'taqeeb', 'fawateer'));

comment on column public.services.category is
  'sdad = سداد مدفوعات حكومية, taqeeb = تعقيب, fawateer = سداد فواتير.';
