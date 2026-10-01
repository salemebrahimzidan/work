import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { errorMessage } from '../lib/format'
import { useAuth } from '../auth/AuthProvider'
import { useCustomerOptions } from '../lib/hooks'
import SelectField from './SelectField'

const SERVICES = [
  'تجديد إقامة',
  'نقل كفالة',
  'إصدار تأشيرة',
  'تجديد رخصة',
  'تأمين طبي',
  'خروج وعودة',
  'تجديد جواز',
  'خدمة أخرى',
]

interface Props {
  fixedCustomerId?: string
  onSaved: () => void
  onCancel: () => void
}

export default function TransactionForm({ fixedCustomerId, onSaved, onCancel }: Props) {
  const { session } = useAuth()
  const customers = useCustomerOptions()
  const [customerId, setCustomerId] = useState(fixedCustomerId ?? '')
  const [serviceName, setServiceName] = useState('')
  const [profit, setProfit] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError('')

    if (!customerId) {
      setError('اختر العميل')
      return
    }

    const amount = Number(profit)
    if (!Number.isFinite(amount) || amount < 0) {
      setError('قيمة الربح غير صحيحة')
      return
    }

    setBusy(true)
    // Always INSERT a new row. The same service name must never update a previous transaction.
    const { error: saveError } = await supabase.from('transactions').insert({
      customer_id: customerId,
      service_name: serviceName.trim(),
      profit: amount.toFixed(2),
      note: note.trim() || null,
      created_by: session?.user.id,
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
        تنبيه: بعد الحفظ يصبح مبلغ الربح مُقفلاً ولا يمكن تعديله أو حذفه.
      </div>

      <div className="form-grid">
        {!fixedCustomerId && (
          <div className="field full">
            <label htmlFor="customer">العميل *</label>
            <SelectField
              id="customer"
              value={customerId}
              onChange={setCustomerId}
              options={[
                { value: '', label: '— اختر العميل —' },
                ...customers.map((customer) => ({
                  value: customer.id,
                  label: `${customer.full_name} — ${customer.mobile}`,
                })),
              ]}
            />
          </div>
        )}

        <div className="field">
          <label htmlFor="service">اسم المعاملة / الخدمة *</label>
          <input
            id="service"
            required
            list="service-options"
            value={serviceName}
            onChange={(e) => setServiceName(e.target.value)}
          />
          <datalist id="service-options">
            {SERVICES.map((item) => (
              <option key={item} value={item} />
            ))}
          </datalist>
        </div>

        <div className="field">
          <label htmlFor="profit">مبلغ الربح (ر.س) *</label>
          <input
            id="profit"
            required
            dir="ltr"
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            value={profit}
            onChange={(e) => setProfit(e.target.value)}
          />
        </div>

        <div className="field full">
          <label htmlFor="note">ملاحظة (اختياري)</label>
          <textarea id="note" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
      </div>

      <div className="form-actions">
        <button type="submit" className="btn btn-primary" disabled={busy || !customerId}>
          {busy ? 'جارٍ الحفظ…' : 'حفظ'}
        </button>
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          إلغاء
        </button>
      </div>
    </form>
  )
}
