import { supabase } from './supabase'

export const TRANSACTION_DETAIL_COLUMNS =
  'id, customer_id, customer_name, customer_mobile, nationality, city, service_name, note, created_at, transaction_value, status, cancel_reason'

export const CUSTOMER_SUMMARY_COLUMNS =
  'id, full_name, mobile, profession, nationality, national_id, city, district, created_at, transactions_count, total_transaction_value'

export interface OfficeProfitTotals {
  total_profit: string | number
  profit_today: string | number
  profit_month: string | number
}

export async function loadOfficeProfitTotals(): Promise<OfficeProfitTotals> {
  const { data, error } = await supabase.rpc('office_profit_totals')
  if (error) throw error
  return data as OfficeProfitTotals
}

export async function loadOfficeProfitMap(): Promise<Record<string, string>> {
  const { data, error } = await supabase.rpc('transaction_office_profits')
  if (error) throw error
  const map: Record<string, string> = {}
  for (const row of (data ?? []) as { id: string; profit: string | number }[]) {
    map[String(row.id)] = String(row.profit)
  }
  return map
}

export async function loadServiceCommissionMap(): Promise<Record<string, string | null>> {
  const { data, error } = await supabase.rpc('service_commissions')
  if (error) throw error
  return commissionMap(data)
}

/** Catalog commission for quoting. Does not include transaction profit. */
export async function loadServiceQuoteCommissionMap(): Promise<Record<string, string | null>> {
  const { data, error } = await supabase.rpc('service_quote_commissions')
  if (error) throw error
  return commissionMap(data)
}

function commissionMap(data: unknown): Record<string, string | null> {
  const map: Record<string, string | null> = {}
  for (const row of (data ?? []) as { id: string; commission: string | number | null }[]) {
    map[String(row.id)] = row.commission == null ? null : String(row.commission)
  }
  return map
}
