import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { supabase } from '../lib/supabase'
import { errorMessage, formatDateTime } from '../lib/format'
import {
  activityEventLabel,
  activitySubjectLabel,
  isActivityEvent,
  readActivity,
  type ActivityRow,
} from '../lib/activity'

const COLUMNS = 'id, actor_id, event_type, subject_type, subject_id, summary, created_at'

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

  return (
    <section className="card">
      <h2 className="card-title">سجل النشاط</h2>
      {error && <div className="alert alert-error">{error}</div>}
      {loading ? (
        <div className="empty">جارٍ التحميل…</div>
      ) : rows.length === 0 ? (
        <div className="empty">لا يوجد نشاط</div>
      ) : (
        <ol className="activity-list">
          {rows.map((row) => (
            <li key={row.id}>
              <div className="activity-head">
                <strong>{isActivityEvent(row.event_type) ? activityEventLabel[row.event_type] : 'نشاط'}</strong>
                <span className="num" dir="ltr">
                  {formatDateTime(row.created_at)}
                </span>
              </div>
              <p className="activity-summary">{row.summary}</p>
              <div className="employee-card-meta">
                <span>{actorLabel(row.actor_id)}</span>
                <span>{activitySubjectLabel[row.subject_type] || 'سجل'}</span>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
