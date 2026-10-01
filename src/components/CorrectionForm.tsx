import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { errorMessage, formatDateTime, money } from '../lib/format'
import { useAuth } from '../auth/AuthProvider'
import type { TransactionDetail } from '../lib/types'

interface Props {
  transaction: TransactionDetail
  onSaved: () => void
  onCancel: () => void
}

export default function CorrectionForm({ transaction, onSaved, onCancel }: Props) {
  const { session, profile } = useAuth()
  const [corrected, setCorrected] = useState('')
  const [reason, setReason] = useState('')
  const [openedAt] = useState(() => new Date().toISOString())
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError('')

    const amount = Number(corrected)
    if (!Number.isFinite(amount) || amount < 0) {
      setError('المبلغ المصحح غير صحيح')
      return
    }
    if (reason.trim().length < 3) {
      setError('سبب التصحيح مطلوب')
      return
    }

    setBusy(true)
    // previous_profit والتاريخ والمشرف تُسجَّل في قاعدة البيانات تلقائياً
    const { error: saveError } = await supabase.from('profit_corrections').insert({
      transaction_id: transaction.id,
      corrected_profit: amount.toFixed(2),
      reason: reason.trim(),
      admin_id: session?.user.id,
      previous_profit: transaction.effective_profit,
    })
    setBusy(false)

    if (saveError) {
      setError(errorMessage(saveError))
      return
    }
    onSaved()
  }

  return (
    <form onSubmit={handleSubmit}>
      {error && <div className="alert alert-error">{error}</div>}

      <div className="alert alert-info">
        لا يتم حذف الربح الأصلي. يُسجَّل التصحيح كسجل جديد ويُستخدم المبلغ المصحح في التقارير.
      </div>

      <div className="detail-list" style={{ marginBottom: 14 }}>
        <div className="detail-item">
          <div className="stat-label">المعاملة</div>
          <div className="value">{transaction.service_name}</div>
        </div>
        <div className="detail-item">
          <div className="stat-label">العميل</div>
          <div className="value">{transaction.customer_name}</div>
        </div>
        <div className="detail-item">
          <div className="stat-label">الربح الأصلي</div>
          <div className="value num">{money(transaction.original_profit)}</div>
        </div>
        <div className="detail-item">
          <div className="stat-label">الربح الحالي المعتمد</div>
          <div className="value num">{money(transaction.effective_profit)}</div>
        </div>
      </div>

      <div className="form-grid">
        <div className="field">
          <label htmlFor="corrected">الربح المصحح (ر.س) *</label>
          <input
            id="corrected"
            required
            dir="ltr"
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            value={corrected}
            onChange={(e) => setCorrected(e.target.value)}
          />
        </div>

        <div className="field">
          <label htmlFor="correction-date">تاريخ التصحيح</label>
          <input
            id="correction-date"
            value={formatDateTime(openedAt)}
            readOnly
            disabled
          />
        </div>

        <div className="field full">
          <label htmlFor="correction-admin">المشرف</label>
          <input
            id="correction-admin"
            value={profile?.full_name || session?.user.email || ''}
            readOnly
            disabled
          />
        </div>

        <div className="field full">
          <label htmlFor="reason">سبب التصحيح *</label>
          <textarea
            id="reason"
            required
            minLength={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>
      </div>

      <div className="form-actions">
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? 'جارٍ الحفظ…' : 'حفظ التصحيح'}
        </button>
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          إلغاء
        </button>
      </div>
    </form>
  )
}
