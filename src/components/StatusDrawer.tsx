import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, List, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { SkeletonRows } from './LoadingSkeleton'
import { TRANSACTION_DETAIL_COLUMNS } from '../lib/finance'
import { supabase } from '../lib/supabase'
import { count, errorMessage, formatDate, transactionStatus } from '../lib/format'
import type { TransactionDetail } from '../lib/types'

const PAGE_SIZE = 10

export interface DrawerStatus {
  status: string
  label: string
  color: string
}

/**
 * Side panel listing the transactions of one status, opened from the dashboard.
 * Rows open the regular transaction view; "View all" goes to the full filtered list.
 */
export default function StatusDrawer({
  target,
  onClose,
  onOpenRow,
  enrich,
  reloadKey,
}: {
  target: DrawerStatus | null
  onClose: () => void
  onOpenRow: (row: TransactionDetail) => void
  enrich: (rows: TransactionDetail[]) => Promise<TransactionDetail[]>
  reloadKey: number
}) {
  const navigate = useNavigate()
  const [page, setPage] = useState(0)
  const [rows, setRows] = useState<TransactionDetail[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const closeRef = useRef<HTMLButtonElement>(null)
  const status = target?.status

  // Start from the first page whenever a different status is opened.
  const [shownStatus, setShownStatus] = useState(status)
  if (status !== shownStatus) {
    setShownStatus(status)
    setPage(0)
    setRows([])
    setTotal(0)
  }

  useEffect(() => {
    if (!status) return
    let cancelled = false
    async function fetchPage() {
      setLoading(true)
      setError('')
      const from = page * PAGE_SIZE
      const { data, error: fetchError, count: found } = await supabase
        .from('transaction_details')
        .select(TRANSACTION_DETAIL_COLUMNS, { count: 'exact' })
        .eq('status', status)
        .order('created_at', { ascending: false })
        .range(from, from + PAGE_SIZE - 1)
      if (cancelled) return
      if (fetchError) {
        setError(errorMessage(fetchError))
        setRows([])
      } else {
        const list = (data ?? []) as TransactionDetail[]
        let enriched = list
        try {
          enriched = await enrich(list)
        } catch {
          // Amount columns stay empty if the office share can't be loaded; the list still shows.
        }
        if (cancelled) return
        setRows(enriched)
        setTotal(found ?? 0)
      }
      setLoading(false)
    }
    void fetchPage()
    return () => {
      cancelled = true
    }
  }, [status, page, enrich, reloadKey])

  useEffect(() => {
    if (!target) return
    closeRef.current?.focus()
    function onKey(event: KeyboardEvent) {
      // Leave Escape to the transaction modal when it is open on top of the panel.
      if (event.key === 'Escape' && !document.querySelector('.modal-backdrop')) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [target, onClose])

  if (!target) return null

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const first = total === 0 ? 0 : page * PAGE_SIZE + 1
  const last = Math.min(total, (page + 1) * PAGE_SIZE)

  return (
    <div className="drawer-backdrop" onMouseDown={onClose}>
      <aside
        className="drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="drawer-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="drawer-head">
          <span className="drawer-icon" aria-hidden="true">
            <List size={16} />
          </span>
          <div className="drawer-heading">
            <h2 id="drawer-title">
              <span className="drawer-dot" style={{ background: target.color }} aria-hidden="true" />
              {target.label}
            </h2>
            <p>
              إجمالي السجلات: <span className="num">{count(total)}</span>
            </p>
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-sm drawer-all"
            onClick={() => {
              onClose()
              navigate(`/transactions?status=${target.status}`)
            }}
          >
            عرض الكل
          </button>
          <button ref={closeRef} type="button" className="drawer-close" onClick={onClose} aria-label="إغلاق">
            <X size={16} />
          </button>
        </header>

        <div className="drawer-body">
          {error && <div className="alert alert-error drawer-alert">{error}</div>}
          <table className="drawer-table">
            <thead>
              <tr>
                <th>العميل</th>
                <th>المعاملة</th>
                <th>الحالة</th>
                <th>التاريخ</th>
              </tr>
            </thead>
            <tbody>
              {loading && rows.length === 0 ? (
                <SkeletonRows columns={4} rows={6} />
              ) : (
                rows.map((row) => {
                  const badge = transactionStatus(row.status)
                  return (
                    <tr
                      key={row.id}
                      className="drawer-row"
                      tabIndex={0}
                      onClick={() => onOpenRow(row)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault()
                          onOpenRow(row)
                        }
                      }}
                    >
                      <td className="drawer-strong">{row.customer_name}</td>
                      <td>{row.service_name}</td>
                      <td>
                        <span className={badge.badge}>{badge.label}</span>
                      </td>
                      <td className="num muted">{formatDate(row.created_at)}</td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
          {!loading && !error && rows.length === 0 && <p className="drawer-empty">لا توجد معاملات بهذه الحالة</p>}
        </div>

        <footer className="drawer-foot">
          <span className="num">
            {first}–{last} من {total}
          </span>
          <div className="drawer-pager">
            <button
              type="button"
              onClick={() => setPage((current) => current - 1)}
              disabled={page === 0 || loading}
              aria-label="الصفحة السابقة"
            >
              <ChevronRight size={16} />
            </button>
            <span className="num" dir="ltr">
              {page + 1}/{pages}
            </span>
            <button
              type="button"
              onClick={() => setPage((current) => current + 1)}
              disabled={page + 1 >= pages || loading}
              aria-label="الصفحة التالية"
            >
              <ChevronLeft size={16} />
            </button>
          </div>
        </footer>
      </aside>
    </div>
  )
}
