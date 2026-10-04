import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import CustomerForm from '../components/CustomerForm'
import { SkeletonRows } from '../components/LoadingSkeleton'
import Modal from '../components/Modal'
import TransactionForm from '../components/TransactionForm'
import { useCompany } from '../auth/CompanyProvider'
import { loadOfficeProfitMap, loadOfficeProfitTotals } from '../lib/finance'
import { supabase } from '../lib/supabase'
import { count, errorMessage, formatDate, money, transactionStatus } from '../lib/format'
import type { DashboardStats } from '../lib/types'

const RECENT_LIMIT = 5
const RECENT_COLUMNS = 'id, customer_name, service_name, transaction_value, status, created_at'

const STATUSES = [
  { status: 'pending', label: 'قيد الانتظار', tone: 'pending', color: '#e8a317' },
  { status: 'in_progress', label: 'قيد التنفيذ', tone: 'progress', color: '#3b82c4' },
  { status: 'cancelled', label: 'ملغاة', tone: 'cancelled', color: '#d64545' },
  { status: 'completed', label: 'مكتملة', tone: 'completed', color: '#1f9d55' },
] as const

type StatusKey = (typeof STATUSES)[number]['status']

interface RecentTransaction {
  id: string
  customer_name: string
  service_name: string
  transaction_value: string | null
  status: string
  created_at: string
  original_profit?: string
}

function monthLabel() {
  const monthName = new Intl.DateTimeFormat('ar-SA', {
    month: 'long',
    calendar: 'gregory',
    timeZone: 'Asia/Riyadh',
    numberingSystem: 'latn',
  }).format(new Date())
  return `من 1 ${monthName}`
}

export default function Dashboard() {
  const navigate = useNavigate()
  const { canViewFinance, loading: companyLoading } = useCompany()
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [statusCounts, setStatusCounts] = useState<Record<StatusKey, number>>({
    pending: 0,
    in_progress: 0,
    cancelled: 0,
    completed: 0,
  })
  const [recent, setRecent] = useState<RecentTransaction[]>([])
  const [profit, setProfit] = useState({ total: 0, today: 0, month: 0 })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [customerOpen, setCustomerOpen] = useState(false)
  const [transactionOpen, setTransactionOpen] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    const [statsRes, recentRes, ...statusRes] = await Promise.all([
      supabase.rpc('dashboard_stats'),
      supabase
        .from('transaction_details')
        .select(RECENT_COLUMNS)
        .order('created_at', { ascending: false })
        .limit(RECENT_LIMIT),
      ...STATUSES.map((item) =>
        supabase.from('transactions').select('id', { count: 'exact', head: true }).eq('status', item.status),
      ),
    ])

    const failure = statsRes.error || recentRes.error || statusRes.find((result) => result.error)?.error
    if (statsRes.error) setError(errorMessage(statsRes.error))
    else setStats(statsRes.data as DashboardStats)

    if (failure && !statsRes.error) setError(errorMessage(failure))

    const next = { pending: 0, in_progress: 0, cancelled: 0, completed: 0 }
    STATUSES.forEach((item, index) => {
      next[item.status] = statusRes[index].count ?? 0
    })
    setStatusCounts(next)

    const latest = (recentRes.data ?? []) as RecentTransaction[]
    if (canViewFinance) {
      try {
        const [totals, profits] = await Promise.all([loadOfficeProfitTotals(), loadOfficeProfitMap()])
        setProfit({
          total: Number(totals.total_profit) || 0,
          today: Number(totals.profit_today) || 0,
          month: Number(totals.profit_month) || 0,
        })
        setRecent(latest.map((row) => ({ ...row, original_profit: profits[row.id] })))
      } catch (profitError) {
        setProfit({ total: 0, today: 0, month: 0 })
        setRecent(latest)
        if (!statsRes.error) setError(errorMessage(profitError))
      }
    } else {
      setProfit({ total: 0, today: 0, month: 0 })
      setRecent(latest)
    }
    setLoading(false)
  }, [canViewFinance])

  useEffect(() => {
    if (companyLoading) return
    void load()
  }, [companyLoading, load])

  const totalStatuses = STATUSES.reduce((sum, item) => sum + statusCounts[item.status], 0)

  function openRecent(id: string) {
    navigate(`/transactions/${id}`)
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>لوحة التحكم</h1>
          <p className="page-sub">
            {canViewFinance ? 'ملخص العملاء والمعاملات والأرباح' : 'ملخص العملاء والمعاملات'}
          </p>
        </div>
        <div className="dashboard-actions">
          <button type="button" className="btn btn-primary" onClick={() => setCustomerOpen(true)}>
            + إضافة عميل
          </button>
          <button type="button" className="btn btn-primary" onClick={() => setTransactionOpen(true)}>
            + إضافة معاملة
          </button>
          <button type="button" className="btn" onClick={() => void load()} disabled={loading}>
            تحديث
          </button>
        </div>
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
          items={[
            { label: 'اليوم', value: count(stats?.transactions_today) },
            { label: 'هذا الشهر', value: count(stats?.transactions_month) },
          ]}
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
            <Link
              key={item.status}
              to={`/transactions?status=${item.status}`}
              className={`status-ring ${item.tone}`}
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
            </Link>
          )
        })}
      </section>

      <section className="dashboard-recent" aria-label="أحدث المعاملات">
        <h2 className="card-title">أحدث المعاملات</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>العميل</th>
                <th>المعاملة</th>
                <th>قيمة المعاملة</th>
                {canViewFinance && <th>عمولة المكتب</th>}
                <th>الحالة</th>
                <th>التاريخ</th>
              </tr>
            </thead>
            <tbody>
              {loading && recent.length === 0 ? (
                <SkeletonRows columns={canViewFinance ? 6 : 5} />
              ) : recent.map((row) => {
                const status = transactionStatus(row.status)
                return (
                  <tr
                    key={row.id}
                    className="dashboard-recent-row"
                    tabIndex={0}
                    role="link"
                    aria-label={`${row.customer_name} — ${row.service_name}`}
                    onClick={() => openRecent(row.id)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        openRecent(row.id)
                      }
                    }}
                  >
                    <td>{row.customer_name}</td>
                    <td>{row.service_name}</td>
                    <td className="num">{row.transaction_value == null ? '—' : money(row.transaction_value)}</td>
                    {canViewFinance && (
                      <td className="num strong">
                        {row.original_profit == null ? '—' : money(row.original_profit)}
                      </td>
                    )}
                    <td>
                      <span className={status.badge}>{status.label}</span>
                    </td>
                    <td className="num muted">{formatDate(row.created_at)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {!loading && recent.length === 0 && <div className="empty">لا توجد معاملات حديثة</div>}
        </div>
      </section>

      <Modal title="إضافة عميل" open={customerOpen} onClose={() => setCustomerOpen(false)}>
        <CustomerForm
          onCancel={() => setCustomerOpen(false)}
          onSaved={() => {
            setCustomerOpen(false)
            void load()
          }}
        />
      </Modal>

      <Modal title="إضافة معاملة" open={transactionOpen} onClose={() => setTransactionOpen(false)}>
        <TransactionForm
          onCancel={() => setTransactionOpen(false)}
          onSaved={() => {
            setTransactionOpen(false)
            void load()
          }}
        />
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
