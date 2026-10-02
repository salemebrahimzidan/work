import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { errorMessage } from '../lib/format'
import { useAuth } from '../auth/AuthProvider'
import { useCustomerOptions, useServicePrices } from '../lib/hooks'
import SelectField, { ComboField } from './SelectField'

const SERVICES = [
  'تجديد إقامة',
  'نقل كفالة',
  'إصدار تأشيرة',
  'تجديد رخصة',
  'تأمين طبي',
  'خروج وعودة',
  'تجديد جواز',
]

function amountField(value: string | number | null | undefined): string {
  if (value == null || value === '') return ''
  const amount = Number(value)
  return Number.isFinite(amount) ? String(amount) : ''
}

interface Props {
  fixedCustomerId?: string
  onSaved: () => void
  onCancel: () => void
}

export default function TransactionForm({ fixedCustomerId, onSaved, onCancel }: Props) {
  const { session } = useAuth()
  const customers = useCustomerOptions()
  const { services } = useServicePrices()
  const [customerId, setCustomerId] = useState(fixedCustomerId ?? '')
  const [serviceName, setServiceName] = useState('')
  const [transactionValue, setTransactionValue] = useState('')
  const [commission, setCommission] = useState('')
  const [fromSystem, setFromSystem] = useState(false)
  const [missingPrice, setMissingPrice] = useState(false)
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const serviceNames = services.length > 0 ? services.map((item) => item.name) : SERVICES

  function selectService(name: string) {
    setServiceName(name)
    const service = services.find((item) => item.name === name)
    if (!service || service.manual) {
      if (fromSystem) {
        setTransactionValue('')
        setCommission('')
      }
      setFromSystem(false)
      setMissingPrice(false)
      return
    }
    const value = amountField(service.transaction_value)
    const fee = amountField(service.commission)
    if (value === '' || fee === '') {
      setFromSystem(false)
      setMissingPrice(true)
      setTransactionValue('')
      setCommission('')
      return
    }
    setMissingPrice(false)
    setFromSystem(true)
    setTransactionValue(value)
    setCommission(fee)
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError('')

    if (!customerId) {
      setError('اختر العميل')
      return
    }

    if (transactionValue === '' || commission === '') {
      setError('سعر هذه الخدمة غير محدد في النظام. يضيفه المشرف من صفحة أسعار الخدمات.')
      return
    }

    const valueAmount = Number(transactionValue)
    const commissionAmount = Number(commission)
    if (!Number.isFinite(valueAmount) || valueAmount < 0) {
      setError('قيمة المعاملة غير صحيحة')
      return
    }
    if (!Number.isFinite(commissionAmount) || commissionAmount < 0) {
      setError('عمولة المكتب غير صحيحة')
      return
    }

    setBusy(true)
    // Always INSERT a new row. The same service name must never update a previous transaction.
    const { error: saveError } = await supabase.from('transactions').insert({
      customer_id: customerId,
      service_name: serviceName.trim(),
      transaction_value: valueAmount.toFixed(2),
      profit: commissionAmount.toFixed(2),
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
          <ComboField
            id="service"
            required
            value={serviceName}
            onChange={selectService}
            options={serviceNames}
          />
        </div>

        <div className="field">
          <label htmlFor="transaction_value">قيمة المعاملة (ر.س) *</label>
          <input
            id="transaction_value"
            disabled
            dir="ltr"
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            value={transactionValue}
          />
        </div>

        <div className="field">
          <label htmlFor="commission">عمولة المكتب (ر.س) *</label>
          <input
            id="commission"
            disabled
            dir="ltr"
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            value={commission}
          />
        </div>

        {(fromSystem || missingPrice) && (
          <p className="note-line" style={{ gridColumn: '1 / -1', margin: 0 }}>
            {fromSystem
              ? 'قيمة المعاملة وعمولة المكتب تُعبأ تلقائياً من أسعار الخدمة.'
              : 'سعر هذه الخدمة غير محدد بعد. يضيفه المشرف من صفحة أسعار الخدمات.'}
          </p>
        )}

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
