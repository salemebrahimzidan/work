-- How to carry out each service, shown from the new-transaction form.

alter table public.services
  add column if not exists steps text;

comment on column public.services.steps is
  'خطوات تنفيذ الخدمة. Shown when that service is chosen on a new transaction.';
