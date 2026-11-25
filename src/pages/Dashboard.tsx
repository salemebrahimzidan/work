import { useCallback, useEffect, useState, type CSSProperties } from 'react'
import { ArrowLeft, FileText, Plus, TrendingUp, UserPlus, Users } from 'lucide-react'
import { Link } from 'react-router-dom'
import CustomerForm from '../components/CustomerForm'
import { SkeletonRows } from '../components/LoadingSkeleton'
import Modal from '../components/Modal'
import StatusDrawer, { type DrawerStatus } from '../components/StatusDrawer'
import TransactionForm from '../components/TransactionForm'
import { TransactionViewModal, amountLabel, officeTotalLabel } from '../components/TransactionsTable'
import { useCompany } from '../auth/CompanyProvider'
import { TRANSACTION_DETAIL_COLUMNS, attachQuotedOfficeShare, loadOfficeProfitMap, loadOfficeProfitTotals } from '../lib/finance'
import { supabase } from '../lib/supabase'
import { count, errorMessage, formatDate, transactionStatus } from '../lib/format'
import type { DashboardStats, TransactionDetail } from '../lib/types'

const RECENT_LIMIT = 5

const STATUSES = [
  { status: 'pending', label: 'قيد الانتظار', tone: 'pending', color: '#f59e0b' },
  { status: 'in_progress', label: 'قيد التنفيذ', tone: 'progress', color: '#0ea5e9' },
  { status: 'cancelled', label: 'ملغاة', tone: 'cancelled', color: '#ef4444' },
  { status: 'completed', label: 'مكتملة', tone: 'completed', color: '#22c55e' },
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

function todayLabel() {
  return new Intl.DateTimeFormat('ar-SA', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    calendar: 'gregory',
    timeZone: 'Asia/Riyadh',
    numberingSystem: 'latn',
  }).format(new Date())
}

