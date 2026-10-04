export type Role = 'pending' | 'user' | 'admin'

export type CompanyRole = 'owner' | 'admin' | 'manager' | 'user'

export type CompanyStatus = 'active' | 'suspended'

export interface CompanyInfo {
  id: string
  name: string
  status: CompanyStatus
}

export interface Profile {
  id: string
  full_name: string | null
  role: Role
  created_at: string
}

export interface Customer {
  id: string
  full_name: string
  mobile: string
  national_id: string | null
  nationality: string | null
  city: string | null
  district: string | null
  notes: string | null
  created_at: string
}

export interface CustomerSummary {
  id: string
  full_name: string
  mobile: string
  nationality: string | null
  national_id: string | null
  city: string | null
  district: string | null
  created_at: string
  transactions_count: number
  total_transaction_value: string
}

export const serviceCategories = [
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
] as const

export type ServiceCategory = (typeof serviceCategories)[number]

export function isServiceCategory(value: string | null | undefined): value is ServiceCategory {
  return !!value && (serviceCategories as readonly string[]).includes(value)
}

export function asServiceCategory(value: string | null | undefined): ServiceCategory {
  return isServiceCategory(value) ? value : 'sdad'
}

export const serviceCategoryLabel: Record<ServiceCategory, string> = {
  sdad: 'سداد مدفوعات حكومية',
  taqeeb: 'خدمات وزاره التجاره',
  fawateer: 'سداد فواتير',
  ijar: 'خدمات عقود الإيجار والعقود العامة',
  tashirat: 'خدمات التأشيرات ووزارة الخارجية',
  tameen: 'خدمات التأمين الطبي والسيارات',
  mutalabat: 'خدمات المطالبات ناجز التأمينات الحوادث',
  taqib: 'خدمات التعقيب',
  amal: 'خدمات الدعم الحكومي',
  tamweel: 'خدمات التمويل والبنوك',
  khassa: 'خدمات المعاملات الخاصة',
  zakat: 'خدمات الزكاة والضريبة والتأمينات والقوائم المالية',
}

export const billerCategories = [
  'communications',
  'government',
  'financial',
  'internet',
  'travel',
  'municipalities',
  'media_education',
  'redbull_mobile',
] as const

export type BillerCategory = (typeof billerCategories)[number]

export function isBillerCategory(value: string | null | undefined): value is BillerCategory {
  return !!value && (billerCategories as readonly string[]).includes(value)
}

export const billerCategoryLabel: Record<BillerCategory, string> = {
  communications: 'الخدمات والاتصالات',
  government: 'جهات حكومية',
  financial: 'قطاعات مالية',
  internet: 'حاسب/إنترنت',
  travel: 'سياحة وسفر/ترفيه',
  municipalities: 'الأمانات والبلديات',
  media_education: 'إعلام/تعليم',
  redbull_mobile: 'ريد بُل موبايل',
}

export const serviceCategoryPath: Record<ServiceCategory, string> = {
  sdad: '/services',
  taqeeb: '/taqeeb',
  fawateer: '/fawateer',
  ijar: '/ijar',
  tashirat: '/tashirat',
  tameen: '/tameen',
  mutalabat: '/mutalabat',
  taqib: '/taqib',
  amal: '/amal',
  tamweel: '/tamweel',
  khassa: '/khassa',
  zakat: '/zakat',
}

export interface ServicePrice {
  id: string
  name: string
  transaction_value: string | null
  commission: string | null
  manual: boolean
  sort_order: number
  category: ServiceCategory
  biller_category: BillerCategory | null
  steps: string | null
}

export interface TransactionDetail {
  id: string
  customer_id: string
  customer_name: string
  customer_mobile: string
  nationality: string | null
  city: string | null
  service_name: string
  original_profit?: string
  transaction_value: string | null
  note: string | null
  created_at: string
  status?: 'pending' | 'in_progress' | 'completed' | 'cancelled'
  cancel_reason?: string | null
}

export interface DashboardStats {
  total_customers: number
  customers_today: number
  total_transactions: number
  transactions_today: number
  transactions_month: number
}

export interface ProfitReport {
  customers_count: number
  transactions_count: number
  total_profit: string
}

export interface GroupCount {
  label: string
  total: number
}
