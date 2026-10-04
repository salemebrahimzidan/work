-- Add the remaining service catalogs beside سداد، تعقيب، and سداد فواتير.

alter table public.services
  drop constraint if exists services_category_check;

alter table public.services
  add constraint services_category_check
  check (category in (
    'sdad',
    'taqeeb',
    'fawateer',
    'ijar',
    'tashirat',
    'tameen',
    'mutalabat',
    'taqib',
    'amal',
    'tamweel',
    'khassa',
    'zakat'
  ));

comment on column public.services.category is
  'sdad = سداد مدفوعات حكومية, taqeeb = خدمات وزارة التجارة, fawateer = سداد فواتير, ijar = عقود الإيجار والعقود العامة, tashirat = التأشيرات ووزارة الخارجية, tameen = التأمين الطبي والسيارات, mutalabat = المطالبات وناجز والتأمينات والحوادث, taqib = التعقيب, amal = العمل الحكومي, tamweel = التمويل والبنوك, khassa = المعاملات الخاصة, zakat = الزكاة والضريبة والتأمينات والقوائم المالية.';
