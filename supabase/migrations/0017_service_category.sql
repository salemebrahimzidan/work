-- Split the service catalog into سداد and تعقيب.
-- Existing rows stay in سداد.

alter table public.services
  add column if not exists category text not null default 'sdad';

alter table public.services
  drop constraint if exists services_category_check;

alter table public.services
  add constraint services_category_check
  check (category in ('sdad', 'taqeeb'));

comment on column public.services.category is
  'sdad = سداد, taqeeb = تعقيب.';
