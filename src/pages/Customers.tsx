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
import SelectField from '../components/SelectField'
import Modal from '../components/Modal'
import CustomerForm from '../components/CustomerForm'
import PrintButton from '../components/PrintButton'
import { printReport, type PrintColumn } from '../lib/print'

export default function Customers() {
  const { isAdmin } = useAuth()
  const [rows, setRows] = useState<CustomerSummary[]>([])
  const [search, setSearch] = useState('')
  const [iqama, setIqama] = useState('')
  const [activity, setActivity] = useState<Activity>('')
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

  // "Has / no transactions" filter runs on the loaded list; counts feed the dropdown labels.
  const withTx = rows.filter((row) => Number(row.transactions_count) > 0).length
  const shown = activity === '' ? rows : rows.filter((row) => (Number(row.transactions_count) > 0) === (activity === 'with'))

  const pages = useHeightPages(shown.length, !loading && shown.length > 0, `${isAdmin}-${activity}`)
  const visibleRows = shown.slice(pages.start, pages.end)

  useEffect(() => {
    pages.setPage(0)
  }, [search, iqama, activity])

  return (
    <div className="customers-page">
      <div className="page-head">
        <div className="customers-heading">
          <h1>العملاء</h1>
          <p className="customers-count">
            <span className="customers-count-num">{count(shown.length)}</span>
            عميل في النتائج
          </p>
        </div>
        <div className="page-actions">
          <PrintButton disabled={loading} onPrint={() => printCustomers(shown, search, iqama, activity)} />
          <button type="button" className="btn btn-primary" onClick={() => setAddOpen(true)}>
            إضافة عميل
          </button>
        </div>
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
            <label htmlFor="filter-activity">المعاملات</label>
            <SelectField
              id="filter-activity"
              value={activity}
              onChange={(value) => setActivity(value as Activity)}
              options={[
                { value: '', label: `كل العملاء (${count(rows.length)})` },
                { value: 'with', label: `${ACTIVITY_LABELS.with} (${count(withTx)})` },
                { value: 'without', label: `${ACTIVITY_LABELS.without} (${count(rows.length - withTx)})` },
              ]}
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
                setActivity('')
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
            {loading && shown.length === 0 ? (
              <SkeletonRows columns={isAdmin ? 7 : 8} />
            ) : (
              visibleRows.map((row) => (
                <CustomerRow key={row.id} row={row} isAdmin={isAdmin} openCount={openCounts[row.id] ?? 0} />
              ))
            )}
          </tbody>
        </table>
        {!loading && shown.length === 0 && <div className="empty">لا توجد نتائج</div>}
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
          {shown.map((row) => (
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

/** Prints every customer in the current (filtered) list. Transaction value is left off paper on purpose. */
type Activity = '' | 'with' | 'without'

const ACTIVITY_LABELS: Record<'with' | 'without', string> = {
  with: 'لديهم معاملات',
  without: 'بدون معاملات',
}

function printCustomers(rows: CustomerSummary[], search: string, iqama: string, activity: Activity) {
  const columns: PrintColumn<CustomerSummary>[] = [
    { label: 'الاسم', value: (row) => row.full_name },
    { label: 'المهنة', value: (row) => row.profession?.trim() },
    { label: 'الجوال', numeric: true, value: (row) => row.mobile },
    { label: 'رقم الإقامة', numeric: true, value: (row) => row.national_id },
    { label: 'المدينة', value: (row) => row.city },
    { label: 'عدد المعاملات', numeric: true, value: (row) => count(row.transactions_count) },
    { label: 'تاريخ الإضافة', numeric: true, value: (row) => formatDate(row.created_at) },
  ]
  const details: string[] = []
  if (search.trim()) details.push(`بحث: ${search.trim()}`)
  if (iqama.trim()) details.push(`رقم الإقامة: ${iqama.trim()}`)
  if (activity) details.push(ACTIVITY_LABELS[activity])
  if (!details.length) details.push('كل العملاء')
  printReport({ title: 'العملاء', details, columns, rows })
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
