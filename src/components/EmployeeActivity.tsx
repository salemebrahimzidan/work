import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { supabase } from '../lib/supabase'
import { count, errorMessage, formatDate } from '../lib/format'
import {
  activityEventLabel,
  activitySubjectLabel,
  isActivityEvent,
  readActivity,
  type ActivityRow,
} from '../lib/activity'

const COLUMNS = 'id, actor_id, event_type, subject_type, subject_id, summary, created_at'

const timeFormatter = new Intl.DateTimeFormat('en-GB', {
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
  timeZone: 'Asia/Riyadh',
})

function formatTime(value: string) {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return '—'
  return timeFormatter.format(parsed)
}

function activityBadge(event: string) {
  if (event.endsWith('.completed') || event === 'employee.created') return 'badge badge-completed'
  if (event.endsWith('.cancelled') || event.endsWith('.deleted')) return 'badge badge-cancelled'
  if (event.endsWith('.reopened')) return 'badge badge-pending'
  if (event.endsWith('.updated')) return 'badge badge-progress'
  if (event.endsWith('.created')) return 'badge badge-admin'
  return 'badge badge-locked'
}

function activityTone(event: string) {
  if (event.endsWith('.completed') || event === 'employee.created') return 'is-done'
  if (event.endsWith('.cancelled') || event.endsWith('.deleted')) return 'is-bad'
  if (event.endsWith('.reopened')) return 'is-warn'
  if (event.endsWith('.updated')) return 'is-info'
  return ''
}

export default function EmployeeActivity({ employeeId }: { employeeId: string }) {
  const { session, profile } = useAuth()
  const userId = session?.user.id ?? ''
  const [rows, setRows] = useState<ActivityRow[]>([])
  const [names, setNames] = useState<Map<string, string>>(new Map())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    if (!employeeId) return
    setLoading(true)
    setError('')
    const { data, error: queryError } = await supabase
      .from('company_activity')
      .select(COLUMNS)
      .eq('employee_id', employeeId)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
    if (queryError) {
      setRows([])
      setError(errorMessage(queryError))
      setLoading(false)
      return
    }
    const next = (data ?? [])
      .map((row) => readActivity(row as Record<string, unknown>))
      .filter((row): row is ActivityRow => row !== null)
    const actorIds = [...new Set(next.map((row) => row.actor_id).filter((id): id is string => Boolean(id)))]
    const nextNames = new Map<string, string>()
    if (actorIds.length > 0) {
      const profilesRes = await supabase.from('profiles').select('id, full_name').in('id', actorIds)
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
    setRows(next)
    setLoading(false)
  }, [employeeId, profile?.full_name, session?.user.email, userId])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    const refresh = () => void load()
    window.addEventListener('employee-activity', refresh)
    return () => window.removeEventListener('employee-activity', refresh)
  }, [load])

  function actorLabel(actorId: string | null) {
    if (!actorId) return 'مستخدم'
    return names.get(actorId) || 'مستخدم'
  }

  const today = formatDate(new Date().toISOString())
  const groups = useMemo(() => {
    const map = new Map<string, ActivityRow[]>()
    for (const row of rows) {
      const key = formatDate(row.created_at)
      const list = map.get(key)
      if (list) list.push(row)
      else map.set(key, [row])
    }
    return [...map.entries()]
  }, [rows])

  return (
    <section className="card">
      <div className="activity-toolbar">
        <h2 className="card-title">سجل النشاط</h2>
        {!loading && rows.length > 0 && <span className="badge badge-locked">{count(rows.length)}</span>}
      </div>
      {error && <div className="alert alert-error">{error}</div>}
      {loading ? (
        <div className="empty">جارٍ التحميل…</div>
      ) : rows.length === 0 ? (
        <div className="empty">لا يوجد نشاط</div>
      ) : (
        <div className="activity-days">
          {groups.map(([day, items]) => (
            <section key={day}>
              <h3 className="activity-day">{day === today ? `اليوم — ${day}` : day}</h3>
              <ol className="activity-list">
                {items.map((row) => (
                  <li key={row.id} className={activityTone(row.event_type)}>
                    <span className="activity-mark" aria-hidden="true" />
                    <div className="activity-body">
                      <div className="activity-head">
                        <span className={activityBadge(row.event_type)}>
                          {isActivityEvent(row.event_type) ? activityEventLabel[row.event_type] : 'نشاط'}
                        </span>
                        <p className="activity-summary">
                          <bdi>{row.summary}</bdi>
                        </p>
                        <time className="num" dir="ltr" dateTime={row.created_at}>
                          {formatTime(row.created_at)}
                        </time>
                      </div>
                      <p className="activity-meta">
                        {actorLabel(row.actor_id)}
                        <span aria-hidden="true"> · </span>
                        {activitySubjectLabel[row.subject_type] || 'سجل'}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          ))}
        </div>
      )}
    </section>
  )
}
