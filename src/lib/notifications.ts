import { supabase } from './supabase'

export const NOTIFICATION_LIST_LIMIT = 40

export type NotificationSubjectType = 'employee' | 'employee_document' | 'task'

export type NotificationAlertType =
  | 'iqama_expiry'
  | 'passport_expiry'
  | 'document_expiry'
  | 'task_due_soon'
  | 'task_due_today'
  | 'task_overdue'
  | 'task_urgent'

export type InboxStatus = 'unread' | 'read'

export interface InboxNotification {
  id: string
  subject_type: NotificationSubjectType
  subject_id: string
  alert_type: NotificationAlertType
  threshold: string
  summary: string
  due_on: string | null
  status: InboxStatus
  created_at: string
  read_at: string | null
  dismissed_at: string | null
}

const LIST_COLUMNS =
  'id, subject_type, subject_id, alert_type, threshold, summary, due_on, status, created_at, read_at, dismissed_at'

const ALERT_TITLES: Record<NotificationAlertType, string> = {
  iqama_expiry: 'تنبيه انتهاء الإقامة',
  passport_expiry: 'تنبيه انتهاء جواز السفر',
  document_expiry: 'تنبيه انتهاء مستند',
  task_due_soon: 'مهمة تقترب من موعدها',
  task_due_today: 'مهمة مستحقة اليوم',
  task_overdue: 'مهمة متأخرة',
  task_urgent: 'مهمة عاجلة',
}

const SUBJECTS = new Set<NotificationSubjectType>(['employee', 'employee_document', 'task'])
const ALERTS = new Set<NotificationAlertType>([
  'iqama_expiry',
  'passport_expiry',
  'document_expiry',
  'task_due_soon',
  'task_due_today',
  'task_overdue',
  'task_urgent',
])

export function notificationTitle(alertType: string): string {
  if (ALERTS.has(alertType as NotificationAlertType)) return ALERT_TITLES[alertType as NotificationAlertType]
  return 'إشعار'
}

function asInbox(row: Record<string, unknown>): InboxNotification | null {
  const status = row.status
  const subjectType = row.subject_type
  const alertType = row.alert_type
  if (status !== 'unread' && status !== 'read') return null
  if (typeof subjectType !== 'string' || !SUBJECTS.has(subjectType as NotificationSubjectType)) return null
  if (typeof alertType !== 'string' || !ALERTS.has(alertType as NotificationAlertType)) return null
  if (typeof row.id !== 'string' || typeof row.subject_id !== 'string') return null
  if (typeof row.summary !== 'string' || typeof row.created_at !== 'string') return null
  return {
    id: row.id,
    subject_type: subjectType as NotificationSubjectType,
    subject_id: row.subject_id,
    alert_type: alertType as NotificationAlertType,
    threshold: typeof row.threshold === 'string' ? row.threshold : '',
    summary: row.summary,
    due_on: typeof row.due_on === 'string' ? row.due_on : null,
    status,
    created_at: row.created_at,
    read_at: typeof row.read_at === 'string' ? row.read_at : null,
    dismissed_at: typeof row.dismissed_at === 'string' ? row.dismissed_at : null,
  }
}

export async function listActiveNotifications(): Promise<{ rows: InboxNotification[]; error: boolean }> {
  const { data, error } = await supabase
    .from('notifications')
    .select(LIST_COLUMNS)
    .in('status', ['unread', 'read'])
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(NOTIFICATION_LIST_LIMIT)

  if (error) return { rows: [], error: true }
  const rows = (data ?? []).map((row) => asInbox(row as Record<string, unknown>)).filter((row) => row !== null)
  return { rows, error: false }
}

export async function countUnreadNotifications(): Promise<{ count: number; error: boolean }> {
  const { count, error } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'unread')

  if (error) return { count: 0, error: true }
  return { count: count ?? 0, error: false }
}

export async function markNotificationRead(id: string): Promise<{ row: InboxNotification | null; error: boolean }> {
  const { data, error } = await supabase
    .from('notifications')
    .update({ status: 'read' })
    .eq('id', id)
    .eq('status', 'unread')
    .select(LIST_COLUMNS)

  if (error) return { row: null, error: true }
  const first = Array.isArray(data) ? data[0] : null
  const row = first && typeof first === 'object' ? asInbox(first as Record<string, unknown>) : null
  return { row, error: row === null }
}

export async function dismissNotification(id: string): Promise<{ ok: boolean; error: boolean }> {
  const { data, error } = await supabase
    .from('notifications')
    .update({ status: 'dismissed' })
    .eq('id', id)
    .in('status', ['unread', 'read'])
    .select('id, status')

  if (error) return { ok: false, error: true }
  const updated = (data ?? []).some((row) => row.status === 'dismissed')
  return { ok: updated, error: !updated }
}

export async function markAllNotificationsRead(): Promise<{ error: boolean }> {
  const { error } = await supabase.from('notifications').update({ status: 'read' }).eq('status', 'unread')
  return { error: Boolean(error) }
}

/** Resolves a document the current member can already read. Returns null when RLS hides it. */
export async function documentEmployeeId(documentId: string): Promise<{ employeeId: string | null; error: boolean }> {
  const { data, error } = await supabase
    .from('employee_documents')
    .select('employee_id')
    .eq('id', documentId)
    .maybeSingle()

  if (error) return { employeeId: null, error: true }
  const employeeId = typeof data?.employee_id === 'string' ? data.employee_id : null
  return { employeeId, error: false }
}
