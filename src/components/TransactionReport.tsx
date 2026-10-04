import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import DateField from './DateField'
import { SkeletonRows } from './LoadingSkeleton'
import SelectField from './SelectField'
import { loadOfficeProfitMap } from '../lib/finance'
import { supabase } from '../lib/supabase'
import { downloadCsv, type CsvValue } from '../lib/csv'
import { count, errorMessage, formatDate, money, transactionStatus } from '../lib/format'

const PAGE_SIZE = 25
const REPORT_COLUMNS =
  'id, customer_id, customer_name, customer_mobile, service_name, transaction_value, status, created_at'
const STATUS_KEYS = ['pending', 'in_progress', 'completed', 'cancelled'] as const

type StatusKey = (typeof STATUS_KEYS)[number]

interface ReportRow {
  id: string
  customer_id: string
  customer_name: string
  customer_mobile: string
  service_name: string
  transaction_value: string | null
  status: string
  created_at: string
  original_profit?: string
}

interface Filters {
  from: string
  to: string
  status: string
  customer: string
  service: string
}

function riyadhDay(value: string): string {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return ''
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Riyadh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(parsed)
}

function riyadhStart(day: string): string {
  return `${day}T00:00:00+03:00`
}

function riyadhEnd(day: string): string {
  return `${day}T23:59:59.999+03:00`
}

function applyFilters(query: any, filters: Filters, includeStatus = true) {
  let next = query
  const customer = filters.customer.trim().replace(/[%,()]/g, ' ')
  const service = filters.service.trim().replace(/[%,()]/g, ' ')
  if (customer) next = next.ilike('customer_name', `%${customer}%`)
  if (service) next = next.ilike('service_name', `%${service}%`)
  if (includeStatus && filters.status) next = next.eq('status', filters.status)
  if (filters.from) next = next.gte('created_at', riyadhStart(filters.from))
  if (filters.to) next = next.lte('created_at', riyadhEnd(filters.to))
  return next
}

