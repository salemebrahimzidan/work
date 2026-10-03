import { useCallback, useEffect, useMemo, useState } from 'react'
import { useCompany } from '../auth/CompanyProvider'
import SelectField from '../components/SelectField'
import { supabase } from '../lib/supabase'
import { downloadCsv, type CsvValue } from '../lib/csv'
import { count, transactionStatus } from '../lib/format'
import type { EmploymentStatus } from '../lib/types'
import {
  EMPLOYMENT_STATUSES,
  employmentStatusLabel,
  expiryKind,
} from '../lib/employees'
import {
  dueBucket,
  TASK_PRIORITIES,
  TASK_STATUSES,
  taskPriorityLabel,
  taskStatusLabel,
  type TaskPriority,
  type TaskStatus,
} from '../lib/tasks'

const EMPLOYEE_COLUMNS = 'id, branch_id, nationality, employment_status, iqama_expiry_date, passport_expiry_date'
const DOCUMENT_COLUMNS = 'employee_id, expiry_date'
const TASK_COLUMNS = 'branch_id, status, priority, due_date'
const BRANCH_COLUMNS = 'id, name'
const CUSTOMER_COLUMNS = 'id, city, nationality, created_at'
const TRANSACTION_COLUMNS = 'customer_id, service_name, status, created_at'
const LOAD_ERROR = 'تعذر تحميل التقارير'
const CUSTOMER_LOAD_ERROR = 'تعذر تحميل تقرير العملاء'
const NO_BRANCH = 'بدون فرع'
const NO_NATIONALITY = 'بدون جنسية'
const NO_CITY = 'بدون مدينة'
const NO_SERVICE = 'بدون خدمة'
const RIYADH_TZ = 'Asia/Riyadh'
const TX_STATUSES = ['pending', 'in_progress', 'completed', 'cancelled'] as const

type ReportArea = 'operations' | 'customers'
type TxStatus = (typeof TX_STATUSES)[number]

interface BranchRow {
  id: string
  name: string
}

interface EmployeeRow {
  id: string
  branch_id: string | null
  nationality: string | null
  employment_status: EmploymentStatus
  iqama_expiry_date: string | null
  passport_expiry_date: string | null
}

interface DocumentRow {
  employee_id: string
  expiry_date: string | null
}

interface TaskRow {
  branch_id: string | null
  status: TaskStatus
  priority: TaskPriority
  due_date: string | null
}

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

function asStatus(value: string): EmploymentStatus {
  if (value === 'inactive' || value === 'vacation' || value === 'terminated') return value
  return 'active'
}

function asTaskStatus(value: string): TaskStatus {
  if (value === 'in_progress' || value === 'completed' || value === 'cancelled') return value
  return 'open'
}

function asPriority(value: string): TaskPriority {
  if (value === 'low' || value === 'high' || value === 'urgent') return value
  return 'normal'
}

