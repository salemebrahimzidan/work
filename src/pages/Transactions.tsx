import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { TRANSACTION_DETAIL_COLUMNS, loadOfficeProfitMap } from '../lib/finance'
import { supabase } from '../lib/supabase'
import { count, errorMessage, money } from '../lib/format'
import { useAuth } from '../auth/AuthProvider'
import { useCompany } from '../auth/CompanyProvider'
import type { TransactionDetail } from '../lib/types'
import Modal from '../components/Modal'
import TransactionForm from '../components/TransactionForm'
import TransactionsTable from '../components/TransactionsTable'
import SelectField from '../components/SelectField'
import DateField from '../components/DateField'

const PAGE_SIZE = 25
const STATUS_KEYS = ['pending', 'in_progress', 'completed', 'cancelled'] as const

type StatusKey = (typeof STATUS_KEYS)[number]

const STATUS_LABELS: Record<StatusKey, string> = {
  pending: 'قيد الانتظار',
  in_progress: 'قيد التنفيذ',
  completed: 'مكتملة',
  cancelled: 'ملغاة',
}

const EMPTY_COUNTS: Record<StatusKey, number> = {
  pending: 0,
  in_progress: 0,
  completed: 0,
  cancelled: 0,
}

interface ListFilters {
  search: string
  status: string
  from: string
  to: string
}

function riyadhStart(day: string): string {
  return `${day}T00:00:00+03:00`
}

function riyadhEnd(day: string): string {
  return `${day}T23:59:59.999+03:00`
}

function applyFilters(query: any, filters: ListFilters, includeStatus = true) {
  let next = query
  const term = filters.search.trim()
  if (term) {
    const safe = term.replace(/[%,()]/g, ' ')
    next = next.or(`customer_name.ilike.%${safe}%,service_name.ilike.%${safe}%`)
  }
  if (includeStatus && filters.status) next = next.eq('status', filters.status)
  if (filters.from) next = next.gte('created_at', riyadhStart(filters.from))
  if (filters.to) next = next.lte('created_at', riyadhEnd(filters.to))
  return next
}

