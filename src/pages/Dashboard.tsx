import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Modal from '../components/Modal'
import { useCompany } from '../auth/CompanyProvider'
import { loadOfficeProfitTotals } from '../lib/finance'
import { supabase } from '../lib/supabase'
import { count, errorMessage, money } from '../lib/format'
import { normalizeMobile } from '../lib/mobile'
import type { DashboardStats } from '../lib/types'

const STATUSES = [
  { status: 'pending', label: 'قيد الانتظار', tone: 'pending', color: '#e8a317' },
  { status: 'in_progress', label: 'قيد التنفيذ', tone: 'progress', color: '#3b82c4' },
  { status: 'cancelled', label: 'ملغاة', tone: 'cancelled', color: '#d64545' },
  { status: 'completed', label: 'مكتملة', tone: 'completed', color: '#1f9d55' },
] as const

type StatusKey = (typeof STATUSES)[number]['status']

function monthLabel() {
  const monthName = new Intl.DateTimeFormat('ar-SA', {
    month: 'long',
    calendar: 'gregory',
    timeZone: 'Asia/Riyadh',
    numberingSystem: 'latn',
  }).format(new Date())
  return `من 1 ${monthName}`
}

interface StatusClient {
  id: string
  name: string
  mobile: string
  services: string[]
}

