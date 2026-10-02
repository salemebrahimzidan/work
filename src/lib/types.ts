export type Role = 'pending' | 'user' | 'admin'

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

/** صف قائمة العملاء — لا يحتوي رقم الهوية */
export interface CustomerSummary {
  id: string
  full_name: string
  mobile: string
  nationality: string | null
  city: string | null
  district: string | null
  created_at: string
  transactions_count: number
  total_profit: string
}

export interface ServicePrice {
  id: string
  name: string
  transaction_value: string | null
  commission: string | null
  manual: boolean
  sort_order: number
}

export interface TransactionDetail {
  id: string
  customer_id: string
  customer_name: string
  customer_mobile: string
  nationality: string | null
  city: string | null
  service_name: string
  original_profit: string
  transaction_value: string | null
  note: string | null
  created_at: string
}

export interface DashboardStats {
  total_customers: number
  customers_today: number
  total_transactions: number
  transactions_today: number
  transactions_month: number
  total_profit: string
  profit_today: string
  profit_month: string
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
