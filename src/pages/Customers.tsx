import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { CUSTOMER_SUMMARY_COLUMNS } from '../lib/finance'
import { supabase } from '../lib/supabase'
import { count, errorMessage, formatDate, money } from '../lib/format'
import { useHeightPages } from '../lib/useHeightPages'
import { useAuth } from '../auth/AuthProvider'
import type { CustomerSummary } from '../lib/types'
import { SkeletonRows } from '../components/LoadingSkeleton'
import { PagePager } from '../components/PagePager'
import Modal from '../components/Modal'
import CustomerForm from '../components/CustomerForm'

export default function Customers() {
  const { isAdmin } = useAuth()
  const [rows, setRows] = useState<CustomerSummary[]>([])
  const [search, setSearch] = useState('')
  const [iqama, setIqama] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [addOpen, setAddOpen] = useState(false)
  const [openCounts, setOpenCounts] = useState<Record<string, number>>({})

  const load = useCallback(async () => {
    setLoading(true)
    setError('')

    const term = search.trim()
    const safe = term.replace(/[%,()]/g, ' ')
    const iqamaTerm = iqama.trim().replace(/[%,()]/g, '')
    const customerQuery = (includeProfession: boolean) => {
      const columns = includeProfession
        ? CUSTOMER_SUMMARY_COLUMNS
        : CUSTOMER_SUMMARY_COLUMNS.replace(', profession', '')
      let query = supabase
        .from('customer_summary')
        .select<string, CustomerSummary>(columns)
        .order('created_at', { ascending: false })
      if (term) {
        const match = includeProfession
          ? `full_name.ilike.%${safe}%,mobile.ilike.%${safe}%,profession.ilike.%${safe}%`
          : `full_name.ilike.%${safe}%,mobile.ilike.%${safe}%`
        query = query.or(match)
      }
      if (iqamaTerm) query = query.ilike('national_id', `%${iqamaTerm}%`)
      return query
    }

    const [firstCustomers, openRes] = await Promise.all([
      customerQuery(true),
      supabase.from('transactions').select('customer_id').in('status', ['pending', 'in_progress']),
    ])
    const customersRes =
      firstCustomers.error && /profession/i.test(firstCustomers.error.message)
        ? await customerQuery(false)
        : firstCustomers

    if (customersRes.error) setError(errorMessage(customersRes.error))
    else setRows(customersRes.data ?? [])

    const counts: Record<string, number> = {}
    if (!openRes.error) {
      for (const item of openRes.data ?? []) {
        counts[item.customer_id] = (counts[item.customer_id] ?? 0) + 1
      }
    }
    setOpenCounts(counts)
    setLoading(false)
  }, [search, iqama])

  useEffect(() => {
    const timer = setTimeout(() => void load(), 250)
    return () => clearTimeout(timer)
  }, [load])

  const pages = useHeightPages(rows.length, !loading && rows.length > 0, String(isAdmin))
  const visibleRows = rows.slice(pages.start, pages.end)

  useEffect(() => {
    pages.setPage(0)
  }, [search, iqama])

  return (
    <div className="customers-page">
      <div className="page-head">
        <div>
          <h1>العملاء</h1>
          <p className="page-sub">{count(rows.length)} عميل في النتائج</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => setAddOpen(true)}>
          إضافة عميل
        </button>
      </div>

      <div className="card">
        <div className="filters">
          <div className="field">
            <label htmlFor="search">بحث (الاسم أو الجوال)</label>
            <input
              id="search"
              value={search}
              placeholder="اكتب للبحث…"
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="field">
            <label htmlFor="filter-iqama">رقم الإقامة</label>
            <input
              id="filter-iqama"
              dir="ltr"
              inputMode="numeric"
              value={iqama}
              placeholder="ابحث برقم الإقامة"
              onChange={(e) => setIqama(e.target.value)}
            />
          </div>

          <div className="field">
            <label>&nbsp;</label>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                setSearch('')
                setIqama('')
              }}
            >
              مسح التصفية
            </button>
          </div>
        </div>
      </div>

      {error && <div className="alert alert-error" style={{ marginTop: 16 }}>{error}</div>}

      <div className="table-wrap table-sheet" ref={pages.sheetRef} style={{ marginTop: 16 }}>
        <table>
          <CustomerHead isAdmin={isAdmin} />
          <tbody>
            {loading && rows.length === 0 ? (
              <SkeletonRows columns={isAdmin ? 7 : 8} />
            ) : (
              visibleRows.map((row) => (
                <CustomerRow key={row.id} row={row} isAdmin={isAdmin} openCount={openCounts[row.id] ?? 0} />
              ))
            )}
          </tbody>
        </table>
        {!loading && rows.length === 0 && <div className="empty">لا توجد نتائج</div>}
      </div>
      {pages.pageCount > 1 && (
        <PagePager
          className="table-pager"
          page={pages.currentPage}
          pageCount={pages.pageCount}
          onPage={pages.setPage}
        />
      )}
      <table className="price-measure" aria-hidden="true" inert>
        <tbody ref={pages.measureRef}>
          {rows.map((row) => (
            <CustomerRow key={row.id} row={row} isAdmin={isAdmin} openCount={openCounts[row.id] ?? 0} />
          ))}
        </tbody>
      </table>

      <Modal title="إضافة عميل" open={addOpen} onClose={() => setAddOpen(false)}>
        <CustomerForm
          onCancel={() => setAddOpen(false)}
          onSaved={() => {
            setAddOpen(false)
            void load()
          }}
        />
      </Modal>
    </div>
  )
}

function CustomerHead({ isAdmin }: { isAdmin: boolean }) {
  return (
    <thead>
      <tr>
        <th>الاسم</th>
        <th>المهنة</th>
        <th>الجوال</th>
        <th>رقم الإقامة</th>
        <th>المدينة</th>
        <th>عدد المعاملات</th>
        {!isAdmin && <th>قيمة المعاملة</th>}
        <th>تاريخ الإضافة</th>
      </tr>
    </thead>
  )
}

function CustomerRow({
  row,
  isAdmin,
  openCount,
}: {
  row: CustomerSummary
  isAdmin: boolean
  openCount: number
}) {
  return (
    <tr className={openCount > 0 ? 'row-open' : undefined}>
      <td>
        <span className="name-cell">
          <Link to={`/customers/${row.id}`}>{row.full_name}</Link>
          {openCount > 0 && (
            <span className="badge badge-pending">
              {openCount > 1 ? `${count(openCount)} غير مكتملة` : 'غير مكتملة'}
            </span>
          )}
        </span>
      </td>
      <td>{row.profession?.trim() || '—'}</td>
      <td className="num" dir="ltr">
        {row.mobile || '—'}
      </td>
      <td className="num" dir="ltr">
        {row.national_id || '—'}
      </td>
      <td>{row.city || '—'}</td>
      <td className="num">{count(row.transactions_count)}</td>
      {!isAdmin && <td className="num strong">{money(row.total_transaction_value)}</td>}
      <td className="num muted">{formatDate(row.created_at)}</td>
    </tr>
  )
}
