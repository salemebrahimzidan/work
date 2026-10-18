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

function fawateerShare(value: string | number | null | undefined): number | null {
  const amount = Number(value)
  if (!Number.isFinite(amount) || amount < 0 || amount > 4000) return null
  if (amount <= 300) return 5
  if (amount <= 1000) return 10
  if (amount <= 1500) return 15
  if (amount <= 2000) return 20
  if (amount <= 2500) return 25
  if (amount <= 3000) return 30
  if (amount <= 3500) return 35
  return 40
}

/** Office share for members who cannot read the stored transaction profit. */
export async function attachQuotedOfficeShare<T extends { service_name: string; transaction_value?: string | number | null }>(
  rows: T[],
): Promise<Array<T & { original_profit?: string }>> {
  const [fees, servicesRes] = await Promise.all([
    loadServiceQuoteCommissionMap(),
    supabase.from('services').select('id, name, manual, category'),
  ])
  if (servicesRes.error) throw servicesRes.error
  const byName = new Map<string, { manual: boolean; fawateer: boolean; fee: string | null }>()
  for (const service of servicesRes.data ?? []) {
    const fee = fees[String(service.id)]
    byName.set(String(service.name), {
      manual: Boolean(service.manual),
      fawateer: service.category === 'fawateer',
      fee: fee == null || fee === '' ? null : fee,
    })
  }
  return rows.map((row) => {
    const service = byName.get(row.service_name)
    if (!service || service.manual) return row
    if (service.fawateer) {
      const share = fawateerShare(row.transaction_value)
      return share == null ? row : { ...row, original_profit: String(share) }
    }
    if (service.fee == null) return row
    return { ...row, original_profit: service.fee }
  })
}

function commissionMap(data: unknown): Record<string, string | null> {
  const map: Record<string, string | null> = {}
  for (const row of (data ?? []) as { id: string; commission: string | number | null }[]) {
    map[String(row.id)] = row.commission == null ? null : String(row.commission)
  }
  return map
}
