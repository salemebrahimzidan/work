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
      <div className="action-head">
        <div>
          <h2>مركز الإجراءات</h2>
          <p className="page-sub">{company ? company.name : 'متابعة الشركة الحالية'}</p>
        </div>
        {!companyLoading && !loading && company && (
          <span className={alertCount > 0 ? 'action-badge is-live' : 'action-badge'}>
            {alertCount === 0 ? 'لا توجد تنبيهات' : alertCount === 1 ? 'تنبيه واحد' : `${count(alertCount)} تنبيهات`}
          </span>
        )}
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
          <div className="action-panels">
            <article className="action-panel">
              <div className="action-panel-head">
                <h3>الموظفون</h3>
                <Link to="/employees">
                  النشطون <strong className="num" dir="ltr">{count(activeEmployees)}</strong>
                </Link>
              </div>
              <div className="action-matrix" role="table" aria-label="تنبيهات الموظفين">
                <div className="action-matrix-head" role="row">
                  <span role="columnheader" />
                  <span role="columnheader">منتهية</span>
                  <span role="columnheader">خلال 30 يوماً</span>
                </div>
                <MatrixRow label="الإقامة" href="/employees" expired={expiredIqama.length} soon={soonIqama.length} />
                <MatrixRow label="الجواز" href="/employees" expired={expiredPassport.length} soon={soonPassport.length} />
                <MatrixRow label="المستندات" href="/employees" expired={expiredDocuments.length} soon={soonDocuments.length} />
              </div>
            </article>

            <article className="action-panel">
              <div className="action-panel-head">
                <h3>المهام</h3>
                <Link to="/tasks">عرض المهام</Link>
              </div>
              <div className="action-tasks">
                <TaskMetric href="/tasks" label="متأخرة" value={overdueTasks.length} tone="danger" />
                <TaskMetric href="/tasks" label="تستحق اليوم" value={todayTasks.length} tone="soon" />
                <TaskMetric href="/tasks" label="عاجلة" value={urgentTasks.length} tone="danger" />
              </div>
            </article>
          </div>

          {alertCount > 0 && (
            <div className="action-groups">
              <AlertGroup title="إقامات منتهية" items={expiredIqama} tone="danger" />
              <AlertGroup title="إقامات خلال 30 يوماً" items={soonIqama} tone="soon" />
              <AlertGroup title="جوازات منتهية" items={expiredPassport} tone="danger" />
              <AlertGroup title="جوازات خلال 30 يوماً" items={soonPassport} tone="soon" />
              <AlertGroup title="مستندات منتهية" items={expiredDocuments} tone="danger" />
              <AlertGroup title="مستندات خلال 30 يوماً" items={soonDocuments} tone="soon" />
              <AlertGroup title="مهام متأخرة" items={overdueTasks} tone="danger" />
              <AlertGroup title="مهام تستحق اليوم" items={todayTasks} tone="soon" />
              <AlertGroup title="مهام عاجلة" items={urgentTasks} tone="danger" />
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

function MatrixRow({
  label,
  href,
  expired,
  soon,
}: {
  label: string
  href: string
  expired: number
  soon: number
}) {
  return (
    <div className="action-matrix-row" role="row">
      <span role="rowheader">{label}</span>
      <CountLink href={href} value={expired} tone="danger" label={`${label} المنتهية`} />
      <CountLink href={href} value={soon} tone="soon" label={`${label} خلال 30 يوماً`} />
    </div>
  )
}

function CountLink({ href, value, tone, label }: { href: string; value: number; tone: 'danger' | 'soon'; label: string }) {
  return (
    <Link className={value > 0 ? `action-count is-${tone}` : 'action-count'} to={href} aria-label={`${label}: ${count(value)}`}>
      <span className="num" dir="ltr">
        {count(value)}
      </span>
    </Link>
  )
}

function TaskMetric({ href, label, value, tone }: { href: string; label: string; value: number; tone: 'danger' | 'soon' }) {
  return (
    <Link className={value > 0 ? `action-task is-${tone}` : 'action-task'} to={href}>
      <span>{label}</span>
      <strong className="num" dir="ltr">
        {count(value)}
      </strong>
    </Link>
  )
}

function AlertGroup({ title, items, tone }: { title: string; items: DatedItem[]; tone: 'danger' | 'soon' }) {
  if (items.length === 0) return null
  return (
    <section className={`card action-group is-${tone}`}>
      <h3 className="card-title">
        {title}
        <span className="num" dir="ltr">
          {count(items.length)}
        </span>
      </h3>
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
