import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useCompany } from '../auth/CompanyProvider'
import { supabase } from '../lib/supabase'
import { count, errorMessage } from '../lib/format'
import { documentTypeText } from '../lib/documents'
import { expiryKind, formatEmployeeDate } from '../lib/employees'
import { dueBucket, type TaskStatus } from '../lib/tasks'

interface EmployeeRow {
  id: string
  full_name: string
  employment_status: string
  iqama_expiry_date: string | null
  passport_expiry_date: string | null
}

interface DocumentRow {
  id: string
  employee_id: string
  document_type: string
  expiry_date: string | null
}

interface TaskRow {
  id: string
  title: string
  status: string
  priority: string
  due_date: string | null
}

interface DatedItem {
  id: string
  href: string
  title: string
  detail: string
}

export default function CompanyActionCenter({ reloadToken = 0 }: { reloadToken?: number }) {
  const { company, loading: companyLoading, error: companyError, ambiguous } = useCompany()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [activeEmployees, setActiveEmployees] = useState(0)
  const [expiredIqama, setExpiredIqama] = useState<DatedItem[]>([])
  const [soonIqama, setSoonIqama] = useState<DatedItem[]>([])
  const [expiredPassport, setExpiredPassport] = useState<DatedItem[]>([])
  const [soonPassport, setSoonPassport] = useState<DatedItem[]>([])
  const [expiredDocuments, setExpiredDocuments] = useState<DatedItem[]>([])
  const [soonDocuments, setSoonDocuments] = useState<DatedItem[]>([])
  const [overdueTasks, setOverdueTasks] = useState<DatedItem[]>([])
  const [todayTasks, setTodayTasks] = useState<DatedItem[]>([])
  const [urgentTasks, setUrgentTasks] = useState<DatedItem[]>([])

  const load = useCallback(async () => {
    if (!company) {
      setLoading(false)
      return
    }
    setLoading(true)
    setError('')
    const [employeesRes, documentsRes, tasksRes] = await Promise.all([
      supabase.from('employees').select('id, full_name, employment_status, iqama_expiry_date, passport_expiry_date'),
      supabase.from('employee_documents').select('id, employee_id, document_type, expiry_date'),
      supabase.from('tasks').select('id, title, status, priority, due_date'),
    ])
    const failure = employeesRes.error || documentsRes.error || tasksRes.error
    if (failure) {
      setError(errorMessage(failure))
      setLoading(false)
      return
    }

    const employees = (employeesRes.data ?? []) as EmployeeRow[]
    const names = new Map(employees.map((row) => [row.id, row.full_name]))
    const iqamaExpired: DatedItem[] = []
    const iqamaSoon: DatedItem[] = []
    const passportExpired: DatedItem[] = []
    const passportSoon: DatedItem[] = []
    let active = 0
    for (const row of employees) {
      if (row.employment_status === 'active') active += 1
      const href = `/employees/${row.id}`
      pushExpiry(iqamaExpired, iqamaSoon, row.iqama_expiry_date, {
        id: `iqama-${row.id}`,
        href,
        title: row.full_name,
        detail: formatEmployeeDate(row.iqama_expiry_date),
      })
      pushExpiry(passportExpired, passportSoon, row.passport_expiry_date, {
        id: `passport-${row.id}`,
        href,
        title: row.full_name,
        detail: formatEmployeeDate(row.passport_expiry_date),
      })
    }

    const docsExpired: DatedItem[] = []
    const docsSoon: DatedItem[] = []
    for (const row of (documentsRes.data ?? []) as DocumentRow[]) {
      pushExpiry(docsExpired, docsSoon, row.expiry_date, {
        id: row.id,
        href: `/employees/${row.employee_id}`,
        title: `${names.get(row.employee_id) || 'موظف'} — ${documentTypeText(row.document_type)}`,
        detail: formatEmployeeDate(row.expiry_date),
      })
    }

    const overdue: DatedItem[] = []
    const today: DatedItem[] = []
    const urgent: DatedItem[] = []
    for (const row of (tasksRes.data ?? []) as TaskRow[]) {
      const item = {
        id: row.id,
        href: `/tasks?task=${row.id}`,
        title: row.title,
        detail: formatEmployeeDate(row.due_date),
      }
      const bucket = dueBucket({ status: row.status as TaskStatus, due_date: row.due_date })
      if (bucket === 'overdue') overdue.push(item)
      if (bucket === 'today') today.push(item)
      if (row.priority === 'urgent' && (row.status === 'open' || row.status === 'in_progress')) urgent.push(item)
    }

    setActiveEmployees(active)
    setExpiredIqama(iqamaExpired)
    setSoonIqama(iqamaSoon)
    setExpiredPassport(passportExpired)
    setSoonPassport(passportSoon)
    setExpiredDocuments(docsExpired)
    setSoonDocuments(docsSoon)
    setOverdueTasks(overdue)
    setTodayTasks(today)
    setUrgentTasks(urgent)
    setLoading(false)
  }, [company])

  useEffect(() => {
    if (companyLoading) return
    void load()
  }, [companyLoading, load, reloadToken])

  const alertCount =
    expiredIqama.length +
    soonIqama.length +
    expiredPassport.length +
    soonPassport.length +
    expiredDocuments.length +
    soonDocuments.length +
    overdueTasks.length +
    todayTasks.length +
    urgentTasks.length

  return (
    <section className="action-center" aria-label="مركز الإجراءات">
      <div className="page-head">
        <div>
          <h2>مركز الإجراءات</h2>
          <p className="page-sub">{company ? company.name : 'متابعة الشركة الحالية'}</p>
        </div>
      </div>

      {companyError && <div className="alert alert-error">{companyError}</div>}
      {error && <div className="alert alert-error">{error}</div>}

      {companyLoading || loading ? (
        <div className="empty">جارٍ التحميل…</div>
      ) : !company ? (
        <div className="empty">
          {ambiguous ? 'يوجد أكثر من شركة لهذا الحساب ولم تُحدَّد الشركة النشطة.' : 'لا توجد شركة نشطة لهذا الحساب.'}
        </div>
      ) : (
        <>
          <div className="action-grid">
            <CountCard href="/employees" label="الموظفون النشطون" value={activeEmployees} />
            <CountCard href="/employees" label="إقامات منتهية" value={expiredIqama.length} warn={expiredIqama.length > 0} />
            <CountCard href="/employees" label="إقامات خلال 30 يوماً" value={soonIqama.length} warn={soonIqama.length > 0} />
            <CountCard href="/employees" label="جوازات منتهية" value={expiredPassport.length} warn={expiredPassport.length > 0} />
            <CountCard href="/employees" label="جوازات خلال 30 يوماً" value={soonPassport.length} warn={soonPassport.length > 0} />
            <CountCard href="/employees" label="مستندات منتهية" value={expiredDocuments.length} warn={expiredDocuments.length > 0} />
            <CountCard href="/employees" label="مستندات خلال 30 يوماً" value={soonDocuments.length} warn={soonDocuments.length > 0} />
            <CountCard href="/tasks" label="مهام متأخرة" value={overdueTasks.length} warn={overdueTasks.length > 0} />
            <CountCard href="/tasks" label="مهام تستحق اليوم" value={todayTasks.length} warn={todayTasks.length > 0} />
            <CountCard href="/tasks" label="مهام عاجلة" value={urgentTasks.length} warn={urgentTasks.length > 0} />
          </div>

          {alertCount === 0 ? (
            <div className="empty">لا توجد تنبيهات حالياً</div>
          ) : (
            <div className="action-groups">
              <AlertGroup title="إقامات منتهية" items={expiredIqama} />
              <AlertGroup title="إقامات خلال 30 يوماً" items={soonIqama} />
              <AlertGroup title="جوازات منتهية" items={expiredPassport} />
              <AlertGroup title="جوازات خلال 30 يوماً" items={soonPassport} />
              <AlertGroup title="مستندات منتهية" items={expiredDocuments} />
              <AlertGroup title="مستندات خلال 30 يوماً" items={soonDocuments} />
              <AlertGroup title="مهام متأخرة" items={overdueTasks} />
              <AlertGroup title="مهام تستحق اليوم" items={todayTasks} />
              <AlertGroup title="مهام عاجلة" items={urgentTasks} />
            </div>
          )}
        </>
      )}
    </section>
  )
}

function pushExpiry(expired: DatedItem[], soon: DatedItem[], value: string | null, item: DatedItem) {
  const kind = expiryKind(value)
  if (kind === 'expired') expired.push(item)
  else if (kind === 'soon') soon.push(item)
}

function CountCard({ href, label, value, warn = false }: { href: string; label: string; value: number; warn?: boolean }) {
  return (
    <Link className={warn ? 'action-stat warn' : 'action-stat'} to={href}>
      <span className="stat-label">{label}</span>
      <span className="stat-value num" dir="ltr">
        {count(value)}
      </span>
    </Link>
  )
}

function AlertGroup({ title, items }: { title: string; items: DatedItem[] }) {
  if (items.length === 0) return null
  return (
    <section className="card action-group">
      <h3 className="card-title">{title}</h3>
      <ul className="action-list">
        {items.map((item) => (
          <li key={item.id}>
            <Link to={item.href}>
              <span>{item.title}</span>
              <span className="num" dir="ltr">
                {item.detail}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
