import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AlarmClock,
  Bell,
  BookOpen,
  CalendarCheck,
  CalendarClock,
  FileText,
  IdCard,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import { count, formatDateTime } from '../lib/format'
import { formatEmployeeDate } from '../lib/employees'
import {
  countUnreadNotifications,
  dismissNotification,
  documentEmployeeId,
  listActiveNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  notificationTitle,
  NOTIFICATION_LIST_LIMIT,
  type InboxNotification,
  type NotificationAlertType,
} from '../lib/notifications'

const ICONS: Record<NotificationAlertType, LucideIcon> = {
  iqama_expiry: IdCard,
  passport_expiry: BookOpen,
  document_expiry: FileText,
  task_due_soon: CalendarClock,
  task_due_today: CalendarCheck,
  task_overdue: AlarmClock,
  task_urgent: Zap,
}

const LOAD_ERROR = 'تعذر تحميل الإشعارات'
const UPDATE_ERROR = 'تعذر تحديث الإشعار'
const DOCUMENT_ERROR = 'تعذر فتح هذا المستند'

function badgeLabel(value: number): string {
  return value > 99 ? '99+' : count(value)
}

export default function NotificationBell() {
  const navigate = useNavigate()
  const panelId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [rows, setRows] = useState<InboxNotification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [pendingAll, setPendingAll] = useState(false)
  const [panelStyle, setPanelStyle] = useState<{ top: number; left: number; width: number } | null>(null)

  const placePanel = useCallback(() => {
    const rect = buttonRef.current?.getBoundingClientRect()
    if (!rect) return
    const margin = 12
    if (window.innerWidth <= 800) {
      setPanelStyle({ top: rect.bottom + 8, left: margin, width: window.innerWidth - margin * 2 })
      return
    }
    const width = 360
    let left = rect.right - width
    if (left < margin) left = margin
    if (left + width > window.innerWidth - margin) left = window.innerWidth - margin - width
    setPanelStyle({ top: rect.bottom + 8, left, width })
  }, [])

  const refresh = useCallback(async () => {
    setLoading(true)
    setError('')
    const [listResult, countResult] = await Promise.all([listActiveNotifications(), countUnreadNotifications()])
    if (listResult.error || countResult.error) {
      setError(LOAD_ERROR)
      setLoading(false)
      return
    }
    setRows(listResult.rows)
    setUnreadCount(countResult.count)
    setLoading(false)
  }, [])

  useEffect(() => {
    void countUnreadNotifications().then((result) => {
      if (!result.error) setUnreadCount(result.count)
    })
  }, [])

  useEffect(() => {
    if (!open) return
    placePanel()
    void refresh()
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }
    function onPointer(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    function onMove() {
      placePanel()
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onPointer)
    window.addEventListener('resize', onMove)
    window.addEventListener('scroll', onMove, true)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onPointer)
      window.removeEventListener('resize', onMove)
      window.removeEventListener('scroll', onMove, true)
    }
  }, [open, placePanel, refresh])

  function applyRead(row: InboxNotification) {
    setRows((current) => current.map((item) => (item.id === row.id ? row : item)))
    setUnreadCount((current) => Math.max(0, current - 1))
  }

  async function markOne(id: string): Promise<boolean> {
    setPendingId(id)
    setError('')
    const result = await markNotificationRead(id)
    setPendingId(null)
    if (result.error || !result.row) {
      setError(UPDATE_ERROR)
      return false
    }
    applyRead(result.row)
    return true
  }

  async function dismissOne(item: InboxNotification) {
    setPendingId(item.id)
    setError('')
    const result = await dismissNotification(item.id)
    setPendingId(null)
    if (result.error || !result.ok) {
      setError(UPDATE_ERROR)
      return
    }
    setRows((current) => current.filter((row) => row.id !== item.id))
    if (item.status === 'unread') setUnreadCount((current) => Math.max(0, current - 1))
  }

  async function markAll() {
    setPendingAll(true)
    setError('')
    const result = await markAllNotificationsRead()
    setPendingAll(false)
    if (result.error) {
      setError(UPDATE_ERROR)
      return
    }
    await refresh()
  }

  async function openItem(item: InboxNotification) {
    let readOk = true
    if (item.status === 'unread') readOk = await markOne(item.id)

    if (item.subject_type === 'employee') {
      navigate(`/employees/${item.subject_id}`)
    } else if (item.subject_type === 'task') {
      navigate(`/tasks?task=${item.subject_id}`)
    } else {
      const resolved = await documentEmployeeId(item.subject_id)
      if (resolved.error || !resolved.employeeId) {
        setError(DOCUMENT_ERROR)
        return
      }
      navigate(`/employees/${resolved.employeeId}`)
    }

    if (readOk) setOpen(false)
  }

  const label = unreadCount > 0 ? `الإشعارات، ${badgeLabel(unreadCount)} غير مقروء` : 'الإشعارات'

  return (
    <div className="notify" ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        className="notify-bell"
        aria-label={label}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((current) => !current)}
      >
        <Bell size={18} aria-hidden="true" />
        {unreadCount > 0 && <span className="notify-badge">{badgeLabel(unreadCount)}</span>}
      </button>

      {open && panelStyle && (
        <div
          id={panelId}
          className="notify-panel"
          role="dialog"
          aria-label="الإشعارات"
          style={{ top: panelStyle.top, left: panelStyle.left, width: panelStyle.width }}
        >
          <div className="notify-head">
            <strong>الإشعارات</strong>
            {unreadCount > 0 && (
              <button type="button" className="btn btn-ghost btn-sm" disabled={pendingAll} onClick={() => void markAll()}>
                تعليم الكل كمقروء
              </button>
            )}
          </div>

          {error && <div className="alert alert-error">{error}</div>}

          {loading ? (
            <p className="empty">جارٍ التحميل…</p>
          ) : rows.length === 0 ? (
            <p className="empty">لا توجد إشعارات حالياً</p>
          ) : (
            <ul className="notify-list">
              {rows.map((item) => {
                const Icon = ICONS[item.alert_type]
                const busy = pendingId === item.id || pendingAll
                return (
                  <li key={item.id} className={item.status === 'unread' ? 'notify-item is-unread' : 'notify-item'}>
                    <button type="button" className="notify-open" disabled={busy} onClick={() => void openItem(item)}>
                      <span className="notify-icon" aria-hidden="true">
                        <Icon size={16} />
                      </span>
                      <span className="notify-copy">
                        <span className="notify-title">{notificationTitle(item.alert_type)}</span>
                        <span className="notify-summary">{item.summary}</span>
                        <span className="notify-meta">
                          {item.due_on && <span>الاستحقاق {formatEmployeeDate(item.due_on)}</span>}
                          <span>{formatDateTime(item.created_at)}</span>
                          <span>{item.status === 'unread' ? 'غير مقروء' : 'مقروء'}</span>
                        </span>
                      </span>
                    </button>
                    <div className="notify-actions">
                      {item.status === 'unread' && (
                        <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => void markOne(item.id)}>
                          تعليم كمقروء
                        </button>
                      )}
                      <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => void dismissOne(item)}>
                        تجاهل
                      </button>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
          {rows.length >= NOTIFICATION_LIST_LIMIT && <p className="notify-more">يُعرض أحدث {NOTIFICATION_LIST_LIMIT} إشعاراً</p>}
        </div>
      )}
    </div>
  )
}
