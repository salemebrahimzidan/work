-- سداد فواتير services belong to one biller category.
-- The eight categories are the only allowed values. There is no "الكل" value.
-- Existing rows are not updated. A فواتير service with no category stays unset
-- until it is saved again with one of these eight categories.
-- Does not grant access to services.commission or transactions.profit.

alter table public.services
  add column if not exists biller_category text;

alter table public.services
  drop constraint if exists services_biller_category_check;

alter table public.services
  add constraint services_biller_category_check
  check (
    biller_category is null
    or (
      category = 'fawateer'
      and biller_category in (
        'communications',
        'government',
        'financial',
        'internet',
        'travel',
        'municipalities',
        'media_education',
        'redbull_mobile'
      )
    )
  );

comment on column public.services.biller_category is
  'فئة المفوتر لسداد فواتير فقط: communications = الخدمات والاتصالات, government = جهات حكومية, financial = قطاعات مالية, internet = حاسب/إنترنت, travel = سياحة وسفر/ترفيه, municipalities = الأمانات والبلديات, media_education = إعلام/تعليم, redbull_mobile = ريد بُل موبايل. لا توجد قيمة للكل.';

grant select (biller_category) on table public.services to authenticated;
