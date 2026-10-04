import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { errorMessage, linkedText } from '../lib/format'
import { useAuth } from '../auth/AuthProvider'
import { useCompany } from '../auth/CompanyProvider'
import { loadServiceCommissionMap } from '../lib/finance'
import { useCustomerOptions, useServicePrices } from '../lib/hooks'
import { isServiceCategory, serviceCategories, serviceCategoryLabel, type ServiceCategory } from '../lib/types'
import Modal from './Modal'
import SelectField, { ComboField } from './SelectField'

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
  const { canViewFinance, loading: companyLoading } = useCompany()
  const customers = useCustomerOptions()
  const { services } = useServicePrices()
  const [commissions, setCommissions] = useState<Record<string, string | null>>({})
  const [customerId, setCustomerId] = useState(fixedCustomerId ?? '')
  const [serviceCategory, setServiceCategory] = useState<ServiceCategory | ''>('')
  const [serviceName, setServiceName] = useState('')
  const [transactionValue, setTransactionValue] = useState('')
  const [commission, setCommission] = useState('')
  const [fromSystem, setFromSystem] = useState(false)
  const [missingPrice, setMissingPrice] = useState(false)
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [stepsOpen, setStepsOpen] = useState(false)

  useEffect(() => {
    if (companyLoading) return
    if (!canViewFinance) {
      setCommissions({})
      setCommission('')
      return
    }
    let active = true
    loadServiceCommissionMap()
      .then((fees) => {
        if (active) setCommissions(fees)
      })
      .catch((loadError: unknown) => {
        if (active) setError(errorMessage(loadError))
      })
    return () => {
      active = false
    }
  }, [canViewFinance, companyLoading])

  const serviceNames =
    serviceCategory === '' ? [] : services.filter((item) => item.category === serviceCategory).map((item) => item.name)
  const selectedService =
    services.find((item) => item.name === serviceName && item.category === serviceCategory) ?? null

  useEffect(() => {
    if (!canViewFinance || !selectedService || selectedService.manual) return
    const value = amountField(selectedService.transaction_value)
    const fee = amountField(commissions[selectedService.id])
    if (value === '' || fee === '') return
    setMissingPrice(false)
    setFromSystem(true)
    setTransactionValue(value)
    setCommission(fee)
  }, [canViewFinance, commissions, selectedService])

  function selectCategory(value: string) {
    setServiceCategory(isServiceCategory(value) ? value : '')
    setServiceName('')
    setTransactionValue('')
    setCommission('')
    setFromSystem(false)
    setMissingPrice(false)
    setStepsOpen(false)
    setError('')
  }

  function selectService(name: string) {
    const trimmed = name.trim()
    const service = services.find((item) => item.name === trimmed && item.category === serviceCategory)
    const fromAnotherType = services.some((item) => item.name === trimmed && item.category !== serviceCategory)
    setStepsOpen(false)
    if (trimmed && serviceCategory && !serviceNames.includes(trimmed)) {
      setServiceName('')
      setTransactionValue('')
      setCommission('')
      setFromSystem(false)
      setMissingPrice(false)
      setError(fromAnotherType ? 'هذه المعاملة تتبع نوع خدمة آخر' : 'اختر خدمة من نوع الخدمة المحدد')
      return
    }
    setError('')
    setServiceName(trimmed)
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
    const fee = canViewFinance ? amountField(commissions[service.id]) : ''
    if (value === '' || (canViewFinance && fee === '')) {
      setFromSystem(false)
      setMissingPrice(true)
      setTransactionValue('')
      setCommission('')
      return
    }
    setMissingPrice(false)
    setFromSystem(true)
    setTransactionValue(value)
    setCommission(canViewFinance ? fee : '')
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError('')

    if (!customerId) {
      setError('اختر العميل')
      return
    }
    if (!serviceCategory) {
      setError('اختر نوع الخدمة')
      return
    }
    if (!serviceName.trim()) {
      setError('اختر الخدمة')
      return
    }

    if (!selectedService || selectedService.manual || transactionValue === '' || (canViewFinance && commission === '')) {
      setError('سعر هذه الخدمة غير محدد في النظام. يضيفه المشرف من صفحة أسعار الخدمات.')
      return
    }

    const valueAmount = Number(transactionValue)
    if (!Number.isFinite(valueAmount) || valueAmount < 0) {
      setError('قيمة المعاملة غير صحيحة')
      return
    }
    const commissionAmount = Number(commission)
    if (canViewFinance && (!Number.isFinite(commissionAmount) || commissionAmount < 0)) {
      setError('عمولة المكتب غير صحيحة')
      return
    }

    setBusy(true)
    // Always INSERT a new row. The same service name must never update a previous transaction.
    // Catalog profit is copied by the database. Manager/user do not send it.
    const { error: saveError } = await supabase.from('transactions').insert({
      customer_id: customerId,
      service_name: serviceName.trim(),
      transaction_value: valueAmount.toFixed(2),
      ...(canViewFinance ? { profit: commissionAmount.toFixed(2) } : {}),
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

        <div className="field full">
          <label htmlFor="service-type">نوع الخدمة *</label>
          <SelectField
            id="service-type"
            value={serviceCategory}
            onChange={selectCategory}
            options={[
              { value: '', label: '— اختر نوع الخدمة —' },
              ...serviceCategories.map((category) => ({
                value: category,
                label: serviceCategoryLabel[category],
              })),
            ]}
          />
        </div>

        {serviceCategory && (
          <div className="field full">
            <label htmlFor="service">اسم المعاملة / الخدمة *</label>
            <ComboField
              key={serviceCategory}
              id="service"
              required
              onlyOptions
              value={serviceName}
              onChange={selectService}
              options={serviceNames}
            />
            {selectedService && (
              <button type="button" className="btn btn-ghost btn-sm service-steps-btn" onClick={() => setStepsOpen(true)}>
                الخطوات
              </button>
            )}
          </div>
        )}

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

        {canViewFinance && (
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
        )}

        {(fromSystem || missingPrice) && (
          <p className="note-line" style={{ gridColumn: '1 / -1', margin: 0 }}>
            {fromSystem
              ? canViewFinance
                ? 'قيمة المعاملة وعمولة المكتب تُعبأ تلقائياً من أسعار الخدمة.'
                : 'قيمة المعاملة تُعبأ تلقائياً من أسعار الخدمة.'
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

      <Modal title="الخطوات" subtitle={serviceName} center raised open={stepsOpen} onClose={() => setStepsOpen(false)}>
        {selectedService?.steps?.trim() ? (
          <p className="service-steps">{linkedText(selectedService.steps)}</p>
        ) : (
          <p className="muted">لم تُضف خطوات لهذه الخدمة بعد. يمكن للمشرف كتابتها من صفحة الخدمة.</p>
        )}
      </Modal>
    </form>
  )
}