export default function Dashboard() {
  const { canViewFinance, loading: companyLoading } = useCompany()
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [statusCounts, setStatusCounts] = useState<Record<StatusKey, number>>({
    pending: 0,
    in_progress: 0,
    cancelled: 0,
    completed: 0,
  })
  const [profit, setProfit] = useState({ total: 0, today: 0, month: 0 })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [openStatus, setOpenStatus] = useState<StatusKey | null>(null)
  const [clients, setClients] = useState<StatusClient[] | null>(null)
  const [clientsError, setClientsError] = useState('')
  const [clientsLoading, setClientsLoading] = useState(false)
  const [clientQuery, setClientQuery] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    const [statsRes, ...statusRes] = await Promise.all([
      supabase.rpc('dashboard_stats'),
      ...STATUSES.map((item) =>
        supabase.from('transactions').select('id', { count: 'exact', head: true }).eq('status', item.status),
      ),
    ])

    const failure = statsRes.error || statusRes.find((result) => result.error)?.error
    if (statsRes.error) setError(errorMessage(statsRes.error))
    else setStats(statsRes.data as DashboardStats)

    if (failure && !statsRes.error) setError(errorMessage(failure))

    const next = { pending: 0, in_progress: 0, cancelled: 0, completed: 0 }
    STATUSES.forEach((item, index) => {
      next[item.status] = statusRes[index].count ?? 0
    })
    setStatusCounts(next)

    if (canViewFinance) {
      try {
        const totals = await loadOfficeProfitTotals()
        setProfit({
          total: Number(totals.total_profit) || 0,
          today: Number(totals.profit_today) || 0,
          month: Number(totals.profit_month) || 0,
        })
      } catch (profitError) {
        setProfit({ total: 0, today: 0, month: 0 })
        if (!statsRes.error) setError(errorMessage(profitError))
      }
    } else {
      setProfit({ total: 0, today: 0, month: 0 })
    }
    setLoading(false)
  }, [canViewFinance])

  useEffect(() => {
    if (companyLoading) return
    void load()
  }, [companyLoading, load])

  const totalStatuses = STATUSES.reduce((sum, item) => sum + statusCounts[item.status], 0)
  const openItem = STATUSES.find((item) => item.status === openStatus)
  const query = clientQuery.trim()
  const queryDigits = normalizeMobile(query)
  const queryText = query.toLocaleLowerCase('ar')
  const visibleClients = (clients ?? []).filter((client) => {
    if (!query) return true
    if (client.name.toLocaleLowerCase('ar').includes(queryText)) return true
    if (client.services.some((service) => service.toLocaleLowerCase('ar').includes(queryText))) return true
    return queryDigits.length > 0 && normalizeMobile(client.mobile).includes(queryDigits)
  })

  function closeClients() {
    setOpenStatus(null)
    setClientQuery('')
  }

  async function showClients(status: StatusKey) {
    setOpenStatus(status)
    setClientQuery('')
    setClients(null)
    setClientsError('')
    setClientsLoading(true)
    const { data, error: queryError } = await supabase
      .from('transaction_details')
      .select('customer_id, customer_name, customer_mobile, service_name')
      .eq('status', status)
      .order('customer_name')

    setClientsLoading(false)
    if (queryError) {
      setClientsError(errorMessage(queryError))
      return
    }

    const grouped = new Map<string, StatusClient>()
    for (const row of data ?? []) {
      const current: StatusClient = grouped.get(row.customer_id) ?? {
        id: row.customer_id,
        name: row.customer_name,
        mobile: row.customer_mobile,
        services: [],
      }
      if (row.service_name && !current.services.includes(row.service_name)) {
        current.services.push(row.service_name)
      }
      grouped.set(row.customer_id, current)
    }
    setClients([...grouped.values()])
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>لوحة التحكم</h1>
          <p className="page-sub">ملخص العملاء والمعاملات والأرباح</p>
        </div>
        <button
          type="button"
          className="btn"
          onClick={() => void load()}
          disabled={loading}
        >
          تحديث
        </button>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="kpi-board">
        <SummaryCard
          tone="customers"
          title="العملاء"
          caption="إجمالي العملاء"
          value={count(stats?.total_customers)}
          items={[{ label: 'اليوم', value: count(stats?.customers_today) }]}
        />
        <SummaryCard
          tone="transactions"
          title="المعاملات"
          caption="عدد المعاملات"
          value={count(stats?.total_transactions)}
          items={[{ label: 'اليوم', value: count(stats?.transactions_today) }]}
        />
        {canViewFinance && (
          <SummaryCard
            tone="profit"
            title="الأرباح"
            caption="إجمالي الأرباح"
            value={money(profit.total)}
            items={[
              { label: 'اليوم', value: money(profit.today) },
              { label: monthLabel(), value: money(profit.month) },
            ]}
          />
        )}
      </div>

      <section className="status-board" aria-label="حالات المعاملات">
        {STATUSES.map((item) => {
          const value = statusCounts[item.status]
          const share = totalStatuses === 0 ? 0 : (value / totalStatuses) * 100
          return (
            <button
              key={item.status}
              type="button"
              className={`status-ring ${item.tone}`}
              onClick={() => void showClients(item.status)}
            >
              <span
                className="status-circle"
                style={{
                  background: `conic-gradient(${item.color} 0% ${share}%, #e7eeec ${share}% 100%)`,
                }}
              >
                <span className="status-circle-hole">
                  <span className="status-circle-value num" dir="ltr">
                    {count(value)}
                  </span>
                  <span className="status-circle-caption">معاملة</span>
                </span>
              </span>
              <span className="status-ring-label">{item.label}</span>
            </button>
          )
        })}
      </section>

      <Modal
        title={openItem?.label ?? 'الحالة'}
        subtitle={
          openItem ? (
            <span className="num">
              {count(query ? visibleClients.length : (clients?.length ?? 0))} عميل
            </span>
          ) : undefined
        }
        open={openStatus !== null}
        center
        onClose={closeClients}
      >
        {clientsLoading && <p className="muted">جارٍ التحميل…</p>}
        {clientsError && <div className="alert alert-error">{clientsError}</div>}
        {clients && clients.length === 0 && <p className="muted">لا يوجد عملاء في هذه الحالة</p>}
        {clients && clients.length > 0 && (
          <label className="status-search">
            <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
              <circle cx="7" cy="7" r="4.2" fill="none" stroke="currentColor" strokeWidth="1.6" />
              <path d="M10.2 10.2 13.2 13.2" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
            <input
              value={clientQuery}
              onChange={(event) => setClientQuery(event.target.value)}
              placeholder="بحث بالاسم أو الجوال أو المعاملة"
              aria-label="بحث بالاسم أو الجوال أو المعاملة"
            />
          </label>
        )}
        {clients && clients.length > 0 && visibleClients.length === 0 && (
          <p className="status-empty">لا توجد نتائج</p>
        )}
        {visibleClients.length > 0 && (
          <ul className="status-client-list">
            {visibleClients.map((client) => (
              <li key={client.id}>
                <Link className="status-client" to={`/customers/${client.id}`}>
                  <span className="status-client-avatar" aria-hidden="true">
                    {client.name.trim().charAt(0)}
                  </span>
                  <span className="status-client-copy">
                    <span className="status-client-name">{client.name}</span>
                    <span className="status-client-phone num" dir="ltr">
                      {client.mobile}
                    </span>
                    <span className="status-client-tags">
                      {client.services.length > 0
                        ? client.services.map((service) => (
                            <span className="status-client-tag" key={service}>
                              {service}
                            </span>
                          ))
                        : <span className="status-client-tag">—</span>}
                    </span>
                  </span>
                  <svg className="status-client-chevron" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
                    <path d="M10 3.5 5.5 8 10 12.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Modal>
    </>
  )
}

function SummaryCard({
  tone,
  title,
  caption,
  value,
  items,
}: {
  tone: 'customers' | 'transactions' | 'profit'
  title: string
  caption: string
  value: string
  items: { label: string; value: string }[]
}) {
  return (
    <section className={`summary-card ${tone}`}>
      <div className="summary-top">
        <div>
          <h2 className="summary-kicker">{title}</h2>
          <div className="summary-value num" dir="ltr">
            {value}
          </div>
          <p className="summary-caption">{caption}</p>
        </div>
        <span className="summary-mark" aria-hidden="true">
          {tone === 'customers' && (
            <svg viewBox="0 0 24 24" width="20" height="20">
              <circle cx="9" cy="8" r="3" fill="none" stroke="currentColor" strokeWidth="1.8" />
              <path d="M3.8 18.5c.7-2.6 2.7-4 5.2-4s4.5 1.4 5.2 4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              <circle cx="16.5" cy="9" r="2.2" fill="none" stroke="currentColor" strokeWidth="1.8" />
              <path d="M16 14.6c1.8.2 3.2 1.3 3.8 3.2" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          )}
          {tone === 'transactions' && (
            <svg viewBox="0 0 24 24" width="20" height="20">
              <rect x="5" y="3.5" width="14" height="17" rx="2" fill="none" stroke="currentColor" strokeWidth="1.8" />
              <path d="M8.5 8.5h7M8.5 12h7M8.5 15.5h4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          )}
          {tone === 'profit' && (
            <svg viewBox="0 0 24 24" width="20" height="20">
              <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="1.8" />
              <path d="M12 7.5v9M9.2 9.4c.5-1 1.5-1.5 2.8-1.5 1.7 0 2.8.8 2.8 2.1S13.7 12 12 12s-2.8.8-2.8 2.1 1.1 2.1 2.8 2.1c1.3 0 2.3-.5 2.8-1.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          )}
        </span>
      </div>
      <dl className="summary-foot">
        {items.map((item) => (
          <div className="summary-mini" key={item.label}>
            <dt className="summary-mini-label">{item.label}</dt>
            <dd className="summary-mini-value num" dir="ltr">
              {item.value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
