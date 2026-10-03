import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthProvider'
import { useCompany } from '../auth/CompanyProvider'
import { formatDateTime } from '../lib/format'
import { formatEmployeeDate } from '../lib/employees'
import Modal from './Modal'
import { notifyEmployeeActivity } from '../lib/activity'
import {
  ASSIGNEE_STATUSES,
  TASK_PRIORITIES,
  TASK_STATUSES,
  draftToTaskWrite,
  dueBucket,
  emptyTaskDraft,
  priorityBadge,
  readTask,
  riyadhToday,
  statusBadge,
  taskError,
  taskPriorityLabel,
  taskStatusLabel,
  taskToDraft,
  type DueFilter,
  type Task,
  type TaskDraft,
  type TaskPriority,
  type TaskStatus,
} from '../lib/tasks'

const COLUMNS =
  'id, branch_id, employee_id, title, description, status, priority, due_date, assigned_to, completed_by, completed_at, created_at'

interface EmployeeOption {
  id: string
  full_name: string
  branch_id: string | null
}

interface BranchOption {
  id: string
  name: string
  is_active: boolean
}

interface MemberOption {
  userId: string
  label: string
}

export default function TaskWorkspace({
  scopeEmployeeId,
  scopeBranchId,
  embedded = false,
  initialEmployeeFilter = '',
  initialTaskId = '',
}: {
  scopeEmployeeId?: string
  scopeBranchId?: string | null
  embedded?: boolean
  initialEmployeeFilter?: string
  initialTaskId?: string
}) {
  const { session, profile } = useAuth()
  const { company, role, loading: companyLoading, error: companyError, ambiguous, canManageTasks, canDeleteTasks } =
    useCompany()
  const userId = session?.user.id ?? ''
  const [rows, setRows] = useState<Task[]>([])
  const [employees, setEmployees] = useState<EmployeeOption[]>([])
  const [branches, setBranches] = useState<BranchOption[]>([])
  const [members, setMembers] = useState<MemberOption[]>([])
  const [names, setNames] = useState<Map<string, string>>(new Map())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'' | TaskStatus>('')
  const [priorityFilter, setPriorityFilter] = useState<'' | TaskPriority>('')
  const [branchFilter, setBranchFilter] = useState('')
  const [employeeFilter, setEmployeeFilter] = useState(embedded ? '' : initialEmployeeFilter)
  const [assignedFilter, setAssignedFilter] = useState('')
  const [dueFilter, setDueFilter] = useState<DueFilter>('')
  const [draft, setDraft] = useState<TaskDraft | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<Task | null>(null)
  const [deletingBusy, setDeletingBusy] = useState(false)
  const [statusSavingId, setStatusSavingId] = useState('')
  const openedTask = useRef(false)

  const load = useCallback(async () => {
    if (!company) {
      setRows([])
      setEmployees([])
      setBranches([])
      setMembers([])
      setLoading(false)
      return
    }
    setLoading(true)
    setError('')
    let taskQuery = supabase.from('tasks').select(COLUMNS).order('created_at', { ascending: false })
    if (scopeEmployeeId) taskQuery = taskQuery.eq('employee_id', scopeEmployeeId)
    const [tasksRes, employeesRes, branchesRes, membersRes] = await Promise.all([
      taskQuery,
      supabase.from('employees').select('id, full_name, branch_id').order('full_name'),
      supabase.from('branches').select('id, name, is_active').order('name'),
      supabase.from('company_members').select('user_id, status, company_id').eq('status', 'active'),
    ])
    const queryError = tasksRes.error || employeesRes.error || branchesRes.error || membersRes.error
    if (queryError) {
      setRows([])
      setEmployees([])
      setBranches([])
      setMembers([])
      setError(taskError(queryError))
      setLoading(false)
      return
    }

    const nextTasks = (tasksRes.data ?? [])
      .map((row) => readTask(row as Record<string, unknown>))
      .filter((row): row is Task => row !== null)
    const nextEmployees = (employeesRes.data ?? []) as EmployeeOption[]
    const nextBranches = (branchesRes.data ?? []) as BranchOption[]
    const memberIds = ((membersRes.data ?? []) as Array<{ user_id: string; company_id: string }>)
      .filter((row) => row.company_id === company.id)
      .map((row) => row.user_id)
    const profileIds = new Set<string>(memberIds)
    for (const task of nextTasks) {
      if (task.assigned_to) profileIds.add(task.assigned_to)
      if (task.completed_by) profileIds.add(task.completed_by)
    }
    const nextNames = new Map<string, string>()
    if (profileIds.size > 0) {
      const profilesRes = await supabase.from('profiles').select('id, full_name').in('id', [...profileIds])
      if (!profilesRes.error) {
        for (const row of profilesRes.data ?? []) {
          const name = String(row.full_name ?? '').trim()
          if (name) nextNames.set(String(row.id), name)
        }
      }
    }
    if (userId && !nextNames.has(userId)) {
      const fallback = profile?.full_name?.trim() || session?.user.email || ''
      if (fallback) nextNames.set(userId, fallback)
    }
    setNames(nextNames)
    setMembers(memberIds.map((id) => ({ userId: id, label: nextNames.get(id) || 'عضو' })))
    setRows(nextTasks)
    setEmployees(nextEmployees)
    setBranches(nextBranches)
    setLoading(false)
  }, [company, profile?.full_name, scopeEmployeeId, session?.user.email, userId])

  useEffect(() => {
    if (companyLoading) return
    void load()
  }, [companyLoading, load])

  useEffect(() => {
    if (embedded || loading || openedTask.current || !initialTaskId) return
    openedTask.current = true
    const row = rows.find((item) => item.id === initialTaskId)
    if (!row) {
      setError('لا توجد مهمة بهذه البيانات')
      return
    }
    if (canManageTasks) setDraft(taskToDraft(row))
  }, [canManageTasks, embedded, initialTaskId, loading, rows])

  useEffect(() => {
    if (embedded || loading || !company || !initialEmployeeFilter) return
    if (employees.some((item) => item.id === initialEmployeeFilter)) return
    setEmployeeFilter('')
    setError('لا يوجد موظف بهذه البيانات')
  }, [company, embedded, employees, initialEmployeeFilter, loading])

  const employeeName = useMemo(() => new Map(employees.map((item) => [item.id, item.full_name])), [employees])
  const branchName = useMemo(() => new Map(branches.map((item) => [item.id, item.name])), [branches])
  const memberIds = useMemo(() => new Set(members.map((item) => item.userId)), [members])
  const today = riyadhToday()
  const hasOtherAssignee = rows.some((row) => row.assigned_to && !memberIds.has(row.assigned_to) && !names.has(row.assigned_to))

  function personLabel(id: string | null): string {
    if (!id) return 'غير مسند'
    return names.get(id) || 'عضو'
  }

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase()
    return rows.filter((row) => {
      if (statusFilter && row.status !== statusFilter) return false
      if (priorityFilter && row.priority !== priorityFilter) return false
      if (branchFilter === 'none' && row.branch_id) return false
      if (branchFilter && branchFilter !== 'none' && row.branch_id !== branchFilter) return false
      if (!embedded && employeeFilter === 'none' && row.employee_id) return false
      if (!embedded && employeeFilter && employeeFilter !== 'none' && row.employee_id !== employeeFilter) return false
      if (assignedFilter === 'none' && row.assigned_to) return false
      if (assignedFilter === 'other') {
        if (!row.assigned_to || memberIds.has(row.assigned_to) || names.has(row.assigned_to)) return false
      } else if (assignedFilter && row.assigned_to !== assignedFilter) return false
      if (dueFilter && dueBucket(row, today) !== dueFilter) return false
      if (!term) return true
      return row.title.toLowerCase().includes(term)
    })
  }, [assignedFilter, branchFilter, dueFilter, embedded, employeeFilter, memberIds, names, priorityFilter, rows, search, statusFilter, today])

  function openCreate() {
    const employeeId = scopeEmployeeId && employees.some((item) => item.id === scopeEmployeeId) ? scopeEmployeeId : ''
    const branchFromEmployee = employeeId ? employees.find((item) => item.id === employeeId)?.branch_id : null
    const preferredBranch = scopeBranchId || branchFromEmployee || ''
    const branchId = preferredBranch && branches.some((item) => item.id === preferredBranch) ? preferredBranch : ''
    setError('')
    setNotice('')
    setDraft(emptyTaskDraft({ employeeId, branchId }))
  }

  async function save(event: FormEvent) {
    event.preventDefault()
    if (!draft || !canManageTasks) return
    const parsed = draftToTaskWrite(draft, {
      employeeIds: new Set(employees.map((item) => item.id)),
      branchIds: new Set(branches.map((item) => item.id)),
      memberIds,
    })
    if ('error' in parsed) {
      setError(parsed.error)
      return
    }
    setSaving(true)
    setError('')
    const payload = draft.id
      ? {
          title: parsed.input.title,
          description: parsed.input.description,
          branch_id: parsed.input.branch_id,
          employee_id: parsed.input.employee_id,
          priority: parsed.input.priority,
          due_date: parsed.input.due_date,
          assigned_to: parsed.input.assigned_to,
          status: parsed.input.status,
        }
      : {
          title: parsed.input.title,
          description: parsed.input.description,
          branch_id: parsed.input.branch_id,
          employee_id: parsed.input.employee_id,
          priority: parsed.input.priority,
          due_date: parsed.input.due_date,
          assigned_to: parsed.input.assigned_to,
          status: 'open' as const,
        }
    const result = draft.id
      ? await supabase.from('tasks').update(payload).eq('id', draft.id).select(COLUMNS).maybeSingle()
      : await supabase.from('tasks').insert(payload).select(COLUMNS).maybeSingle()
    setSaving(false)
    if (result.error || !result.data) {
      setError(result.error ? taskError(result.error) : 'تعذر حفظ المهمة')
      return
    }
    const saved = readTask(result.data as Record<string, unknown>)
    setDraft(null)
    setNotice(draft.id ? 'تم تحديث المهمة' : 'تمت إضافة المهمة')
    notifyEmployeeActivity()
    if (saved?.completed_by) {
      setNames((current) => {
        if (current.has(saved.completed_by as string)) return current
        const next = new Map(current)
        if (saved.completed_by === userId) {
          const fallback = profile?.full_name?.trim() || session?.user.email
          if (fallback) next.set(userId, fallback)
        }
        return next
      })
    }
    void load()
  }

  async function changeStatus(row: Task, status: TaskStatus) {
    if (role !== 'user' || row.assigned_to !== userId || row.status === 'cancelled') return
    if (!ASSIGNEE_STATUSES.includes(status)) return
    setStatusSavingId(row.id)
    setError('')
    const { data, error: updateError } = await supabase.from('tasks').update({ status }).eq('id', row.id).select(COLUMNS).maybeSingle()
    setStatusSavingId('')
    if (updateError || !data) {
      setError(updateError ? taskError(updateError) : 'تعذر حفظ المهمة')
      return
    }
    const saved = readTask(data as Record<string, unknown>)
    if (!saved) {
      setError('تعذر حفظ المهمة')
      return
    }
    setRows((current) => current.map((item) => (item.id === saved.id ? saved : item)))
    setNotice('تم تحديث حالة المهمة')
    notifyEmployeeActivity()
  }

  async function removeTask() {
    if (!deleting || !canDeleteTasks) return
    setDeletingBusy(true)
    setError('')
    const { data, error: deleteError } = await supabase.from('tasks').delete().eq('id', deleting.id).select('id').maybeSingle()
    setDeletingBusy(false)
    if (deleteError || !data) {
      setError(deleteError ? taskError(deleteError) : 'لا تملك صلاحية تنفيذ هذا الإجراء')
      return
    }
    setDeleting(null)
    setNotice('تم حذف المهمة')
    notifyEmployeeActivity()
    void load()
  }

  const waiting = companyLoading || loading
  const branchChoices = branches.filter((branch) => branch.is_active || branch.id === draft?.branch_id)

  const body = (
    <>
      {!embedded && (
        <div className="page-head">
          <div>
            <h1>المهام</h1>
            <p className="page-sub">
              {company ? company.name : 'مهام الشركة الحالية'}
              {!waiting && company ? ` — ${visible.length} من ${rows.length}` : ''}
            </p>
          </div>
          {canManageTasks && company && (
            <button type="button" className="btn btn-primary" onClick={openCreate}>
              إضافة مهمة
            </button>
          )}
        </div>
      )}

      {embedded && (
        <div className="price-section-head">
          <h2>مهام الموظف</h2>
          <div className="branch-actions">
            {scopeEmployeeId && (
              <Link className="btn btn-ghost btn-sm" to={`/tasks?employee=${scopeEmployeeId}`}>
                عرض في المهام
              </Link>
            )}
            {canManageTasks && (
              <button type="button" className="btn btn-primary btn-sm" onClick={openCreate}>
                إضافة مهمة
              </button>
            )}
          </div>
        </div>
      )}

      {notice && !draft && !deleting && <div className="alert alert-ok">{notice}</div>}
      {(companyError || error) && !draft && !deleting && <div className="alert alert-error">{companyError || error}</div>}

      {!embedded && (
        <div className="card">
          <div className="filters">
            <div className="field">
              <label htmlFor="task-search">بحث</label>
              <input
                id="task-search"
                value={search}
                placeholder="عنوان المهمة"
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="task-status-filter">الحالة</label>
              <select
                id="task-status-filter"
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value as '' | TaskStatus)}
              >
                <option value="">كل الحالات</option>
                {TASK_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {taskStatusLabel[status]}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="task-priority-filter">الأولوية</label>
              <select
                id="task-priority-filter"
                value={priorityFilter}
                onChange={(event) => setPriorityFilter(event.target.value as '' | TaskPriority)}
              >
                <option value="">كل الأولويات</option>
                {TASK_PRIORITIES.map((priority) => (
                  <option key={priority} value={priority}>
                    {taskPriorityLabel[priority]}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="task-branch-filter">الفرع</label>
              <select id="task-branch-filter" value={branchFilter} onChange={(event) => setBranchFilter(event.target.value)}>
                <option value="">كل الفروع</option>
                <option value="none">بدون فرع</option>
                {branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="task-employee-filter">الموظف</label>
              <select id="task-employee-filter" value={employeeFilter} onChange={(event) => setEmployeeFilter(event.target.value)}>
                <option value="">كل الموظفين</option>
                <option value="none">بدون موظف</option>
                {employees.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.full_name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="task-assigned-filter">المسند إليه</label>
              <select id="task-assigned-filter" value={assignedFilter} onChange={(event) => setAssignedFilter(event.target.value)}>
                <option value="">الكل</option>
                <option value="none">غير مسند</option>
                {members.map((member) => (
                  <option key={member.userId} value={member.userId}>
                    {member.label}
                  </option>
                ))}
                {[...names.entries()]
                  .filter(([id]) => !memberIds.has(id) && rows.some((row) => row.assigned_to === id))
                  .map(([id, label]) => (
                    <option key={id} value={id}>
                      {label}
                    </option>
                  ))}
                {hasOtherAssignee && <option value="other">عضو آخر</option>}
              </select>
            </div>
          </div>
          <div className="quick-filters">
            <button type="button" className={dueFilter === '' ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm'} onClick={() => setDueFilter('')}>
              كل المواعيد
            </button>
            <button
              type="button"
              className={dueFilter === 'overdue' ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm'}
              onClick={() => setDueFilter('overdue')}
            >
              متأخرة
            </button>
            <button
              type="button"
              className={dueFilter === 'today' ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm'}
              onClick={() => setDueFilter('today')}
            >
              تستحق اليوم
            </button>
            <button
              type="button"
              className={dueFilter === 'upcoming' ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm'}
              onClick={() => setDueFilter('upcoming')}
            >
              قادمة
            </button>
          </div>
        </div>
      )}

      <div className={embedded ? undefined : 'card'}>
        {waiting ? (
          <div className="empty">جارٍ التحميل…</div>
        ) : !company ? (
          <div className="empty">
            {ambiguous ? 'يوجد أكثر من شركة لهذا الحساب ولم تُحدَّد الشركة النشطة.' : 'لا توجد شركة نشطة لهذا الحساب.'}
          </div>
        ) : rows.length === 0 ? (
          <div className="empty">لا توجد مهام</div>
        ) : visible.length === 0 ? (
          <div className="empty">لا توجد نتائج مطابقة</div>
        ) : (
          <>
            <div className="table-wrap task-table">
              <table>
                <thead>
                  <tr>
                    <th>العنوان</th>
                    {!embedded && <th>الموظف</th>}
                    {!embedded && <th>الفرع</th>}
                    <th>الحالة</th>
                    <th>الأولوية</th>
                    <th>تاريخ الاستحقاق</th>
                    <th>المسند إليه</th>
                    {!embedded && <th>تاريخ الإنشاء</th>}
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {visible.map((row) => (
                    <tr key={row.id}>
                      <td className="strong">
                        {embedded ? <Link to={`/tasks?task=${row.id}`}>{row.title}</Link> : row.title}
                        {row.description?.trim() ? <div className="employee-card-meta">{row.description}</div> : null}
                      </td>
                      {!embedded && (
                        <td>
                          {row.employee_id ? (
                            <Link to={`/employees/${row.employee_id}`}>{employeeName.get(row.employee_id) || '—'}</Link>
                          ) : (
                            '—'
                          )}
                        </td>
                      )}
                      {!embedded && <td>{row.branch_id ? branchName.get(row.branch_id) || '—' : '—'}</td>}
                      <td>
                        <div className="status-cell">
                          <span className={statusBadge(row.status)}>{taskStatusLabel[row.status]}</span>
                          {row.status === 'completed' && row.completed_at && (
                            <span className="employee-card-meta">
                              أُنجزت {formatDateTime(row.completed_at)}
                              {row.completed_by ? ` — ${personLabel(row.completed_by)}` : ''}
                            </span>
                          )}
                          {role === 'user' && row.assigned_to === userId && row.status !== 'cancelled' && (
                            <select
                              aria-label="تغيير حالة المهمة"
                              value={row.status}
                              disabled={statusSavingId === row.id}
                              onChange={(event) => void changeStatus(row, event.target.value as TaskStatus)}
                            >
                              {ASSIGNEE_STATUSES.map((status) => (
                                <option key={status} value={status}>
                                  {taskStatusLabel[status]}
                                </option>
                              ))}
                            </select>
                          )}
                        </div>
                      </td>
                      <td>
                        <span className={priorityBadge(row.priority)}>{taskPriorityLabel[row.priority]}</span>
                      </td>
                      <td>
                        <span className="num" dir="ltr">
                          {formatEmployeeDate(row.due_date)}
                        </span>
                        {dueBucket(row, today) === 'overdue' && <span className="badge badge-cancelled">متأخرة</span>}
                      </td>
                      <td>{personLabel(row.assigned_to)}</td>
                      {!embedded && (
                        <td className="num" dir="ltr">
                          {formatDateTime(row.created_at)}
                        </td>
                      )}
                      <td>
                        <TaskActions
                          canManage={canManageTasks}
                          canDelete={canDeleteTasks}
                          onEdit={() => {
                            setError('')
                            setNotice('')
                            setDraft(taskToDraft(row))
                          }}
                          onDelete={() => {
                            setError('')
                            setDeleting(row)
                          }}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="task-cards">
              {visible.map((row) => (
                <article className="employee-card" key={row.id}>
                  <div className="employee-card-head">
                    <strong>{embedded ? <Link to={`/tasks?task=${row.id}`}>{row.title}</Link> : row.title}</strong>
                    <span className={priorityBadge(row.priority)}>{taskPriorityLabel[row.priority]}</span>
                  </div>
                  <div>
                    <span className={statusBadge(row.status)}>{taskStatusLabel[row.status]}</span>
                    {dueBucket(row, today) === 'overdue' && <span className="badge badge-cancelled">متأخرة</span>}
                  </div>
                  {!embedded && (
                    <div className="employee-card-meta">
                      <span>{row.employee_id ? employeeName.get(row.employee_id) || '—' : 'بدون موظف'}</span>
                      <span>{row.branch_id ? branchName.get(row.branch_id) || '—' : 'بدون فرع'}</span>
                    </div>
                  )}
                  <div>الاستحقاق: {formatEmployeeDate(row.due_date)}</div>
                  <div>المسند إليه: {personLabel(row.assigned_to)}</div>
                  {!embedded && <div>الإنشاء: {formatDateTime(row.created_at)}</div>}
                  {row.status === 'completed' && row.completed_at && (
                    <div className="employee-card-meta">
                      أُنجزت {formatDateTime(row.completed_at)}
                      {row.completed_by ? ` — ${personLabel(row.completed_by)}` : ''}
                    </div>
                  )}
                  {row.description?.trim() ? <p className="note-line">{row.description}</p> : null}
                  {role === 'user' && row.assigned_to === userId && row.status !== 'cancelled' && (
                    <div className="field">
                      <label htmlFor={`task-status-${row.id}`}>الحالة</label>
                      <select
                        id={`task-status-${row.id}`}
                        value={row.status}
                        disabled={statusSavingId === row.id}
                        onChange={(event) => void changeStatus(row, event.target.value as TaskStatus)}
                      >
                        {ASSIGNEE_STATUSES.map((status) => (
                          <option key={status} value={status}>
                            {taskStatusLabel[status]}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                  <TaskActions
                    canManage={canManageTasks}
                    canDelete={canDeleteTasks}
                    onEdit={() => {
                      setError('')
                      setNotice('')
                      setDraft(taskToDraft(row))
                    }}
                    onDelete={() => {
                      setError('')
                      setDeleting(row)
                    }}
                  />
                </article>
              ))}
            </div>
          </>
        )}
      </div>

      <Modal
        title={draft?.id ? 'تعديل المهمة' : 'إضافة مهمة'}
        open={Boolean(draft)}
        onClose={() => {
          if (!saving) setDraft(null)
        }}
      >
        {draft && (
          <form className="service-add-form" onSubmit={(event) => void save(event)}>
            {error && <div className="alert alert-error">{error}</div>}
            <div className="form-grid">
              <div className="field full">
                <label htmlFor="task-title">العنوان</label>
                <input
                  id="task-title"
                  value={draft.title}
                  onChange={(event) =>
                    setDraft((current) => (current ? { ...current, title: event.target.value } : current))
                  }
                />
              </div>
              <div className="field full">
                <label htmlFor="task-description">الوصف</label>
                <textarea
                  id="task-description"
                  value={draft.description}
                  onChange={(event) =>
                    setDraft((current) => (current ? { ...current, description: event.target.value } : current))
                  }
                />
              </div>
              <div className="field">
                <label htmlFor="task-employee">الموظف</label>
                <select
                  id="task-employee"
                  value={draft.employee_id}
                  onChange={(event) => {
                    const employeeId = event.target.value
                    setDraft((current) => {
                      if (!current) return current
                      const next = { ...current, employee_id: employeeId }
                      const employee = employees.find((item) => item.id === employeeId)
                      if (!current.branch_id && employee?.branch_id && branches.some((item) => item.id === employee.branch_id)) {
                        next.branch_id = employee.branch_id
                      }
                      return next
                    })
                  }}
                >
                  <option value="">بدون موظف</option>
                  {employees.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.full_name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="task-branch">الفرع</label>
                <select
                  id="task-branch"
                  value={draft.branch_id}
                  onChange={(event) =>
                    setDraft((current) => (current ? { ...current, branch_id: event.target.value } : current))
                  }
                >
                  <option value="">بدون فرع</option>
                  {branchChoices.map((branch) => (
                    <option key={branch.id} value={branch.id}>
                      {branch.name}
                      {branch.is_active ? '' : ' (متوقف)'}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="task-priority">الأولوية</label>
                <select
                  id="task-priority"
                  value={draft.priority}
                  onChange={(event) =>
                    setDraft((current) =>
                      current ? { ...current, priority: event.target.value as TaskPriority } : current,
                    )
                  }
                >
                  {TASK_PRIORITIES.map((priority) => (
                    <option key={priority} value={priority}>
                      {taskPriorityLabel[priority]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="task-due">تاريخ الاستحقاق</label>
                <input
                  id="task-due"
                  type="date"
                  dir="ltr"
                  value={draft.due_date}
                  onChange={(event) =>
                    setDraft((current) => (current ? { ...current, due_date: event.target.value } : current))
                  }
                />
              </div>
              <div className="field">
                <label htmlFor="task-assignee">المسند إليه</label>
                <select
                  id="task-assignee"
                  value={draft.assigned_to}
                  onChange={(event) =>
                    setDraft((current) => (current ? { ...current, assigned_to: event.target.value } : current))
                  }
                >
                  <option value="">غير مسند</option>
                  {members.map((member) => (
                    <option key={member.userId} value={member.userId}>
                      {member.label}
                    </option>
                  ))}
                  {draft.assigned_to && !memberIds.has(draft.assigned_to) && (
                    <option value={draft.assigned_to}>{personLabel(draft.assigned_to)}</option>
                  )}
                </select>
              </div>
              {draft.id && (
                <div className="field">
                  <label htmlFor="task-status">الحالة</label>
                  <select
                    id="task-status"
                    value={draft.status}
                    onChange={(event) =>
                      setDraft((current) => (current ? { ...current, status: event.target.value as TaskStatus } : current))
                    }
                  >
                    {TASK_STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {taskStatusLabel[status]}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
            <div className="form-actions">
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? 'جارٍ الحفظ…' : 'حفظ'}
              </button>
              <button type="button" className="btn btn-ghost" disabled={saving} onClick={() => setDraft(null)}>
                إلغاء
              </button>
            </div>
          </form>
        )}
      </Modal>

      <Modal title="حذف المهمة" compact hideHeader open={Boolean(deleting)} onClose={() => !deletingBusy && setDeleting(null)}>
        {deleting && (
          <div className="confirm-dialog">
            <p className="confirm-copy">هل أنت متأكد من حذف هذه المهمة؟</p>
            <p className="confirm-detail">{deleting.title}</p>
            {error && <div className="alert alert-error">{error}</div>}
            <div className="confirm-actions">
              <button type="button" className="btn confirm-delete" disabled={deletingBusy} onClick={() => void removeTask()}>
                {deletingBusy ? 'جارٍ الحذف…' : 'حذف'}
              </button>
              <button type="button" className="btn confirm-cancel" disabled={deletingBusy} onClick={() => setDeleting(null)}>
                إلغاء
              </button>
            </div>
          </div>
        )}
      </Modal>
    </>
  )

  if (embedded) return <section className="card">{body}</section>
  return body
}

function TaskActions({
  canManage,
  canDelete,
  onEdit,
  onDelete,
}: {
  canManage: boolean
  canDelete: boolean
  onEdit: () => void
  onDelete: () => void
}) {
  if (!canManage && !canDelete) return null
  return (
    <div className="branch-actions">
      {canManage && (
        <button type="button" className="btn btn-ghost btn-sm" onClick={onEdit}>
          تعديل
        </button>
      )}
      {canDelete && (
        <button type="button" className="btn btn-danger btn-sm" onClick={onDelete}>
          حذف
        </button>
      )}
    </div>
  )
}
