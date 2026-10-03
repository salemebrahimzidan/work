export type Role = 'pending' | 'user' | 'admin'

export type CompanyRole = 'owner' | 'admin' | 'manager' | 'user'

export type CompanyStatus = 'active' | 'suspended'

export interface CompanyInfo {
  id: string
  name: string
  status: CompanyStatus
}

export interface Branch {
  id: string
  name: string
  code: string | null
  city: string | null
  phone: string | null
  is_active: boolean
}

export type EmploymentStatus = 'active' | 'inactive' | 'vacation' | 'terminated'

export interface Employee {
  id: string
  employee_number: string | null
  full_name: string
  nationality: string | null
  mobile: string | null
  email: string | null
  branch_id: string | null
  job_title: string | null
  employment_status: EmploymentStatus
  hire_date: string | null
  iqama_number: string | null
  iqama_expiry_date: string | null
  passport_number: string | null
  passport_expiry_date: string | null
  notes: string | null
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

export type ServiceCategory = 'sdad' | 'taqeeb' | 'fawateer'

export function asServiceCategory(value: string | null | undefined): ServiceCategory {
  if (value === 'taqeeb' || value === 'fawateer') return value
  return 'sdad'
}

export const serviceCategoryLabel: Record<ServiceCategory, string> = {
  sdad: 'سداد مدفوعات حكومية',
  taqeeb: 'خدمات وزاره التجاره',
  fawateer: 'سداد فواتير',
}

export interface ServicePrice {
  id: string
  name: string
  transaction_value: string | null
  commission: string | null
  manual: boolean
  sort_order: number
  category: ServiceCategory
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