export default function Reports() {
  const { company, role, loading: companyLoading, error: companyError, ambiguous, canViewReports } = useCompany()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [branches, setBranches] = useState<BranchRow[]>([])
  const [employees, setEmployees] = useState<EmployeeRow[]>([])
  const [documents, setDocuments] = useState<DocumentRow[]>([])
  const [tasks, setTasks] = useState<TaskRow[]>([])
  const [branchFilter, setBranchFilter] = useState('')
  const [employmentFilter, setEmploymentFilter] = useState('')
  const [taskStatusFilter, setTaskStatusFilter] = useState('')
  const [taskPriorityFilter, setTaskPriorityFilter] = useState('')
  const [area, setArea] = useState<ReportArea>('operations')
  const [customerLoading, setCustomerLoading] = useState(true)
  const [customerError, setCustomerError] = useState('')
  const [customers, setCustomers] = useState<CustomerRow[]>([])
  const [transactions, setTransactions] = useState<TransactionRow[]>([])
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [exportError, setExportError] = useState('')

  const load = useCallback(async () => {
    if (!company || !canViewReports) {
      setLoading(false)
      return
    }
    setLoading(true)
    setError('')
    const [branchRes, employeeRes, documentRes, taskRes] = await Promise.all([
      supabase.from('branches').select(BRANCH_COLUMNS).order('name'),
      supabase.from('employees').select(EMPLOYEE_COLUMNS),
      supabase.from('employee_documents').select(DOCUMENT_COLUMNS),
      supabase.from('tasks').select(TASK_COLUMNS),
    ])
    const failure = branchRes.error || employeeRes.error || documentRes.error || taskRes.error
    if (failure) {
      setError(LOAD_ERROR)
      setLoading(false)
      return
    }
    setBranches((branchRes.data ?? []).map((row) => ({ id: String(row.id), name: String(row.name ?? '') })))
    setEmployees(
      (employeeRes.data ?? []).map((row) => ({
        id: String(row.id),
        branch_id: (row.branch_id as string | null) ?? null,
        nationality: (row.nationality as string | null) ?? null,
        employment_status: asStatus(String(row.employment_status ?? 'active')),
        iqama_expiry_date: (row.iqama_expiry_date as string | null) ?? null,
        passport_expiry_date: (row.passport_expiry_date as string | null) ?? null,
      })),
    )
    setDocuments(
      (documentRes.data ?? []).map((row) => ({
        employee_id: String(row.employee_id),
        expiry_date: (row.expiry_date as string | null) ?? null,
      })),
    )
    setTasks(
      (taskRes.data ?? []).map((row) => ({
        branch_id: (row.branch_id as string | null) ?? null,
        status: asTaskStatus(String(row.status ?? 'open')),
        priority: asPriority(String(row.priority ?? 'normal')),
        due_date: (row.due_date as string | null) ?? null,
      })),
    )
    setLoading(false)
  }, [canViewReports, company])

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
    void load()
  }, [companyLoading, load])

  useEffect(() => {
    if (companyLoading) return
    void loadCustomers()
  }, [companyLoading, loadCustomers])

  const visibleEmployees = useMemo(
    () =>
      employees.filter((row) => {
        if (branchFilter === 'none' && row.branch_id) return false
        if (branchFilter && branchFilter !== 'none' && row.branch_id !== branchFilter) return false
        if (employmentFilter && row.employment_status !== employmentFilter) return false
        return true
      }),
    [branchFilter, employees, employmentFilter],
  )

  const visibleEmployeeIds = useMemo(() => new Set(visibleEmployees.map((row) => row.id)), [visibleEmployees])

  const visibleTasks = useMemo(
    () =>
      tasks.filter((row) => {
        if (branchFilter === 'none' && row.branch_id) return false
        if (branchFilter && branchFilter !== 'none' && row.branch_id !== branchFilter) return false
        if (taskStatusFilter && row.status !== taskStatusFilter) return false
        if (taskPriorityFilter && row.priority !== taskPriorityFilter) return false
        return true
      }),
    [branchFilter, taskPriorityFilter, taskStatusFilter, tasks],
  )

  const employeeCounts = useMemo(() => {
    const counts: Record<EmploymentStatus, number> = { active: 0, inactive: 0, vacation: 0, terminated: 0 }
    for (const row of visibleEmployees) counts[row.employment_status] += 1
    return counts
  }, [visibleEmployees])

  const employeesByBranch = useMemo(() => {
    const counts = new Map<string, number>()
    for (const branch of branches) counts.set(branch.id, 0)
    let unassigned = 0
    for (const row of visibleEmployees) {
      if (!row.branch_id || !counts.has(row.branch_id)) unassigned += 1
      else counts.set(row.branch_id, (counts.get(row.branch_id) ?? 0) + 1)
    }
    const rows = branches
      .filter((branch) => !branchFilter || branchFilter === branch.id)
      .map((branch) => ({ label: branch.name || '—', value: counts.get(branch.id) ?? 0 }))
    if (!branchFilter || branchFilter === 'none') rows.push({ label: NO_BRANCH, value: unassigned })
    return rows
  }, [branchFilter, branches, visibleEmployees])

  const employeesByNationality = useMemo(() => {
    const counts = new Map<string, number>()
    for (const row of visibleEmployees) {
      const label = row.nationality?.trim() || NO_NATIONALITY
      counts.set(label, (counts.get(label) ?? 0) + 1)
    }
    return [...counts.entries()]
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label, 'ar'))
  }, [visibleEmployees])

  const expiry = useMemo(() => {
    let iqamaExpired = 0
    let iqamaSoon = 0
    let passportExpired = 0
    let passportSoon = 0
    for (const row of visibleEmployees) {
      const iqama = expiryKind(row.iqama_expiry_date)
      const passport = expiryKind(row.passport_expiry_date)
      if (iqama === 'expired') iqamaExpired += 1
      if (iqama === 'soon') iqamaSoon += 1
      if (passport === 'expired') passportExpired += 1
      if (passport === 'soon') passportSoon += 1
    }
    let documentsExpired = 0
    let documentsSoon = 0
    for (const row of documents) {
      if (!visibleEmployeeIds.has(row.employee_id)) continue
      const kind = expiryKind(row.expiry_date)
      if (kind === 'expired') documentsExpired += 1
      if (kind === 'soon') documentsSoon += 1
    }
    return { iqamaExpired, iqamaSoon, passportExpired, passportSoon, documentsExpired, documentsSoon }
  }, [documents, visibleEmployeeIds, visibleEmployees])

  const taskSummary = useMemo(() => {
    const counts: Record<TaskStatus, number> = { open: 0, in_progress: 0, completed: 0, cancelled: 0 }
    let overdue = 0
    let dueToday = 0
    let urgent = 0
    for (const row of visibleTasks) {
      counts[row.status] += 1
      const bucket = dueBucket(row)
      if (bucket === 'overdue') overdue += 1
      if (bucket === 'today') dueToday += 1
      if (row.priority === 'urgent' && (row.status === 'open' || row.status === 'in_progress')) urgent += 1
    }
    return { counts, overdue, dueToday, urgent }
  }, [visibleTasks])

  const tasksByBranch = useMemo(() => {
    const counts = new Map<string, number>()
    for (const branch of branches) counts.set(branch.id, 0)
    let unassigned = 0
    for (const row of visibleTasks) {
      if (!row.branch_id || !counts.has(row.branch_id)) unassigned += 1
      else counts.set(row.branch_id, (counts.get(row.branch_id) ?? 0) + 1)
    }
    const rows = branches
      .filter((branch) => !branchFilter || branchFilter === branch.id)
      .map((branch) => ({ label: branch.name || '—', value: counts.get(branch.id) ?? 0 }))
    if (!branchFilter || branchFilter === 'none') rows.push({ label: NO_BRANCH, value: unassigned })
    return rows
  }, [branchFilter, branches, visibleTasks])

  const exportDisabled =
    companyLoading ||
    !company ||
    !canViewReports ||
    (area === 'operations' ? loading || Boolean(error) : customerLoading || Boolean(customerError))

  function exportActiveReport() {
    setExportError('')
    try {
      const day = riyadhDay(new Date().toISOString()) || 'report'
      if (area === 'operations') {
        downloadCsv(`reports-operations-${day}.csv`, operationalCsvRows())
      } else {
        downloadCsv(`reports-customers-${day}.csv`, customerCsvRows())
      }
    } catch {
      setExportError('تعذر إنشاء ملف التصدير')
    }
  }

  function operationalCsvRows(): CsvValue[][] {
    const branchLabel = !branchFilter
      ? 'كل الفروع'
      : branchFilter === 'none'
        ? NO_BRANCH
        : (branches.find((branch) => branch.id === branchFilter)?.name ?? '—')
    const employmentLabel = employmentFilter
      ? employmentStatusLabel[employmentFilter as EmploymentStatus]
      : 'كل الحالات'
    const taskStatus = taskStatusFilter ? taskStatusLabel[taskStatusFilter as TaskStatus] : 'كل الحالات'
    const taskPriority = taskPriorityFilter ? taskPriorityLabel[taskPriorityFilter as TaskPriority] : 'كل الأولويات'
    return [
      ['القسم', 'البند', 'القيمة', 'التوضيح'],
      ['التصفية', 'الفرع', branchLabel, 'تُطبّق على الموظفين والمهام'],
      ['التصفية', 'حالة التوظيف', employmentLabel, 'تُطبّق على الموظفين والانتهاء'],
      ['التصفية', 'حالة المهمة', taskStatus, 'تُطبّق على المهام'],
      ['التصفية', 'أولوية المهمة', taskPriority, 'تُطبّق على المهام'],
      ['الموظفون', 'إجمالي الموظفين', visibleEmployees.length, 'بعد التصفية'],
      ['الموظفون', 'نشط', employeeCounts.active, ''],
      ['الموظفون', 'غير نشط', employeeCounts.inactive, ''],
      ['الموظفون', 'إجازة', employeeCounts.vacation, ''],
      ['الموظفون', 'منتهية الخدمة', employeeCounts.terminated, ''],
      ...countRows('الموظفون حسب الفرع', employeesByBranch, 'لا يوجد موظفون مطابقون.'),
      ...countRows('الموظفون حسب الجنسية', employeesByNationality, 'لا يوجد موظفون مطابقون.'),
      ['الانتهاء', 'إقامات منتهية', expiry.iqamaExpired, 'بعد تصفية الموظفين'],
      ['الانتهاء', 'إقامات خلال 30 يوماً', expiry.iqamaSoon, ''],
      ['الانتهاء', 'جوازات منتهية', expiry.passportExpired, ''],
      ['الانتهاء', 'جوازات خلال 30 يوماً', expiry.passportSoon, ''],
      ['الانتهاء', 'مستندات منتهية', expiry.documentsExpired, ''],
      ['الانتهاء', 'مستندات خلال 30 يوماً', expiry.documentsSoon, ''],
      ['المهام', 'مفتوحة', taskSummary.counts.open, 'بعد التصفية'],
      ['المهام', 'قيد التنفيذ', taskSummary.counts.in_progress, ''],
      ['المهام', 'مكتملة', taskSummary.counts.completed, ''],
      ['المهام', 'ملغاة', taskSummary.counts.cancelled, ''],
      ['المهام', 'متأخرة', taskSummary.overdue, 'لا تشمل المكتملة والملغاة'],
      ['المهام', 'تستحق اليوم', taskSummary.dueToday, 'لا تشمل المكتملة والملغاة'],
      ['المهام', 'عاجلة', taskSummary.urgent, 'أولوية عاجلة وحالة مفتوحة أو قيد التنفيذ'],
      ...countRows('المهام حسب الفرع', tasksByBranch, 'لا توجد مهام مطابقة.'),
    ]
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
          <p className="page-sub">
            {area === 'operations' ? 'التشغيل' : 'العملاء'}
            {company ? ` — ${company.name}` : ''}
          </p>
        </div>
        <button type="button" className="btn" onClick={exportActiveReport} disabled={exportDisabled}>
          تصدير CSV
        </button>
      </div>

      {(companyError || error) && <div className="alert alert-error">{companyError || error}</div>}
      {exportError && <div className="alert alert-error">{exportError}</div>}

      {companyLoading ? (
        <div className="empty">جارٍ التحميل…</div>
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
              aria-selected={area === 'operations'}
              className={area === 'operations' ? 'btn btn-primary' : 'btn btn-ghost'}
              onClick={() => {
                setExportError('')
                setArea('operations')
              }}
            >
              التشغيل
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={area === 'customers'}
              className={area === 'customers' ? 'btn btn-primary' : 'btn btn-ghost'}
              onClick={() => {
                setExportError('')
                setArea('customers')
              }}
            >
              العملاء
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
          ) : loading ? (
            <div className="empty">جارٍ التحميل…</div>
          ) : (
        <>
          <section className="card" aria-label="تصفية التشغيل">
            <div className="filters">
              <div className="field">
                <label htmlFor="report-branch">الفرع</label>
                <SelectField
                  id="report-branch"
                  value={branchFilter}
                  onChange={setBranchFilter}
                  options={[
                    { value: '', label: 'كل الفروع' },
                    { value: 'none', label: NO_BRANCH },
                    ...branches.map((branch) => ({ value: branch.id, label: branch.name })),
                  ]}
                />
              </div>
              <div className="field">
                <label htmlFor="report-employment">حالة التوظيف</label>
                <SelectField
                  id="report-employment"
                  value={employmentFilter}
                  onChange={setEmploymentFilter}
                  options={[
                    { value: '', label: 'كل الحالات' },
                    ...EMPLOYMENT_STATUSES.map((status) => ({ value: status, label: employmentStatusLabel[status] })),
                  ]}
                />
              </div>
              <div className="field">
                <label htmlFor="report-task-status">حالة المهمة</label>
                <SelectField
                  id="report-task-status"
                  value={taskStatusFilter}
                  onChange={setTaskStatusFilter}
                  options={[
                    { value: '', label: 'كل الحالات' },
                    ...TASK_STATUSES.map((status) => ({ value: status, label: taskStatusLabel[status] })),
                  ]}
                />
              </div>
              <div className="field">
                <label htmlFor="report-task-priority">أولوية المهمة</label>
                <SelectField
                  id="report-task-priority"
                  value={taskPriorityFilter}
                  onChange={setTaskPriorityFilter}
                  options={[
                    { value: '', label: 'كل الأولويات' },
                    ...TASK_PRIORITIES.map((priority) => ({ value: priority, label: taskPriorityLabel[priority] })),
                  ]}
                />
              </div>
            </div>
          </section>

          <section className="card" aria-label="ملخص الموظفين">
            <h2 className="card-title">الموظفون</h2>
            <div className="action-grid">
              <Stat label="إجمالي الموظفين" value={visibleEmployees.length} />
              <Stat label="نشط" value={employeeCounts.active} />
              <Stat label="غير نشط" value={employeeCounts.inactive} />
              <Stat label="إجازة" value={employeeCounts.vacation} />
              <Stat label="منتهية الخدمة" value={employeeCounts.terminated} />
            </div>
          </section>

          <GroupTable title="الموظفون حسب الفرع" rows={employeesByBranch} empty="لا يوجد موظفون مطابقون." />
          <GroupTable title="الموظفون حسب الجنسية" rows={employeesByNationality} empty="لا يوجد موظفون مطابقون." />

          <section className="card" aria-label="ملخص الانتهاء">
            <h2 className="card-title">الانتهاء خلال 30 يوماً أو المنتهي</h2>
            <div className="action-grid">
              <Stat label="إقامات منتهية" value={expiry.iqamaExpired} warn={expiry.iqamaExpired > 0} />
              <Stat label="إقامات خلال 30 يوماً" value={expiry.iqamaSoon} warn={expiry.iqamaSoon > 0} />
              <Stat label="جوازات منتهية" value={expiry.passportExpired} warn={expiry.passportExpired > 0} />
              <Stat label="جوازات خلال 30 يوماً" value={expiry.passportSoon} warn={expiry.passportSoon > 0} />
              <Stat label="مستندات منتهية" value={expiry.documentsExpired} warn={expiry.documentsExpired > 0} />
              <Stat label="مستندات خلال 30 يوماً" value={expiry.documentsSoon} warn={expiry.documentsSoon > 0} />
            </div>
          </section>

          <section className="card" aria-label="ملخص المهام">
            <h2 className="card-title">المهام</h2>
            <div className="action-grid">
              <Stat label="مفتوحة" value={taskSummary.counts.open} />
              <Stat label="قيد التنفيذ" value={taskSummary.counts.in_progress} />
              <Stat label="مكتملة" value={taskSummary.counts.completed} />
              <Stat label="ملغاة" value={taskSummary.counts.cancelled} />
              <Stat label="متأخرة" value={taskSummary.overdue} warn={taskSummary.overdue > 0} />
              <Stat label="تستحق اليوم" value={taskSummary.dueToday} warn={taskSummary.dueToday > 0} />
              <Stat label="عاجلة" value={taskSummary.urgent} warn={taskSummary.urgent > 0} />
            </div>
          </section>

          <GroupTable title="المهام حسب الفرع" rows={tasksByBranch} empty="لا توجد مهام مطابقة." />
        </>
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
  const report = useMemo(
    () => buildCustomerReport(customers, transactions, fromDate, toDate),
    [customers, fromDate, toDate, transactions],
  )
  const { invalidRange, rangeLimited, summary, byCity, byNationality, byService, byStatus } = report

  if (loading) return <div className="empty">جارٍ التحميل…</div>
  if (error) return <div className="alert alert-error">{error}</div>

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
            <input id="report-from" type="date" value={fromDate} onChange={(event) => onFromDate(event.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="report-to">إلى تاريخ</label>
            <input id="report-to" type="date" value={toDate} onChange={(event) => onToDate(event.target.value)} />
          </div>
        </div>
      </section>

      {invalidRange ? (
        <div className="alert alert-error">تاريخ البداية بعد تاريخ النهاية.</div>
      ) : (
        <>
          <section className="card" aria-label="ملخص العملاء">
            <h2 className="card-title">العملاء</h2>
            <div className="action-grid">
              <Stat label="إجمالي العملاء" value={summary.total} />
              <Stat label={rangeLimited ? 'عملاء جدد في الفترة' : 'عملاء جدد (كل الفترات)'} value={summary.createdInRange} />
              <Stat
                label={rangeLimited ? 'عملاء لديهم معاملات في الفترة' : 'عملاء لديهم معاملات'}
                value={summary.withTransactions}
              />
              <Stat
                label={rangeLimited ? 'عملاء بدون معاملات في الفترة' : 'عملاء بدون معاملات'}
                value={summary.withoutTransactions}
              />
            </div>
          </section>

          <section className="card" aria-label="حالات المعاملات">
            <h2 className="card-title">حالات المعاملات</h2>
            <p className="report-note">عدد المعاملات فقط، ضمن الفترة المحددة.</p>
            <div className="action-grid">
              {TX_STATUSES.map((status) => (
                <Stat key={status} label={transactionStatus(status).label} value={byStatus[status]} />
              ))}
            </div>
          </section>

          <GroupTable
            title="استخدام الخدمات"
            note="عدد المعاملات حسب اسم الخدمة المسجّل على المعاملة، ضمن الفترة."
            rows={byService}
            empty="لا توجد معاملات في هذه الفترة."
          />
        </>
      )}

      <GroupTable title="العملاء حسب المدينة" note="كل العملاء." rows={byCity} empty="لا يوجد عملاء." />
      <GroupTable title="العملاء حسب الجنسية" note="كل العملاء." rows={byNationality} empty="لا يوجد عملاء." />
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

function Stat({ label, value, warn = false }: { label: string; value: number; warn?: boolean }) {
  return (
    <div className={warn ? 'action-stat warn' : 'action-stat'}>
      <span className="muted">{label}</span>
      <strong className="stat-value">{count(value)}</strong>
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
