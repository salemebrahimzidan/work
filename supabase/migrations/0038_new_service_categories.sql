-- Allow the four service sections already used by the app.
-- 0033 stays applied and is not rerun. amal is not renamed.
-- Does not update existing rows.
-- Does not change commission, profit, RLS, or the Fawateer pricing function.

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
    'zakat',
    'mawarid',
    'mawaeed',
    'manasat',
    'tadhakir'
  ));

comment on column public.services.category is
  'sdad = سداد مدفوعات حكومية, taqeeb = خدمات وزارة التجارة, fawateer = سداد فواتير, ijar = عقود الإيجار والعقود العامة, tashirat = التأشيرات ووزارة الخارجية, tameen = التأمين الطبي والسيارات, mutalabat = المطالبات وناجز والتأمينات والحوادث, taqib = التعقيب, amal = الدعم الحكومي, tamweel = التمويل والبنوك, khassa = المعاملات الخاصة, zakat = الزكاة والضريبة والتأمينات والقوائم المالية, mawarid = الموارد البشرية والشكاوي, mawaeed = المواعيد والتقارير, manasat = المنصات الحكومية, tadhakir = تذاكر الطيران والبحر والنقل.';