export default function Transactions() {
  const { isAdmin } = useAuth()
  const { canViewFinance, loading: companyLoading } = useCompany()
  const [rows, setRows] = useState<TransactionDetail[]>([])
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [page, setPage] = useState(1)
  const [filteredTotal, setFilteredTotal] = useState(0)
  const [statusCounts, setStatusCounts] = useState(EMPTY_COUNTS)
  const [params, setParams] = useSearchParams()
  const rawStatus = params.get('status') ?? ''
  const status = STATUS_KEYS.includes(rawStatus as StatusKey) ? rawStatus : ''
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [addOpen, setAddOpen] = useState(false)
  const requestId = useRef(0)

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 250)
    return () => clearTimeout(timer)
  }, [search])

  const statusRef = useRef(status)
  useEffect(() => {
    if (statusRef.current === status) return
    statusRef.current = status
    setPage(1)
  }, [status])

  function setStatus(next: string) {
    const nextParams = new URLSearchParams(params)
    if (next) nextParams.set('status', next)
    else nextParams.delete('status')
    setParams(nextParams, { replace: true })
    setPage(1)
  }

  const load = useCallback(async () => {
    const id = ++requestId.current
    setLoading(true)
    setError('')

    const filters: ListFilters = { search: debouncedSearch, status, from: fromDate, to: toDate }
    if (fromDate && toDate && fromDate > toDate) {
      if (id !== requestId.current) return
      setRows([])
      setFilteredTotal(0)
      setStatusCounts(EMPTY_COUNTS)
      setError('تاريخ البداية بعد تاريخ النهاية.')
      setLoading(false)
      return
    }

    const start = (page - 1) * PAGE_SIZE
    const pageQuery = applyFilters(
      supabase.from('transaction_details').select(TRANSACTION_DETAIL_COLUMNS, { count: 'exact' }),
      filters,
    )
      .order('created_at', { ascending: false })
      .range(start, start + PAGE_SIZE - 1)

    const statusQueries = status
      ? []
      : STATUS_KEYS.map((item) =>
          applyFilters(
            supabase
              .from('transaction_details')
              .select('id', { count: 'exact', head: true })
              .eq('status', item),
            filters,
            false,
          ),
        )

    const [pageRes, ...statusRes] = await Promise.all([pageQuery, ...statusQueries])
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

    const nextCounts = { ...EMPTY_COUNTS }
    if (status) {
      nextCounts[status as StatusKey] = total
    } else {
      STATUS_KEYS.forEach((item, index) => {
        nextCounts[item] = statusRes[index].count ?? 0
      })
    }

    const list = (pageRes.data ?? []) as TransactionDetail[]
    setFilteredTotal(total)
    setStatusCounts(nextCounts)

    if (canViewFinance) {
      try {
        const profits = await loadOfficeProfitMap()
        if (id !== requestId.current) return
        setRows(list.map((row) => ({ ...row, original_profit: profits[row.id] })))
      } catch (profitError) {
        setRows(list)
        setError(errorMessage(profitError))
      }
    } else {
      setRows(list)
    }
    setLoading(false)
  }, [debouncedSearch, status, fromDate, toDate, page, canViewFinance])

  useEffect(() => {
    if (companyLoading) return
    void load()
  }, [companyLoading, load])

  const pageCount = Math.max(1, Math.ceil(filteredTotal / PAGE_SIZE))
  const pageValue = rows.reduce((sum, row) => sum + (Number(row.transaction_value) || 0), 0)

  function resetFilters() {
    setSearch('')
    setFromDate('')
    setToDate('')
    setStatus('')
    setPage(1)
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>المعاملات</h1>
          <p className="page-sub">{count(filteredTotal)} معاملة في النتائج</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => setAddOpen(true)}>
          إضافة معاملة
        </button>
      </div>

      <div className="tx-summary" aria-label="ملخص النتائج">
        <Summary label="إجمالي المعاملات" value={filteredTotal} />
        {STATUS_KEYS.map((item) => (
          <Summary key={item} label={STATUS_LABELS[item]} value={statusCounts[item]} />
        ))}
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="filters">
          <div className="field">
            <label htmlFor="tx-search">بحث (العميل أو المعاملة)</label>
            <input
              id="tx-search"
              value={search}
              placeholder="اكتب للبحث…"
              onChange={(event) => {
                setSearch(event.target.value)
                setPage(1)
              }}
            />
          </div>

          <div className="field">
            <label htmlFor="tx-status">الحالة</label>
            <SelectField
              id="tx-status"
              value={status}
              onChange={setStatus}
              options={[
                { value: '', label: 'كل الحالات' },
                ...STATUS_KEYS.map((item) => ({ value: item, label: STATUS_LABELS[item] })),
              ]}
            />
          </div>

          <div className="field">
            <label htmlFor="tx-from">من تاريخ</label>
            <DateField
              id="tx-from"
              value={fromDate}
              onChange={(value) => {
                setFromDate(value)
                setPage(1)
              }}
            />
          </div>

          <div className="field">
            <label htmlFor="tx-to">إلى تاريخ</label>
            <DateField
              id="tx-to"
              value={toDate}
              onChange={(value) => {
                setToDate(value)
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
      </div>

      {error && <div className="alert alert-error" style={{ marginTop: 16 }}>{error}</div>}

      <p className="note-line tx-page-value">
        إجمالي قيمة المعاملات في الصفحة الحالية: {money(pageValue)}
      </p>

      <div style={{ marginTop: 12 }}>
        <TransactionsTable
          rows={rows}
          loading={loading}
          officeLayout
          onChanged={() => void load()}
        />
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
          صفحة {count(page)} من {count(pageCount)}
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

      {!isAdmin && (
        <p className="note-line" style={{ marginTop: 10 }}>
          الأرباح المحفوظة مقفلة ولا يمكن تعديلها أو حذفها.
        </p>
      )}

      <Modal title="إضافة معاملة" open={addOpen} onClose={() => setAddOpen(false)}>
        <TransactionForm
          onCancel={() => setAddOpen(false)}
          onSaved={() => {
            setAddOpen(false)
            void load()
          }}
        />
      </Modal>
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