function initial(name: string | null | undefined) {
  return (name ?? '').trim().charAt(0) || '؟'
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
  const [recent, setRecent] = useState<TransactionDetail[]>([])
  const [viewing, setViewing] = useState<TransactionDetail | null>(null)
  const [drawer, setDrawer] = useState<DrawerStatus | null>(null)
  const [drawerReload, setDrawerReload] = useState(0)
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
        .select(TRANSACTION_DETAIL_COLUMNS)
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

    const latest = (recentRes.data ?? []) as TransactionDetail[]
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
      try {
        setRecent(await attachQuotedOfficeShare(latest))
      } catch (profitError) {
        setRecent(latest)
        if (!statsRes.error) setError(errorMessage(profitError))
      }
    }
    setLoading(false)
  }, [canViewFinance])

  useEffect(() => {
    if (companyLoading) return
    void load()
  }, [companyLoading, load])

  // Same profit/share columns as the recent table, for rows opened from the status panel.
  const enrichRows = useCallback(
    async (rows: TransactionDetail[]) => {
      if (!canViewFinance) return attachQuotedOfficeShare(rows)
      const profits = await loadOfficeProfitMap()
      return rows.map((row) => ({ ...row, original_profit: profits[row.id] }))
    },
    [canViewFinance],
  )
  const closeDrawer = useCallback(() => setDrawer(null), [])

  const totalStatuses = STATUSES.reduce((sum, item) => sum + statusCounts[item.status], 0)
  const busy = loading && !stats

  return (
    <div className="dash">
      <div className="page-head dash-head">
        <div>
          <h1>لوحة التحكم</h1>
          <p className="page-sub">
            {canViewFinance ? 'ملخص العملاء والمعاملات والأرباح' : 'ملخص العملاء والمعاملات'}
            <span className="dash-date"> · {todayLabel()}</span>
          </p>
        </div>
        <div className="dashboard-actions">
          <button type="button" className="btn dash-btn-ghost" onClick={() => setCustomerOpen(true)}>
            <UserPlus size={16} aria-hidden="true" />
            إضافة عميل
          </button>
          <button type="button" className="btn btn-primary dash-btn" onClick={() => setTransactionOpen(true)}>
            <Plus size={16} aria-hidden="true" />
            إضافة معاملة
          </button>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className={`kpi-board${canViewFinance ? '' : ' two'}`}>
        <SummaryCard
          tone="customers"
          title="العملاء"
          caption="إجمالي العملاء"
          value={count(stats?.total_customers)}
          busy={busy}
          to="/customers"
          today={{ value: count(stats?.customers_today), active: Number(stats?.customers_today) > 0 }}
          items={[]}
        />
        <SummaryCard
          tone="transactions"
          title="المعاملات"
          caption="عدد المعاملات"
          value={count(stats?.total_transactions)}
          busy={busy}
          to="/transactions"
          today={{ value: count(stats?.transactions_today), active: Number(stats?.transactions_today) > 0 }}
          items={[{ label: 'هذا الشهر', value: count(stats?.transactions_month) }]}
        />
        {canViewFinance && (
          <SummaryCard
            tone="profit"
            title="الأرباح"
            caption="إجمالي الأرباح"
            value={amountLabel(profit.total)}
            busy={loading}
            to="/profits"
            today={{ value: amountLabel(profit.today), active: profit.today > 0 }}
            items={[{ label: monthLabel(), value: amountLabel(profit.month) }]}
          />
        )}
      </div>

      <section className="dash-panel dash-status" aria-label="حالات المعاملات">
        <header className="dash-chart-head">
          <h2 className="dash-chart-title">حالات المعاملات</h2>
          <p className="dash-chart-sub">التوزيع الحالي للمعاملات حسب الحالة</p>
        </header>
        <StatusDonut counts={statusCounts} total={totalStatuses} busy={busy} onSelect={setDrawer} />
      </section>

      <section className="dash-panel dashboard-recent" aria-label="أحدث المعاملات">
        <header className="dash-panel-head">
          <div>
            <h2 className="dash-panel-title">أحدث المعاملات</h2>
            <p className="dash-panel-sub">آخر المعاملات التي تمت إضافتها</p>
          </div>
          <Link to="/transactions" className="dash-link">
            عرض الكل
            <ArrowLeft size={15} aria-hidden="true" />
          </Link>
        </header>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>العميل</th>
                <th>المعاملة</th>
                <th className="num-left">قيمة المعاملة</th>
                <th className="num-left">نسبة المكتب</th>
                <th className="num-left">الإجمالي</th>
                <th>الحالة</th>
                <th>التاريخ</th>
              </tr>
            </thead>
            <tbody>
              {loading && recent.length === 0 ? (
                <SkeletonRows columns={7} rows={RECENT_LIMIT} />
              ) : (
                recent.map((row) => {
                  const status = transactionStatus(row.status)
                  const total = officeTotalLabel(row)
                  return (
                    <tr key={row.id} className="dashboard-recent-row">
                      <td>
                        <Link to={`/customers/${row.customer_id}`} className="dash-customer">
                          <span className="dash-avatar" aria-hidden="true">
                            {initial(row.customer_name)}
                          </span>
                          <span>{row.customer_name}</span>
                        </Link>
                      </td>
                      <td>
                        <button type="button" className="tx-name-link" onClick={() => setViewing(row)}>
                          {row.service_name}
                        </button>
                      </td>
                      <td className="num num-left">
                        {row.transaction_value == null ? '—' : amountLabel(row.transaction_value)}
                      </td>
                      <td className="num strong num-left">
                        {row.original_profit == null ? '—' : amountLabel(row.original_profit)}
                      </td>
                      <td className="num num-left">
                        {total === '—' ? total : <span className="tx-total">{total}</span>}
                      </td>
                      <td className="status-cell">
                        <span className={status.badge}>{status.label}</span>
                      </td>
                      <td className="num muted">{formatDate(row.created_at)}</td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
          {!loading && recent.length === 0 && (
            <div className="empty dash-empty">
              <FileText size={28} aria-hidden="true" />
              <span>لا توجد معاملات حديثة</span>
              <button type="button" className="btn btn-primary dash-btn" onClick={() => setTransactionOpen(true)}>
                <Plus size={16} aria-hidden="true" />
                إضافة أول معاملة
              </button>
            </div>
          )}
        </div>
      </section>

      <TransactionViewModal
        row={viewing}
        showProfit
        onClose={() => setViewing(null)}
        onChanged={() => {
          setDrawerReload((key) => key + 1)
          void load()
        }}
      />

      <StatusDrawer
        target={drawer}
        onClose={closeDrawer}
        onOpenRow={setViewing}
        enrich={enrichRows}
        reloadKey={drawerReload}
      />

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
    </div>
  )
}

const DONUT_RADIUS = 80
const DONUT_STROKE = 30
const DONUT_LENGTH = 2 * Math.PI * DONUT_RADIUS
const DONUT_GAP = 3

function StatusDonut({
  counts,
  total,
  busy,
  onSelect,
}: {
  counts: Record<StatusKey, number>
  total: number
  busy: boolean
  onSelect: (target: DrawerStatus) => void
}) {
  const [hovered, setHovered] = useState<StatusKey | null>(null)
  const visible = STATUSES.filter((item) => counts[item.status] > 0)
  const gap = visible.length > 1 ? DONUT_GAP : 0
  const focus = hovered ? STATUSES.find((item) => item.status === hovered) : undefined

  let offset = 0
  const segments = visible.map((item) => {
    const length = (counts[item.status] / total) * DONUT_LENGTH
    const segment = { item, length, offset }
    offset += length
    return segment
  })

  return (
    <div className="donut-layout">
      <div className="donut-chart" role="img" aria-label={`إجمالي ${total} معاملة`}>
        <svg viewBox="0 0 200 200" aria-hidden="true">
          <circle className="donut-track" cx="100" cy="100" r={DONUT_RADIUS} strokeWidth={DONUT_STROKE} />
          {!busy &&
            segments.map(({ item, length, offset: start }) => (
              <circle
                key={item.status}
                className={`donut-segment${hovered && hovered !== item.status ? ' is-dim' : ''}${hovered === item.status ? ' is-active' : ''}`}
                cx="100"
                cy="100"
                r={DONUT_RADIUS}
                stroke={item.color}
                strokeWidth={DONUT_STROKE}
                strokeDasharray={`${Math.max(length - gap, 0.5)} ${DONUT_LENGTH}`}
                strokeDashoffset={-start}
                transform="rotate(-90 100 100)"
                onMouseEnter={() => setHovered(item.status)}
                onMouseLeave={() => setHovered(null)}
                onClick={() => onSelect(item)}
              />
            ))}
        </svg>
        <div className="donut-center">
          <span className="donut-total num" dir="ltr">
            {busy ? '—' : count(focus ? counts[focus.status] : total)}
          </span>
          <span className="donut-caption">{focus ? focus.label : 'معاملة'}</span>
        </div>
      </div>

      <ul className="donut-legend">
        {STATUSES.map((item) => {
          const value = counts[item.status]
          const share = total === 0 ? 0 : Math.round((value / total) * 100)
          return (
            <li key={item.status}>
              <button
                type="button"
                onClick={() => onSelect(item)}
                aria-haspopup="dialog"
                className={`donut-legend-item${hovered === item.status ? ' is-active' : ''}`}
                style={{ '--tone': item.color } as CSSProperties}
                onMouseEnter={() => setHovered(item.status)}
                onMouseLeave={() => setHovered(null)}
                onFocus={() => setHovered(item.status)}
                onBlur={() => setHovered(null)}
              >
                <span className="donut-dot" aria-hidden="true" />
                <span className="donut-label">{item.label}</span>
                <span className="donut-share num" dir="ltr">
                  {busy ? '—' : `${share}%`}
                </span>
                <span className="donut-count num" dir="ltr">
                  {busy ? '' : count(value)}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

const TONE_ICONS = { customers: Users, transactions: FileText, profit: TrendingUp }

function SummaryCard({
  tone,
  title,
  caption,
  value,
  today,
  items,
  busy,
  to,
}: {
  tone: 'customers' | 'transactions' | 'profit'
  title: string
  caption: string
  value: string
  today: { value: string; active: boolean }
  items: { label: string; value: string }[]
  busy: boolean
  to: string
}) {
  const Icon = TONE_ICONS[tone]
  return (
    <section className={`summary-card ${tone}`} aria-busy={busy}>
      <div className="summary-top">
        <div className="summary-heading">
          <h2 className="summary-kicker">{title}</h2>
          <p className="summary-caption">{caption}</p>
        </div>
        <span className="summary-mark" aria-hidden="true">
          <Icon size={22} strokeWidth={1.9} />
        </span>
      </div>

      <div className="summary-value-row">
        <div className="summary-value num" dir="ltr">
          {busy ? <span className="skeleton skeleton-line summary-skeleton" /> : value}
        </div>
        {!busy && (
          <span className={`summary-pill${today.active ? ' is-up' : ''}`}>
            {today.active && <TrendingUp size={13} aria-hidden="true" />}
            اليوم
            <span className="num" dir="ltr">
              {today.active ? `+${today.value}` : today.value}
            </span>
          </span>
        )}
      </div>

      <div className="summary-foot">
        <dl className="summary-stats">
          {items.map((item) => (
            <div className="summary-mini" key={item.label}>
              <dt className="summary-mini-label">{item.label}</dt>
              <dd className="summary-mini-value num" dir="ltr">
                {busy ? <span className="skeleton skeleton-short" /> : item.value}
              </dd>
            </div>
          ))}
        </dl>
        <Link to={to} className="summary-more">
          عرض {title}
          <ArrowLeft size={14} aria-hidden="true" />
        </Link>
      </div>
    </section>
  )
}
