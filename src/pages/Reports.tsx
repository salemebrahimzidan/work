import { useCallback, useEffect, useMemo, useState } from 'react'
import { useCompany } from '../auth/CompanyProvider'
import DateField from '../components/DateField'
import { SkeletonStack, SkeletonTable } from '../components/LoadingSkeleton'
import TransactionReport from '../components/TransactionReport'
import { supabase } from '../lib/supabase'
import { downloadCsv, type CsvValue } from '../lib/csv'
import { count, transactionStatus } from '../lib/format'

const CUSTOMER_COLUMNS = 'id, city, nationality, created_at'
const TRANSACTION_COLUMNS = 'customer_id, service_name, status, created_at'
const CUSTOMER_LOAD_ERROR = 'تعذر تحميل تقرير العملاء'
const NO_NATIONALITY = 'بدون جنسية'
const NO_CITY = 'بدون مدينة'
const NO_SERVICE = 'بدون خدمة'
const RIYADH_TZ = 'Asia/Riyadh'
const TX_STATUSES = ['pending', 'in_progress', 'completed', 'cancelled'] as const

const STATUS_CIRCLE: Record<
  TxStatus,
  { tone: 'pending' | 'progress' | 'completed' | 'cancelled'; color: string; track: string }
> = {
  pending: { tone: 'pending', color: '#e8a317', track: '#f8e7c0' },
  in_progress: { tone: 'progress', color: '#3b82c4', track: '#d7e8f6' },
  completed: { tone: 'completed', color: '#1f9d55', track: '#d7f0e3' },
  cancelled: { tone: 'cancelled', color: '#d64545', track: '#f8d6d6' },
}

type TxStatus = (typeof TX_STATUSES)[number]

const CUSTOMER_SECTIONS = [
  { id: 'summary', label: 'العملاء' },
  { id: 'status', label: 'حالات المعاملات' },
  { id: 'services', label: 'استخدام الخدمات' },
  { id: 'cities', label: 'حسب المدينة' },
  { id: 'nationalities', label: 'حسب الجنسية' },
] as const

type CustomerSection = (typeof CUSTOMER_SECTIONS)[number]['id']

interface CustomerRow {
  id: string
  city: string | null
  nationality: string | null
  created_at: string
}

interface TransactionRow {
  customer_id: string
  service_name: string
  status: string
  created_at: string
}

function riyadhDay(value: string): string {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return ''
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: RIYADH_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(parsed)
}

function inDayRange(day: string, from: string, to: string): boolean {
  if (!day) return false
  if (from && day < from) return false
  if (to && day > to) return false
  return true
}

