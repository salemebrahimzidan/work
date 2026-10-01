import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { count, errorMessage, money } from '../lib/format'
import { useCustomerOptions, useFilterValues } from '../lib/hooks'
import type { DashboardStats, ProfitReport, TransactionDetail } from '../lib/types'
import TransactionsTable from '../components/TransactionsTable'

const RIYADH_TZ = 'Asia/Riyadh'

/** تاريخ اليوم بتوقيت الرياض بصيغة YYYY-MM-DD */
function todayISO(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: RIYADH_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
  return parts
}

function monthStartISO(): string {
  return `${todayISO().slice(0, 7)}-01`
}

export default function Profits() {
  const customers = useCustomerOptions()
  const { nationalities, cities } = useFilterValues()

  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [report, setReport] = useState<ProfitReport | null>(null)
  const [rows, setRows] = useState<TransactionDetail[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [customerId, setCustomerId] = useState('')
  const [nationality, setNationality] = useState('')
  const [city, setCity] = useState('')

  useEffect(() => {
    supabase.rpc('dashboard_stats').then(({ data, error: rpcError }) => {
      if (rpcError) setError(errorMessage(rpcError))
      else setStats(data as DashboardStats)
    })
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setError('')

    const params = {
      p_from: from || null,
      p_to: to || null,
      p_customer_id: customerId || null,
      p_nationality: nationality || null,
      p_city: city || null,
    }

    let query = supabase
      .from('transaction_details')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(500)

    if (from) query = query.gte('created_at', `${from}T00:00:00+03:00`)
    if (to) query = query.lte('created_at', `${to}T23:59:59.999+03:00`)
    if (customerId) query = query.eq('customer_id', customerId)
    if (nationality) query = query.eq('nationality', nationality)
    if (city) query = query.eq('city', city)

    const [reportRes, listRes] = await Promise.all([supabase.rpc('profit_report', params), query])

    const failure = reportRes.error || listRes.error
    if (failure) setError(errorMessage(failure))
    else {
      setReport(reportRes.data as ProfitReport)
      setRows((listRes.data ?? []) as TransactionDetail[])
    }
    setLoading(false)
  }, [from, to, customerId, nationality, city])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <>
      <div className="page-head">
        <div>
          <h1>الأرباح</h1>
          <p className="page-sub">تقارير الأرباح مع إمكانية التصفية</p>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="stat-grid">
        <div className="stat accent">
          <div className="stat-label">أرباح اليوم</div>
          <div className="stat-value num">{money(stats?.profit_today)}</div>
        </div>
        <div className="stat accent">
          <div className="stat-label">أرباح هذا الشهر</div>
          <div className="stat-value num">{money(stats?.profit_month)}</div>
        </div>
        <div className="stat accent">
          <div className="stat-label">إجمالي الأرباح</div>
          <div className="stat-value num">{money(stats?.total_profit)}</div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h2 className="card-title">تصفية</h2>
        <div className="filters">
          <div className="field">
            <label htmlFor="from">من تاريخ</label>
            <input id="from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>

          <div className="field">
            <label htmlFor="to">إلى تاريخ</label>
            <input id="to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>

          <div className="field">
            <label htmlFor="p-customer">العميل</label>
            <select
              id="p-customer"
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
            >
              <option value="">كل العملاء</option>
              {customers.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.full_name}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="p-nationality">الجنسية</label>
            <select
              id="p-nationality"
              value={nationality}
              onChange={(e) => setNationality(e.target.value)}
            >
              <option value="">كل الجنسيات</option>
              {nationalities.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="p-city">المدينة</label>
            <select id="p-city" value={city} onChange={(e) => setCity(e.target.value)}>
              <option value="">كل المدن</option>
              {cities.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="form-actions">
          <button
            type="button"
            className="btn"
            onClick={() => {
              setFrom(monthStartISO())
              setTo(todayISO())
            }}
          >
            هذا الشهر
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => {
              setFrom(todayISO())
              setTo(todayISO())
            }}
          >
            اليوم
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              setFrom('')
              setTo('')
              setCustomerId('')
              setNationality('')
              setCity('')
            }}
          >
            مسح التصفية
          </button>
        </div>
      </div>

      <div className="stat-grid" style={{ marginTop: 16 }}>
        <div className="stat">
          <div className="stat-label">العملاء في النتيجة</div>
          <div className="stat-value num">{count(report?.customers_count)}</div>
        </div>
        <div className="stat">
          <div className="stat-label">المعاملات في النتيجة</div>
          <div className="stat-value num">{count(report?.transactions_count)}</div>
        </div>
        <div className="stat accent">
          <div className="stat-label">إجمالي الربح في النتيجة</div>
          <div className="stat-value num">{money(report?.total_profit)}</div>
        </div>
      </div>

      <h2 className="card-title" style={{ marginTop: 24 }}>
        تفاصيل المعاملات
      </h2>
      <TransactionsTable rows={rows} loading={loading} onChanged={() => void load()} />
    </>
  )
}
