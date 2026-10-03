export const TASK_STATUSES = ['open', 'in_progress', 'completed', 'cancelled'] as const
export const TASK_PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const

export type TaskStatus = (typeof TASK_STATUSES)[number]
export type TaskPriority = (typeof TASK_PRIORITIES)[number]
export type DueFilter = '' | 'overdue' | 'today' | 'upcoming'

export const taskStatusLabel: Record<TaskStatus, string> = {
  open: 'مفتوحة',
  in_progress: 'قيد التنفيذ',
  completed: 'مكتملة',
  cancelled: 'ملغاة',
}

export const taskPriorityLabel: Record<TaskPriority, string> = {
  low: 'منخفضة',
  normal: 'عادية',
  high: 'عالية',
  urgent: 'عاجلة',
}

export const ASSIGNEE_STATUSES: TaskStatus[] = ['open', 'in_progress', 'completed']

export interface Task {
  id: string
  branch_id: string | null
  employee_id: string | null
  title: string
  description: string | null
  status: TaskStatus
  priority: TaskPriority
  due_date: string | null
  assigned_to: string | null
  completed_by: string | null
  completed_at: string | null
  created_at: string
}

export interface TaskDraft {
  id: string | null
  title: string
  description: string
  branch_id: string
  employee_id: string
  priority: TaskPriority
  due_date: string
  assigned_to: string
  status: TaskStatus
  originalAssignedTo: string | null
}

export interface TaskWrite {
  title: string
  description: string | null
  branch_id: string | null
  employee_id: string | null
  priority: TaskPriority
  due_date: string | null
  assigned_to: string | null
  status: TaskStatus
}

export function emptyTaskDraft(preset?: { employeeId?: string; branchId?: string }): TaskDraft {
  return {
    id: null,
    title: '',
    description: '',
    branch_id: preset?.branchId ?? '',
    employee_id: preset?.employeeId ?? '',
    priority: 'normal',
    due_date: '',
    assigned_to: '',
    status: 'open',
    originalAssignedTo: null,
  }
}

export function taskToDraft(row: Task): TaskDraft {
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? '',
    branch_id: row.branch_id ?? '',
    employee_id: row.employee_id ?? '',
    priority: row.priority,
    due_date: row.due_date?.slice(0, 10) ?? '',
    assigned_to: row.assigned_to ?? '',
    status: row.status,
    originalAssignedTo: row.assigned_to,
  }
}

export function draftToTaskWrite(
  draft: TaskDraft,
  lists: { employeeIds: Set<string>; branchIds: Set<string>; memberIds: Set<string> },
): { error: string } | { input: TaskWrite } {
  const title = draft.title.trim()
  if (!title) return { error: 'أدخل عنوان المهمة' }
  if (!isTaskStatus(draft.status)) return { error: 'اختر حالة صحيحة' }
  if (!isTaskPriority(draft.priority)) return { error: 'اختر أولوية صحيحة' }

  const dueDate = blankToNull(draft.due_date)
  if (!isIsoDate(dueDate)) return { error: 'صيغة التاريخ غير صحيحة' }

  const employeeId = blankToNull(draft.employee_id)
  if (employeeId && !lists.employeeIds.has(employeeId)) return { error: 'اختر موظفاً من القائمة' }

  const branchId = blankToNull(draft.branch_id)
  if (branchId && !lists.branchIds.has(branchId)) return { error: 'اختر فرعاً من القائمة' }

  const assignedTo = blankToNull(draft.assigned_to)
  const keptAssignee = Boolean(draft.id && assignedTo && assignedTo === draft.originalAssignedTo)
  if (assignedTo && !keptAssignee && !lists.memberIds.has(assignedTo)) return { error: 'اختر عضواً نشطاً من القائمة' }

  return {
    input: {
      title,
      description: blankToNull(draft.description),
      branch_id: branchId,
      employee_id: employeeId,
      priority: draft.priority,
      due_date: dueDate,
      assigned_to: assignedTo,
      status: draft.id ? draft.status : 'open',
    },
  }
}

export function taskError(error: unknown): string {
  const message = typeof error === 'string' ? error : (error as { message?: string } | null)?.message || ''
  if (/tasks_title_not_blank/i.test(message)) return 'أدخل عنوان المهمة'
  if (/tasks_status_check/i.test(message)) return 'اختر حالة صحيحة'
  if (/tasks_priority_check/i.test(message)) return 'اختر أولوية صحيحة'
  if (/tasks_assignee_company_fkey|عضو غير نشط/i.test(message)) return 'لا يمكن إسناد المهمة إلى عضو غير نشط'
  if (/tasks_employee_company_fkey/i.test(message)) return 'اختر موظفاً من القائمة'
  if (/tasks_branch_company_fkey/i.test(message)) return 'اختر فرعاً من القائمة'
  if (/لا يمكنك|لا تملك|لا يمكن/.test(message)) return message
  if (/row-level security|permission denied|violates row-level/i.test(message)) return 'لا تملك صلاحية تنفيذ هذا الإجراء'
  return message || 'حدث خطأ غير متوقع'
}

export function isTaskStatus(value: string): value is TaskStatus {
  return (TASK_STATUSES as readonly string[]).includes(value)
}

export function isTaskPriority(value: string): value is TaskPriority {
  return (TASK_PRIORITIES as readonly string[]).includes(value)
}

export function readTask(row: Record<string, unknown>): Task | null {
  const status = String(row.status ?? '')
  const priority = String(row.priority ?? '')
  if (!isTaskStatus(status) || !isTaskPriority(priority)) return null
  return {
    id: String(row.id),
    branch_id: (row.branch_id as string | null) ?? null,
    employee_id: (row.employee_id as string | null) ?? null,
    title: String(row.title ?? ''),
    description: (row.description as string | null) ?? null,
    status,
    priority,
    due_date: (row.due_date as string | null) ?? null,
    assigned_to: (row.assigned_to as string | null) ?? null,
    completed_by: (row.completed_by as string | null) ?? null,
    completed_at: (row.completed_at as string | null) ?? null,
    created_at: String(row.created_at ?? ''),
  }
}

export function riyadhToday(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Riyadh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

export function dueBucket(task: Pick<Task, 'status' | 'due_date'>, today = riyadhToday()): DueFilter {
  if (task.status === 'completed' || task.status === 'cancelled' || !task.due_date) return ''
  const day = task.due_date.slice(0, 10)
  if (day < today) return 'overdue'
  if (day === today) return 'today'
  return 'upcoming'
}

export function priorityBadge(priority: TaskPriority): string {
  if (priority === 'urgent') return 'badge badge-urgent'
  if (priority === 'high') return 'badge badge-high'
  if (priority === 'low') return 'badge badge-locked'
  return 'badge badge-locked'
}

export function statusBadge(status: TaskStatus): string {
  if (status === 'open') return 'badge badge-pending'
  if (status === 'in_progress') return 'badge badge-progress'
  if (status === 'completed') return 'badge badge-completed'
  return 'badge badge-cancelled'
}

function blankToNull(value: string): string | null {
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function isIsoDate(value: string | null): boolean {
  if (!value) return true
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const parsed = new Date(Date.UTC(year, month - 1, day))
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day
}