export default function Reports() {
  const { company, role, loading: companyLoading, error: companyError, ambiguous, canViewReports, canViewFinance } =
    useCompany()
  const [customerLoading, setCustomerLoading] = useState(true)
  const [customerError, setCustomerError] = useState('')
  const [customers, setCustomers] = useState<CustomerRow[]>([])
  const [transactions, setTransactions] = useState<TransactionRow[]>([])
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [exportError, setExportError] = useState('')
  const [area, setArea] = useState<'customers' | 'transactions'>('customers')

  const loadCustomers = useCallback(async () => {
    if (!company || !canViewReports) {
      setCustomerLoading(false)
      return
    }
    setCustomerLoading(true)
    setCustomerError('')
    const [customerRes, transactionRes] = await Promise.all([
      supabase.from('customers').select(CUSTOMER_COLUMNS),
      supabase.from('transactions').select(TRANSACTION_COLUMNS),
    ])
    const failure = customerRes.error || transactionRes.error
    if (failure) {
      setCustomerError(CUSTOMER_LOAD_ERROR)
      setCustomerLoading(false)
      return
    }
    setCustomers(
      (customerRes.data ?? []).map((row) => ({
        id: String(row.id),
        city: (row.city as string | null) ?? null,
        nationality: (row.nationality as string | null) ?? null,
        created_at: String(row.created_at ?? ''),
      })),
    )
    setTransactions(
      (transactionRes.data ?? []).map((row) => ({
        customer_id: String(row.customer_id),
        service_name: String(row.service_name ?? ''),
        status: String(row.status ?? ''),
        created_at: String(row.created_at ?? ''),
      })),
    )
    setCustomerLoading(false)
  }, [canViewReports, company])

  useEffect(() => {
    if (companyLoading) return
    void loadCustomers()
  }, [companyLoading, loadCustomers])

  const exportDisabled = companyLoading || !company || !canViewReports || customerLoading || Boolean(customerError)

  function exportCustomerReport() {
    setExportError('')
    try {
      const day = riyadhDay(new Date().toISOString()) || 'report'
      downloadCsv(`reports-customers-${day}.csv`, customerCsvRows())
    } catch {
      setExportError('تعذر إنشاء ملف التصدير')
    }
  }

  function customerCsvRows(): CsvValue[][] {
    const report = buildCustomerReport(customers, transactions, fromDate, toDate)
    const fromLabel = fromDate || 'كل الفترات'
    const toLabel = toDate || 'كل الفترات'
    const rows: CsvValue[][] = [
      ['القسم', 'البند', 'القيمة', 'التوضيح'],
      ['الفترة', 'من تاريخ', fromLabel, 'توقيت الرياض'],
      ['الفترة', 'إلى تاريخ', toLabel, 'توقيت الرياض'],
      [
        'الفترة',
        'إجمالي العملاء والمدينة والجنسية',
        'كل العملاء',
        'هذه الأرقام لا تتأثر بالفترة',
      ],
      [
        'الفترة',
        'العملاء الجدد',
        'تاريخ إنشاء العميل',
        'ضمن الفترة المحددة',
      ],
      [
        'الفترة',
        'المعاملات',
        'تاريخ المعاملة',
        'الاستخدام والحالة والعملاء الذين لديهم معاملات',
      ],
    ]
    if (report.invalidRange) {
      rows.push(['الفترة', 'الحالة', 'تاريخ البداية بعد تاريخ النهاية', 'مؤشرات الفترة غير مضمّنة لأنها غير معروضة'])
    } else {
      const newLabel = report.rangeLimited ? 'عملاء جدد في الفترة' : 'عملاء جدد (كل الفترات)'
      const withLabel = report.rangeLimited ? 'عملاء لديهم معاملات في الفترة' : 'عملاء لديهم معاملات'
      const withoutLabel = report.rangeLimited ? 'عملاء بدون معاملات في الفترة' : 'عملاء بدون معاملات'
      rows.push(
        ['العملاء', 'إجمالي العملاء', report.summary.total, 'كل العملاء، لا يتأثر بالفترة'],
        ['العملاء', newLabel, report.summary.createdInRange, 'حسب تاريخ إنشاء العميل'],
        ['العملاء', withLabel, report.summary.withTransactions, 'حسب تاريخ المعاملة'],
        ['العملاء', withoutLabel, report.summary.withoutTransactions, 'حسب تاريخ المعاملة'],
        ['حالات المعاملات', 'قيد الانتظار', report.byStatus.pending, 'عدد المعاملات ضمن الفترة'],
        ['حالات المعاملات', 'قيد التنفيذ', report.byStatus.in_progress, 'عدد المعاملات ضمن الفترة'],
        ['حالات المعاملات', 'مكتملة', report.byStatus.completed, 'عدد المعاملات ضمن الفترة'],
        ['حالات المعاملات', 'ملغاة', report.byStatus.cancelled, 'عدد المعاملات ضمن الفترة'],
        ...countRows('استخدام الخدمات', report.byService, 'لا توجد معاملات في هذه الفترة.', 'عدد المعاملات ضمن الفترة'),
      )
    }
    rows.push(
      ...countRows('العملاء حسب المدينة', report.byCity, 'لا يوجد عملاء.', 'كل العملاء، لا يتأثر بالفترة'),
      ...countRows('العملاء حسب الجنسية', report.byNationality, 'لا يوجد عملاء.', 'كل العملاء، لا يتأثر بالفترة'),
    )
    return rows
  }

  if (!companyLoading && role && !canViewReports) {
    return (
      <div>
        <div className="page-head">
          <h1>التقارير</h1>
        </div>
        <div className="card">
          <p className="empty">لا تملك صلاحية عرض التقارير.</p>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>التقارير</h1>
          <p className="page-sub">العملاء والمعاملات</p>
        </div>
        {area === 'customers' && (
          <button type="button" className="btn" onClick={exportCustomerReport} disabled={exportDisabled}>
            تصدير CSV
          </button>
        )}
      </div>

      {companyError && <div className="alert alert-error">{companyError}</div>}
      {exportError && <div className="alert alert-error">{exportError}</div>}

      {companyLoading ? (
        <SkeletonTable headers={['العميل', 'المدينة', 'الجنسية', 'المعاملات']} />
      ) : !company ? (
        <div className="empty">
          {ambiguous ? 'يوجد أكثر من شركة لهذا الحساب ولم تُحدَّد الشركة النشطة.' : 'لا توجد شركة نشطة لهذا الحساب.'}
        </div>
      ) : (
        <>
          <div className="report-tabs" role="tablist" aria-label="أقسام التقارير">
            <button
              type="button"
              role="tab"
              aria-selected={area === 'customers'}
              className={area === 'customers' ? 'btn btn-primary' : 'btn btn-ghost'}
              onClick={() => setArea('customers')}
            >
              تقرير العملاء
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={area === 'transactions'}
              className={area === 'transactions' ? 'btn btn-primary' : 'btn btn-ghost'}
              onClick={() => setArea('transactions')}
            >
              تقرير المعاملات
            </button>
          </div>
          {area === 'customers' ? (
            <CustomerReport
              loading={customerLoading}
              error={customerError}
              customers={customers}
              transactions={transactions}
              fromDate={fromDate}
              toDate={toDate}
              onFromDate={setFromDate}
              onToDate={setToDate}
            />
          ) : (
            <TransactionReport canViewFinance={canViewFinance} />
          )}
        </>
      )}
    </div>
  )
}

function CustomerReport({
  loading,
  error,
  customers,
  transactions,
  fromDate,
  toDate,
  onFromDate,
  onToDate,
}: {
  loading: boolean
  error: string
  customers: CustomerRow[]
  transactions: TransactionRow[]
  fromDate: string
  toDate: string
  onFromDate: (value: string) => void
  onToDate: (value: string) => void
}) {
  const [section, setSection] = useState<CustomerSection>('summary')
  const report = useMemo(
    () => buildCustomerReport(customers, transactions, fromDate, toDate),
    [customers, fromDate, toDate, transactions],
  )
  const { invalidRange, rangeLimited, summary, byCity, byNationality, byService, byStatus } = report

  if (loading) return <SkeletonStack count={5} />
  if (error) return <div className="alert alert-error">{error}</div>

  const statusTotal = TX_STATUSES.reduce((sum, status) => sum + byStatus[status], 0)
  const customerTotal = summary.total
  const shareOfCustomers = (value: number) => (customerTotal === 0 ? 0 : (value / customerTotal) * 100)
  const customerRings = [
    {
      key: 'total',
      label: 'إجمالي العملاء',
      value: summary.total,
      share: customerTotal === 0 ? 0 : 100,
      color: '#14919b',
      ink: '#0b5d57',
      track: '#d7f3f0',
    },
    {
      key: 'new',
      label: rangeLimited ? 'عملاء جدد في الفترة' : 'عملاء جدد (كل الفترات)',
      value: summary.createdInRange,
      share: shareOfCustomers(summary.createdInRange),
      color: '#0e7490',
      ink: '#155e75',
      track: '#d4eef4',
    },
    {
      key: 'with',
      label: rangeLimited ? 'عملاء لديهم معاملات في الفترة' : 'عملاء لديهم معاملات',
      value: summary.withTransactions,
      share: shareOfCustomers(summary.withTransactions),
      color: '#2f8f72',
      ink: '#1d5c4a',
      track: '#dceee8',
    },
    {
      key: 'without',
      label: rangeLimited ? 'عملاء بدون معاملات في الفترة' : 'عملاء بدون معاملات',
      value: summary.withoutTransactions,
      share: shareOfCustomers(summary.withoutTransactions),
      color: '#c4a574',
      ink: '#7a5b32',
      track: '#f3eadc',
    },
  ]

  return (
    <>
      <section className="card" aria-label="فترة تقرير العملاء">
        <h2 className="card-title">الفترة</h2>
        <p className="report-note">
          التواريخ بتوقيت الرياض. العملاء الجدد يُحسبون من تاريخ إنشاء العميل. المعاملات واستخدام الخدمات
          وحالة المعاملات تُحسب من تاريخ المعاملة. إجمالي العملاء، والتوزيع حسب المدينة والجنسية، يبقى لكل
          العملاء ولا يتأثر بالفترة.
        </p>
        <div className="filters">
          <div className="field">
            <label htmlFor="report-from">من تاريخ</label>
            <DateField id="report-from" value={fromDate} onChange={onFromDate} />
          </div>
          <div className="field">
            <label htmlFor="report-to">إلى تاريخ</label>
            <DateField id="report-to" value={toDate} onChange={onToDate} />
          </div>
        </div>
      </section>

      <div className="report-tabs report-section-tabs" role="tablist" aria-label="تفاصيل تقرير العملاء">
        {CUSTOMER_SECTIONS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            id={`customer-tab-${item.id}`}
            aria-selected={section === item.id}
            aria-controls={`customer-panel-${item.id}`}
            className={section === item.id ? 'btn btn-primary' : 'btn btn-ghost'}
            onClick={() => setSection(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`customer-panel-${section}`} aria-labelledby={`customer-tab-${section}`}>
        {invalidRange && section !== 'cities' && section !== 'nationalities' ? (
          <div className="alert alert-error">تاريخ البداية بعد تاريخ النهاية.</div>
        ) : (
          <>
            {section === 'summary' && (
              <section className="card" aria-label="ملخص العملاء">
                <h2 className="card-title">العملاء</h2>
                <div className="report-status-board">
                  {customerRings.map(({ key, ...item }) => (
                    <CountRing key={key} {...item} caption="عميل" />
                  ))}
                </div>
              </section>
            )}

            {section === 'status' && (
              <section className="card" aria-label="حالات المعاملات">
                <h2 className="card-title">حالات المعاملات</h2>
                <p className="report-note">عدد المعاملات فقط، ضمن الفترة المحددة.</p>
                <div className="report-status-board">
                  {TX_STATUSES.map((status) => {
                    const meta = STATUS_CIRCLE[status]
                    const value = byStatus[status]
                    const share = statusTotal === 0 ? 0 : (value / statusTotal) * 100
                    return (
                      <div key={status} className={`status-ring is-plain ${meta.tone}`}>
                        <span
                          className="status-circle"
                          style={{
                            background:
                              share === 0
                                ? meta.track
                                : `conic-gradient(${meta.color} 0% ${share}%, ${meta.track} ${share}% 100%)`,
                          }}
                        >
                          <span className="status-circle-hole">
                            <span className="status-circle-value num" dir="ltr">
                              {count(value)}
                            </span>
                            <span className="status-circle-caption">معاملة</span>
                          </span>
                        </span>
                        <span className="status-ring-label">{transactionStatus(status).label}</span>
                      </div>
                    )
                  })}
                </div>
              </section>
            )}

            {section === 'services' && (
              <GroupTable
                title="استخدام الخدمات"
                note="عدد المعاملات حسب اسم الخدمة المسجّل على المعاملة، ضمن الفترة."
                rows={byService}
                empty="لا توجد معاملات في هذه الفترة."
              />
            )}

            {section === 'cities' && (
              <GroupTable title="العملاء حسب المدينة" note="كل العملاء." rows={byCity} empty="لا يوجد عملاء." />
            )}

            {section === 'nationalities' && (
              <GroupTable title="العملاء حسب الجنسية" note="كل العملاء." rows={byNationality} empty="لا يوجد عملاء." />
            )}
          </>
        )}
      </div>
    </>
  )
}

function buildCustomerReport(
  customers: CustomerRow[],
  transactions: TransactionRow[],
  fromDate: string,
  toDate: string,
) {
  const invalidRange = Boolean(fromDate && toDate && fromDate > toDate)
  const rangeLimited = Boolean(fromDate || toDate)
  const rangedTransactions = invalidRange
    ? []
    : transactions.filter((row) => inDayRange(riyadhDay(row.created_at), fromDate, toDate))
  const activeCustomerIds = new Set(rangedTransactions.map((row) => row.customer_id))
  let createdInRange = 0
  let withTransactions = 0
  for (const row of customers) {
    if (inDayRange(riyadhDay(row.created_at), fromDate, toDate)) createdInRange += 1
    if (activeCustomerIds.has(row.id)) withTransactions += 1
  }
  const byStatus: Record<TxStatus, number> = { pending: 0, in_progress: 0, completed: 0, cancelled: 0 }
  for (const row of rangedTransactions) {
    if (row.status === 'pending' || row.status === 'in_progress' || row.status === 'completed' || row.status === 'cancelled') {
      byStatus[row.status] += 1
    }
  }
  return {
    invalidRange,
    rangeLimited,
    summary: {
      total: customers.length,
      createdInRange,
      withTransactions,
      withoutTransactions: customers.length - withTransactions,
    },
    byCity: groupCounts(customers.map((row) => row.city?.trim() || NO_CITY)),
    byNationality: groupCounts(customers.map((row) => row.nationality?.trim() || NO_NATIONALITY)),
    byService: groupCounts(rangedTransactions.map((row) => row.service_name.trim() || NO_SERVICE)),
    byStatus,
  }
}

function countRows(
  section: string,
  rows: { label: string; value: number }[],
  empty: string,
  note = '',
): CsvValue[][] {
  if (rows.length === 0) return [[section, '', empty, note]]
  return rows.map((row) => [section, row.label, row.value, note])
}

function groupCounts(labels: string[]): { label: string; value: number }[] {
  const counts = new Map<string, number>()
  for (const label of labels) counts.set(label, (counts.get(label) ?? 0) + 1)
  return [...counts.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label, 'ar'))
}

function CountRing({
  label,
  caption,
  value,
  share,
  color,
  ink,
  track,
}: {
  label: string
  caption: string
  value: number
  share: number
  color: string
  ink: string
  track: string
}) {
  return (
    <div className="status-ring is-plain">
      <span
        className="status-circle"
        style={{
          background:
            share === 0 ? track : `conic-gradient(${color} 0% ${share}%, ${track} ${share}% 100%)`,
        }}
      >
        <span className="status-circle-hole">
          <span className="status-circle-value num" dir="ltr" style={{ color: ink }}>
            {count(value)}
          </span>
          <span className="status-circle-caption">{caption}</span>
        </span>
      </span>
      <span className="status-ring-label" style={{ color: ink }}>
        {label}
      </span>
    </div>
  )
}

function GroupTable({
  title,
  rows,
  empty,
  note,
}: {
  title: string
  rows: { label: string; value: number }[]
  empty: string
  note?: string
}) {
  return (
    <section className="card" aria-label={title}>
      <h2 className="card-title">{title}</h2>
      {note ? <p className="report-note">{note}</p> : null}
      {rows.length === 0 ? (
        <p className="empty">{empty}</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>البند</th>
                <th>العدد</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={`${row.label}-${index}`}>
                  <td>{row.label}</td>
                  <td className="num">{count(row.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