export default function TransactionReport({ canViewFinance }: { canViewFinance: boolean }) {
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [status, setStatus] = useState('')
  const [customerSearch, setCustomerSearch] = useState('')
  const [serviceSearch, setServiceSearch] = useState('')
  const [debouncedCustomer, setDebouncedCustomer] = useState('')
  const [debouncedService, setDebouncedService] = useState('')
  const [page, setPage] = useState(1)
  const [rows, setRows] = useState<ReportRow[]>([])
  const [filteredTotal, setFilteredTotal] = useState(0)
  const [statusCounts, setStatusCounts] = useState<Record<StatusKey, number>>({
    pending: 0,
    in_progress: 0,
    completed: 0,
    cancelled: 0,
  })
  const [profit, setProfit] = useState<number | null>(null)
  const [profitNote, setProfitNote] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [exportError, setExportError] = useState('')
  const requestId = useRef(0)

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedCustomer(customerSearch), 250)
    return () => clearTimeout(timer)
  }, [customerSearch])

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedService(serviceSearch), 250)
    return () => clearTimeout(timer)
  }, [serviceSearch])

  const load = useCallback(async () => {
    const id = ++requestId.current
    setLoading(true)
    setError('')
    setProfit(null)
    setProfitNote('')

    const filters: Filters = {
      from: fromDate,
      to: toDate,
      status,
      customer: debouncedCustomer,
      service: debouncedService,
    }
    if (fromDate && toDate && fromDate > toDate) {
      if (id !== requestId.current) return
      setRows([])
      setFilteredTotal(0)
      setStatusCounts({ pending: 0, in_progress: 0, completed: 0, cancelled: 0 })
      setError('تاريخ البداية بعد تاريخ النهاية.')
      setLoading(false)
      return
    }

    const narrowed = Boolean(filters.customer.trim() || filters.service.trim())
    const completedOnly = filters.status === 'completed' || filters.status === ''
    const blockedStatus = filters.status === 'pending' || filters.status === 'in_progress' || filters.status === 'cancelled'
    const start = (page - 1) * PAGE_SIZE

    const pageQuery = applyFilters(
      supabase.from('transaction_details').select(REPORT_COLUMNS, { count: 'exact' }),
      filters,
    )
      .order('created_at', { ascending: false })
      .range(start, start + PAGE_SIZE - 1)

    const statusQueries = filters.status
      ? []
      : STATUS_KEYS.map((item) =>
          applyFilters(
            supabase.from('transaction_details').select('id', { count: 'exact', head: true }).eq('status', item),
            filters,
            false,
          ),
        )

    const profitQuery =
      canViewFinance && completedOnly && !narrowed
        ? supabase.rpc('profit_report', {
            p_from: fromDate || null,
            p_to: toDate || null,
            p_customer_id: null,
            p_nationality: null,
            p_city: null,
          })
        : null

    const [pageRes, profitRes, ...statusRes] = await Promise.all([
      pageQuery,
      profitQuery ?? Promise.resolve(null),
      ...statusQueries,
    ])
    if (id !== requestId.current) return

    if (pageRes.error || statusRes.some((result) => result.error)) {
      setError(errorMessage(pageRes.error || statusRes.find((result) => result.error)?.error))
      setLoading(false)
      return
    }

    const total = pageRes.count ?? 0
    const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))
    if (total > 0 && start >= total) {
      setPage(pageCount)
      setLoading(false)
      return
    }

    const nextCounts = { pending: 0, in_progress: 0, completed: 0, cancelled: 0 }
    if (filters.status && STATUS_KEYS.includes(filters.status as StatusKey)) {
      nextCounts[filters.status as StatusKey] = total
    } else {
      STATUS_KEYS.forEach((item, index) => {
        nextCounts[item] = statusRes[index].count ?? 0
      })
    }

    let list = (pageRes.data ?? []) as ReportRow[]
    if (canViewFinance) {
      try {
        const profits = await loadOfficeProfitMap()
        if (id !== requestId.current) return
        list = list.map((row) => ({ ...row, original_profit: profits[row.id] }))
      } catch (profitError) {
        if (id !== requestId.current) return
        setError(errorMessage(profitError))
      }
    }

    if (!canViewFinance) {
      setProfit(null)
      setProfitNote('')
    } else if (blockedStatus) {
      setProfit(0)
      setProfitNote('')
    } else if (narrowed) {
      setProfit(null)
      setProfitNote(
        'لا يمكن حساب إجمالي ربح المكتب عند البحث بالعميل أو الخدمة بالدوال المالية الحالية. عمولة الصف تظهر في الجدول فقط.',
      )
    } else if (profitRes && 'error' in profitRes && profitRes.error) {
      setProfit(null)
      setError(errorMessage(profitRes.error))
    } else if (profitRes && 'data' in profitRes) {
      const summary = profitRes.data as { total_profit?: string | number } | null
      setProfit(Number(summary?.total_profit) || 0)
      setProfitNote('')
    }

    setRows(list)
    setFilteredTotal(total)
    setStatusCounts(nextCounts)
    setLoading(false)
  }, [fromDate, toDate, status, debouncedCustomer, debouncedService, page, canViewFinance])

  useEffect(() => {
    void load()
  }, [load])

  const pageCount = Math.max(1, Math.ceil(filteredTotal / PAGE_SIZE))
  const pageValue = rows.reduce((sum, row) => sum + (Number(row.transaction_value) || 0), 0)

  function resetFilters() {
    setFromDate('')
    setToDate('')
    setStatus('')
    setCustomerSearch('')
    setServiceSearch('')
    setPage(1)
  }

  function exportPage() {
    setExportError('')
    try {
      const day = riyadhDay(new Date().toISOString()) || 'report'
      const header = ['التاريخ', 'العميل', 'الجوال', 'الخدمة', 'قيمة المعاملة', 'الحالة']
      if (canViewFinance) header.push('عمولة المكتب')
      const body = rows.map((row) => {
        const values: CsvValue[] = [
          formatDate(row.created_at),
          row.customer_name,
          row.customer_mobile,
          row.service_name,
          row.transaction_value ?? '',
          transactionStatus(row.status).label,
        ]
        if (canViewFinance) values.push(row.original_profit ?? '')
        return values
      })
      downloadCsv(`reports-transactions-${day}.csv`, [header, ...body])
    } catch {
      setExportError('تعذر إنشاء ملف التصدير')
    }
  }

  return (
    <>
      <div className="page-head">
        <p className="report-note" style={{ margin: 0 }}>
          الأعداد تخص كل النتائج بعد التصفية. قيمة المعاملة في الصفحة الحالية ليست ربح المكتب.
        </p>
        <button type="button" className="btn" onClick={exportPage} disabled={loading || Boolean(error) || rows.length === 0}>
          تصدير الصفحة الحالية CSV
        </button>
      </div>

      {exportError && <div className="alert alert-error">{exportError}</div>}
      {error && <div className="alert alert-error">{error}</div>}

      <section className="card" aria-label="تصفية تقرير المعاملات">
        <h2 className="card-title">التصفية</h2>
        <div className="filters">
          <div className="field">
            <label htmlFor="tx-report-from">من تاريخ</label>
            <DateField
              id="tx-report-from"
              value={fromDate}
              onChange={(value) => {
                setFromDate(value)
                setPage(1)
              }}
            />
          </div>
          <div className="field">
            <label htmlFor="tx-report-to">إلى تاريخ</label>
            <DateField
              id="tx-report-to"
              value={toDate}
              onChange={(value) => {
                setToDate(value)
                setPage(1)
              }}
            />
          </div>
          <div className="field">
            <label htmlFor="tx-report-status">الحالة</label>
            <SelectField
              id="tx-report-status"
              value={status}
              onChange={(value) => {
                setStatus(value)
                setPage(1)
              }}
              options={[
                { value: '', label: 'كل الحالات' },
                ...STATUS_KEYS.map((item) => ({ value: item, label: transactionStatus(item).label })),
              ]}
            />
          </div>
          <div className="field">
            <label htmlFor="tx-report-customer">بحث العميل</label>
            <input
              id="tx-report-customer"
              value={customerSearch}
              placeholder="اسم العميل"
              onChange={(event) => {
                setCustomerSearch(event.target.value)
                setPage(1)
              }}
            />
          </div>
          <div className="field">
            <label htmlFor="tx-report-service">بحث الخدمة</label>
            <input
              id="tx-report-service"
              value={serviceSearch}
              placeholder="اسم الخدمة"
              onChange={(event) => {
                setServiceSearch(event.target.value)
                setPage(1)
              }}
            />
          </div>
          <div className="field">
            <label>&nbsp;</label>
            <button type="button" className="btn btn-ghost" onClick={resetFilters}>
              مسح التصفية
            </button>
          </div>
        </div>
      </section>

      <div className="tx-summary" aria-label="ملخص تقرير المعاملات">
        <Summary label="عدد المعاملات" value={filteredTotal} />
        {STATUS_KEYS.map((item) => (
          <Summary key={item} label={transactionStatus(item).label} value={statusCounts[item]} />
        ))}
      </div>

      <p className="note-line tx-page-value">إجمالي قيمة المعاملات في الصفحة الحالية: {money(pageValue)}</p>
      {canViewFinance && profit != null && (
        <p className="note-line">إجمالي ربح المكتب للمعاملات المكتملة في الفترة: {money(profit)}</p>
      )}
      {canViewFinance && profitNote && <p className="report-note">{profitNote}</p>}

      <div className="table-wrap tx-list" style={{ marginTop: 16 }}>
        <table>
          <thead>
            <tr>
              <th>التاريخ</th>
              <th>العميل</th>
              <th>الجوال</th>
              <th>الخدمة</th>
              <th>قيمة المعاملة</th>
              <th>الحالة</th>
              {canViewFinance && <th>عمولة المكتب</th>}
            </tr>
          </thead>
          <tbody>
            {loading && rows.length === 0 ? (
              <SkeletonRows columns={canViewFinance ? 7 : 6} />
            ) : rows.map((row) => {
              const state = transactionStatus(row.status)
              return (
                <tr key={row.id}>
                  <td className="num" data-label="التاريخ">
                    <Link to={`/transactions/${row.id}`}>{formatDate(row.created_at)}</Link>
                  </td>
                  <td data-label="العميل">
                    <Link to={`/customers/${row.customer_id}`}>{row.customer_name}</Link>
                  </td>
                  <td className="num" dir="ltr" data-label="الجوال">
                    {row.customer_mobile || '—'}
                  </td>
                  <td data-label="الخدمة">
                    <Link to={`/transactions/${row.id}`}>{row.service_name}</Link>
                  </td>
                  <td className="num" data-label="قيمة المعاملة">
                    {row.transaction_value == null ? '—' : money(row.transaction_value)}
                  </td>
                  <td data-label="الحالة">
                    <span className={state.badge}>{state.label}</span>
                  </td>
                  {canViewFinance && (
                    <td className="num strong" data-label="عمولة المكتب">
                      {row.original_profit == null ? '—' : money(row.original_profit)}
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
        {!loading && rows.length === 0 && <div className="empty">لا توجد معاملات مطابقة</div>}
      </div>

      <div className="tx-pager">
        <button
          type="button"
          className="btn"
          onClick={() => setPage((current) => Math.max(1, current - 1))}
          disabled={loading || page <= 1}
        >
          السابق
        </button>
        <span className="tx-pager-label num">
          صفحة {count(page)} من {count(pageCount)} — {count(filteredTotal)} معاملة
        </span>
        <button
          type="button"
          className="btn"
          onClick={() => setPage((current) => Math.min(pageCount, current + 1))}
          disabled={loading || page >= pageCount}
        >
          التالي
        </button>
      </div>
    </>
  )
}

function Summary({ label, value }: { label: string; value: number }) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value num">{count(value)}</div>
    </div>
  )
}
