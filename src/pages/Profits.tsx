import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { count, errorMessage, money } from '../lib/format'
import { useCustomerOptions, useFilterValues } from '../lib/hooks'
import type { ProfitReport, TransactionDetail } from '../lib/types'
import TransactionsTable from '../components/TransactionsTable'
import SelectField from '../components/SelectField'

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

  const [profit, setProfit] = useState({ total: 0, today: 0, month: 0 })
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
    supabase
      .from('transactions')
      .select('profit, created_at')
      .eq('status', 'completed')
      .then(({ data, error: queryError }) => {
        if (queryError) {
          setError(errorMessage(queryError))
          return
        }
        const today = todayISO()
        const monthStart = new Date(`${monthStartISO()}T00:00:00+03:00`).getTime()
        const [year, month] = today.split('-').map(Number)
        const nextMonth = month === 12 ? 1 : month + 1
        const nextYear = month === 12 ? year + 1 : year
        const monthEnd = new Date(
          `${nextYear}-${String(nextMonth).padStart(2, '0')}-01T00:00:00+03:00`,
        ).getTime()
        let total = 0
        let todayProfit = 0
        let monthProfit = 0
        for (const row of data ?? []) {
          const amount = Number(row.profit)
          if (!Number.isFinite(amount)) continue
          total += amount
          const created = new Date(row.created_at)
          const day = new Intl.DateTimeFormat('en-CA', {
            timeZone: RIYADH_TZ,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
          }).format(created)
          if (day === today) todayProfit += amount
          const time = created.getTime()
          if (time >= monthStart && time < monthEnd) monthProfit += amount
        }
        setProfit({ total, today: todayProfit, month: monthProfit })
      })
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setError('')

    let query = supabase
      .from('transaction_details')
      .select('*')
      .eq('status', 'completed')
      .order('created_at', { ascending: false })
      .limit(500)

    if (from) query = query.gte('created_at', `${from}T00:00:00+03:00`)
    if (to) query = query.lte('created_at', `${to}T23:59:59.999+03:00`)
    if (customerId) query = query.eq('customer_id', customerId)
    if (nationality) query = query.eq('nationality', nationality)
    if (city) query = query.eq('city', city)

    const { data, error: queryError } = await query
    if (queryError) setError(errorMessage(queryError))
    else {
      const list = (data ?? []) as TransactionDetail[]
      const total = list.reduce((sum, row) => sum + Number(row.original_profit), 0)
      const summary: ProfitReport = {
        customers_count: new Set(list.map((row) => row.customer_id)).size,
        transactions_count: list.length,
        total_profit: total.toFixed(2),
      }
      setReport(summary)
      setRows(list)
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
          <div className="stat-value num">{money(profit.today)}</div>
        </div>
        <div className="stat accent">
          <div className="stat-label">أرباح هذا الشهر</div>
          <div className="stat-value num">{money(profit.month)}</div>
        </div>
        <div className="stat accent">
          <div className="stat-label">إجمالي الأرباح</div>
          <div className="stat-value num">{money(profit.total)}</div>
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
            <SelectField
              id="p-customer"
              value={customerId}
              onChange={setCustomerId}
              options={[
                { value: '', label: 'كل العملاء' },
                ...customers.map((item) => ({ value: item.id, label: item.full_name })),
              ]}
            />
          </div>

          <div className="field">
            <label htmlFor="p-nationality">الجنسية</label>
            <SelectField
              id="p-nationality"
              value={nationality}
              onChange={setNationality}
              options={[
                { value: '', label: 'كل الجنسيات' },
                ...nationalities.map((item) => ({ value: item, label: item })),
              ]}
            />
          </div>

          <div className="field">
            <label htmlFor="p-city">المدينة</label>
            <SelectField
              id="p-city"
              value={city}
              onChange={setCity}
              options={[
                { value: '', label: 'كل المدن' },
                ...cities.map((item) => ({ value: item, label: item })),
              ]}
            />
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
