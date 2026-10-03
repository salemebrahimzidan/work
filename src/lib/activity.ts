export const ACTIVITY_EVENTS = [
  'employee.created',
  'employee.updated',
  'document.created',
  'document.updated',
  'document.deleted',
  'task.created',
  'task.updated',
  'task.completed',
  'task.reopened',
  'task.cancelled',
] as const

export type ActivityEvent = (typeof ACTIVITY_EVENTS)[number]

export const activityEventLabel: Record<ActivityEvent, string> = {
  'employee.created': 'إضافة موظف',
  'employee.updated': 'تحديث موظف',
  'document.created': 'إضافة مستند',
  'document.updated': 'تحديث مستند',
  'document.deleted': 'حذف مستند',
  'task.created': 'إنشاء مهمة',
  'task.updated': 'تحديث مهمة',
  'task.completed': 'إنجاز مهمة',
  'task.reopened': 'إعادة فتح مهمة',
  'task.cancelled': 'إلغاء مهمة',
}

export const activitySubjectLabel: Record<string, string> = {
  employee: 'موظف',
  employee_document: 'مستند',
  task: 'مهمة',
}

export interface ActivityRow {
  id: string
  actor_id: string | null
  event_type: string
  subject_type: string
  subject_id: string
  summary: string
  created_at: string
}

export function notifyEmployeeActivity() {
  window.dispatchEvent(new Event('employee-activity'))
}

export function isActivityEvent(value: string): value is ActivityEvent {
  return (ACTIVITY_EVENTS as readonly string[]).includes(value)
}

export function readActivity(row: Record<string, unknown>): ActivityRow | null {
  if (!row.id || !row.event_type || !row.subject_type || !row.summary) return null
  return {
    id: String(row.id),
    actor_id: (row.actor_id as string | null) ?? null,
    event_type: String(row.event_type),
    subject_type: String(row.subject_type),
    subject_id: String(row.subject_id),
    summary: String(row.summary),
    created_at: String(row.created_at ?? ''),
  }
}
