import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { errorMessage, formatDate, money, transactionStatus } from '../lib/format'
import { supabase } from '../lib/supabase'
import type { TransactionDetail } from '../lib/types'

export default function TransactionDetails() {
  const { id = '' } = useParams()
  const { isAdmin } = useAuth()
  const [row, setRow] = useState<TransactionDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    const { data, error: queryError } = await supabase
      .from('transaction_details')
      .select('*')
      .eq('id', id)
      .maybeSingle()

    if (queryError) setError(errorMessage(queryError))
    else setRow((data as TransactionDetail | null) ?? null)
    setLoading(false)
  }, [id])

  useEffect(() => {
    void load()
  }, [load])

  if (loading) {
    return <div className="empty">جارٍ التحميل…</div>
  }

  if (error || !row) {
    return (
      <>
        <div className="page-head">
          <h1>المعاملة</h1>
        </div>
        <div className="card">
          <p className="muted">{error || 'المعاملة غير موجودة.'}</p>
          <Link to="/transactions">رجوع إلى المعاملات</Link>
        </div>
      </>
    )
  }

  const status = transactionStatus(row.status)
  const open = row.status === 'pending' || row.status === 'in_progress'

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{row.service_name}</h1>
          <p className="page-sub">
            <Link to="/transactions">المعاملات</Link>
            {' / '}
            {row.customer_name}
          </p>
        </div>
        <span className={status.badge}>{status.label}</span>
      </div>

      <div className="card">
        <div className="profile-grid">
          <Item label="العميل" value={row.customer_name} href={`/customers/${row.customer_id}`} />
          <Item label="الجوال" value={row.customer_mobile} ltr />
          <Item label="المعاملة" value={row.service_name} />
          <Item
            label="قيمة المعاملة"
            value={row.transaction_value == null ? '—' : money(row.transaction_value)}
          />
          {isAdmin && <Item label="عمولة المكتب" value={money(row.original_profit)} />}
          <Item label="التاريخ" value={formatDate(row.created_at)} />
          <Item label="المدينة" value={row.city || '—'} />
          <Item label="الجنسية" value={row.nationality || '—'} />
        </div>
        {row.note && (
          <div className="profile-notes">
            <div className="profile-label">ملاحظة</div>
            <div className="profile-value">{row.note}</div>
          </div>
        )}
        {row.status === 'cancelled' && row.cancel_reason && (
          <div className="profile-notes">
            <div className="profile-label">سبب الإلغاء</div>
            <div className="profile-value">{row.cancel_reason}</div>
          </div>
        )}
      </div>

      {open && <StatusActions row={row} onChanged={() => void load()} />}
    </>
  )
}

function Item({
  label,
  value,
  ltr,
  href,
}: {
  label: string
  value: string
  ltr?: boolean
  href?: string
}) {
  const empty = value === '—'
  return (
    <div className={empty ? 'profile-field is-empty' : 'profile-field'}>
      <div className="profile-label">{label}</div>
      <div className={ltr ? 'profile-value num' : 'profile-value'} dir={ltr ? 'ltr' : undefined}>
        {href ? <Link to={href}>{value}</Link> : value}
      </div>
    </div>
  )
}

function StatusActions({ row, onChanged }: { row: TransactionDetail; onChanged: () => void }) {
  const [mode, setMode] = useState<'cancel' | null>(null)
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function changeStatus(next: 'in_progress' | 'completed' | 'cancelled', cancelReason?: string) {
    setError('')
    setBusy(true)
    const { error: saveError } = await supabase.rpc('set_transaction_status', {
      p_transaction_id: row.id,
      p_status: next,
      p_reason: cancelReason ?? null,
    })
    setBusy(false)
    if (saveError) {
      setError(errorMessage(saveError))
      return
    }
    setMode(null)
    setReason('')
    onChanged()
  }

  async function confirmCancel(event: React.FormEvent) {
    event.preventDefault()
    if (!reason.trim()) {
      setError('سبب الإلغاء مطلوب')
      return
    }
    await changeStatus('cancelled', reason.trim())
  }

  return (
    <div className="card">
      <h2 className="card-title">تغيير الحالة</h2>
      {error && <div className="alert alert-error">{error}</div>}
      <div className="status-panel">
        {row.status === 'pending' && (
          <button
            type="button"
            className="status-choice progress"
            disabled={busy}
            onClick={() => {
              setMode(null)
              void changeStatus('in_progress')
            }}
          >
            <strong>قيد التنفيذ</strong>
            <small>بدء العمل على المعاملة</small>
          </button>
        )}
        {row.status === 'in_progress' && (
          <button
            type="button"
            className="status-choice complete"
            disabled={busy}
            onClick={() => {
              setMode(null)
              void changeStatus('completed')
            }}
          >
            <strong>مكتملة</strong>
            <small>إنهاء المعاملة وحفظها مكتملة</small>
          </button>
        )}
        <button
          type="button"
          className={mode === 'cancel' ? 'status-choice cancel is-selected' : 'status-choice cancel'}
          disabled={busy}
          onClick={() => {
            setError('')
            setMode('cancel')
          }}
        >
          <strong>ملغاة</strong>
          <small>إلغاء المعاملة مع ذكر السبب</small>
        </button>
      </div>

      {mode === 'cancel' && (
        <form className="status-cancel-form" onSubmit={(event) => void confirmCancel(event)}>
          <div className="field">
            <label htmlFor="cancel-reason">سبب الإلغاء *</label>
            <textarea
              id="cancel-reason"
              required
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="اكتب سبب الإلغاء"
            />
          </div>
          <div className="form-actions">
            <button type="submit" className="btn btn-danger" disabled={busy}>
              {busy ? 'جارٍ الإلغاء…' : 'تأكيد الإلغاء'}
            </button>
            <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => setMode(null)}>
              رجوع
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
