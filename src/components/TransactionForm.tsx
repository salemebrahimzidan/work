import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { errorMessage, linkedText } from '../lib/format'
import { useAuth } from '../auth/AuthProvider'
import { useCompany } from '../auth/CompanyProvider'
import { loadServiceCommissionMap, loadServiceQuoteCommissionMap } from '../lib/finance'
import { useCustomerOptions, useServicePrices } from '../lib/hooks'
import {
  billerCategories,
  billerCategoryLabel,
  isBillerCategory,
  isServiceCategory,
  serviceCategories,
  serviceCategoryLabel,
  type BillerCategory,
  type ServiceCategory,
} from '../lib/types'
import Modal from './Modal'
import SelectField, { ComboField } from './SelectField'

function amountField(value: string | number | null | undefined): string {
  if (value == null || value === '') return ''
  const amount = Number(value)
  return Number.isFinite(amount) ? String(amount) : ''
}

const fawateerPaymentLimit = 4000

function fawateerCommission(value: string): string | null {
  const trimmed = value.trim()
  if (trimmed === '') return null
  const amount = Number(trimmed)
  if (!Number.isFinite(amount) || amount < 0 || amount > fawateerPaymentLimit) return null
  if (amount <= 300) return '5.00'
  if (amount <= 1000) return '10.00'
  if (amount <= 1500) return '15.00'
  if (amount <= 2000) return '20.00'
  if (amount <= 2500) return '25.00'
  if (amount <= 3000) return '30.00'
  if (amount <= 3500) return '35.00'
  return '40.00'
}

interface Props {
  fixedCustomerId?: string
  onSaved: () => void
  onCancel: () => void
}

export default function TransactionForm({ fixedCustomerId, onSaved, onCancel }: Props) {
  const { session } = useAuth()
  const { canViewFinance, canViewServiceQuoteCommission, loading: companyLoading } = useCompany()
  const customers = useCustomerOptions()
  const { services } = useServicePrices()
  const [commissions, setCommissions] = useState<Record<string, string | null>>({})
  const [customerId, setCustomerId] = useState(fixedCustomerId ?? '')
  const [serviceCategory, setServiceCategory] = useState<ServiceCategory | ''>('')
  const [billerCategory, setBillerCategory] = useState<BillerCategory | ''>('')
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
    if (!canViewServiceQuoteCommission) {
      setCommissions({})
      setCommission('')
      return
    }
    let active = true
    const loadFees = canViewFinance ? loadServiceCommissionMap : loadServiceQuoteCommissionMap
    loadFees()
      .then((fees) => {
        if (active) setCommissions(fees)
      })
      .catch((loadError: unknown) => {
        if (active) setError(errorMessage(loadError))
      })
    return () => {
      active = false
    }
  }, [canViewFinance, canViewServiceQuoteCommission, companyLoading])

  const serviceReady = serviceCategory !== '' && (serviceCategory !== 'fawateer' || billerCategory !== '')
  const serviceNames = serviceReady
    ? services
        .filter(
          (item) =>
            item.category === serviceCategory &&
            (serviceCategory !== 'fawateer' || item.biller_category === billerCategory),
        )
        .map((item) => item.name)
    : []
  const selectedService =
    services.find(
      (item) =>
        item.name === serviceName &&
        item.category === serviceCategory &&
        (serviceCategory !== 'fawateer' || item.biller_category === billerCategory),
    ) ?? null

  useEffect(() => {
    if (!canViewServiceQuoteCommission || !selectedService || selectedService.manual) return
    if (selectedService.category === 'fawateer') return
    const value = amountField(selectedService.transaction_value)
    const fee = amountField(commissions[selectedService.id])
    if (value === '' || (canViewFinance && fee === '')) return
    setMissingPrice(false)
    setFromSystem(true)
    setTransactionValue(value)
    setCommission(fee)
  }, [canViewFinance, canViewServiceQuoteCommission, commissions, selectedService])

  function clearService() {
    setServiceName('')
    setTransactionValue('')
    setCommission('')
    setFromSystem(false)
    setMissingPrice(false)
    setStepsOpen(false)
    setError('')
  }

  function selectCategory(value: string) {
    setServiceCategory(isServiceCategory(value) ? value : '')
    setBillerCategory('')
    clearService()
  }

  function selectBiller(value: string) {
    setBillerCategory(isBillerCategory(value) ? value : '')
    clearService()
  }

  function selectService(name: string) {
    const trimmed = name.trim()
    const service = services.find(
      (item) =>
        item.name === trimmed &&
        item.category === serviceCategory &&
        (serviceCategory !== 'fawateer' || item.biller_category === billerCategory),
    )
    const fromAnotherType = services.some((item) => item.name === trimmed && item.category !== serviceCategory)
    const fromAnotherBiller =
      serviceCategory === 'fawateer' &&
      services.some(
        (item) => item.name === trimmed && item.category === 'fawateer' && item.biller_category !== billerCategory,
      )
    setStepsOpen(false)
    if (trimmed && serviceCategory && !serviceNames.includes(trimmed)) {
      setServiceName('')
      setTransactionValue('')
      setCommission('')
      setFromSystem(false)
      setMissingPrice(false)
      setError(
        fromAnotherBiller
          ? 'هذه الخدمة تتبع فئة مفوتر أخرى'
          : fromAnotherType
            ? 'هذه المعاملة تتبع نوع خدمة آخر'
            : serviceCategory === 'fawateer'
              ? 'اختر خدمة من فئة المفوتر المحددة'
              : 'اختر خدمة من نوع الخدمة المحدد',
      )
      return
    }
    setError('')
    setServiceName(trimmed)
    if (service?.category === 'fawateer') {
      setFromSystem(false)
      setMissingPrice(false)
      setTransactionValue('')
      setCommission('')
      return
    }
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
    const fee = canViewServiceQuoteCommission ? amountField(commissions[service.id]) : ''
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
    setCommission(fee)
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
    if (serviceCategory === 'fawateer' && !billerCategory) {
      setError('اختر فئة المفوتر')
      return
    }
    if (!serviceName.trim()) {
      setError('اختر الخدمة')
      return
    }

    const isFawateer = serviceCategory === 'fawateer'
    let valueAmount = Number.NaN
    let commissionAmount = Number.NaN

    if (isFawateer) {
      if (!selectedService) {
        setError('اختر الخدمة')
        return
      }
      const payment = transactionValue.trim()
      if (payment === '') {
        setError('أدخل قيمة السداد')
        return
      }
      valueAmount = Number(payment)
      if (!Number.isFinite(valueAmount) || valueAmount < 0) {
        setError('قيمة السداد غير صحيحة')
        return
      }
      if (valueAmount === 0) {
        setError('قيمة السداد يجب أن تكون أكبر من صفر')
        return
      }
      if (valueAmount > fawateerPaymentLimit) {
        setError('لا توجد عمولة محددة لقيمة سداد أكبر من 4000 ر.س')
        return
      }
    } else {
      if (!selectedService || selectedService.manual || transactionValue === '' || (canViewFinance && commission === '')) {
        setError('سعر هذه الخدمة غير محدد في النظام. يضيفه المشرف من صفحة أسعار الخدمات.')
        return
      }

      valueAmount = Number(transactionValue)
      if (!Number.isFinite(valueAmount) || valueAmount < 0) {
        setError('قيمة المعاملة غير صحيحة')
        return
      }
      commissionAmount = Number(commission)
      if (canViewFinance && (!Number.isFinite(commissionAmount) || commissionAmount < 0)) {
        setError('عمولة المكتب غير صحيحة')
        return
      }
    }

    setBusy(true)
    // Always INSERT a new row. The same service name must never update a previous transaction.
    // Catalog profit is copied by the database. Fawateer profit is calculated there from قيمة السداد.
    const { error: saveError } = await supabase.from('transactions').insert({
      customer_id: customerId,
      service_name: serviceName.trim(),
      transaction_value: valueAmount.toFixed(2),
      ...(canViewFinance && !isFawateer ? { profit: commissionAmount.toFixed(2) } : {}),
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

        {serviceCategory === 'fawateer' && (
          <div className="field full">
            <label htmlFor="biller-category">فئة المفوتر *</label>
            <SelectField
              id="biller-category"
              value={billerCategory}
              onChange={selectBiller}
              options={[
                { value: '', label: '— اختر فئة المفوتر —' },
                ...billerCategories.map((key) => ({
                  value: key,
                  label: billerCategoryLabel[key],
                })),
              ]}
            />
          </div>
        )}

        {serviceReady && (
          <div className="field full">
            <label htmlFor="service">اسم المعاملة / الخدمة *</label>
            <ComboField
              key={`${serviceCategory}:${billerCategory}`}
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

        {serviceCategory === 'fawateer' && (
          <div className="field full">
            <label htmlFor="note">رقم الفاتورة</label>
            <input
              id="note"
              dir="ltr"
              type="text"
              inputMode="text"
              autoComplete="off"
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </div>
        )}

        <div className="field">
          <label htmlFor="transaction_value">
            {serviceCategory === 'fawateer' ? 'قيمة السداد (ر.س) *' : 'قيمة المعاملة (ر.س) *'}
          </label>
          <input
            id="transaction_value"
            disabled={serviceCategory !== 'fawateer'}
            readOnly={serviceCategory !== 'fawateer'}
            dir="ltr"
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            value={transactionValue}
            onChange={(event) => {
              if (serviceCategory !== 'fawateer') return
              const value = event.target.value
              setTransactionValue(value)
              setCommission(fawateerCommission(value) ?? '')
              setError('')
            }}
          />
        </div>

        {canViewServiceQuoteCommission && (
          <div className="field">
            <label htmlFor="commission">عمولة المكتب (ر.س)</label>
            <input
              id="commission"
              disabled
              readOnly
              dir="ltr"
              type="text"
              value={
                serviceCategory === 'fawateer'
                  ? fawateerCommission(transactionValue)
                    ? `${fawateerCommission(transactionValue)} ر.س`
                    : '—'
                  : commission || '—'
              }
            />
          </div>
        )}

        {serviceCategory === 'fawateer' && Number(transactionValue) > fawateerPaymentLimit && (
          <p className="note-line" style={{ gridColumn: '1 / -1', margin: 0 }}>
            لا توجد عمولة محددة لقيمة سداد أكبر من 4000 ر.س
          </p>
        )}

        {serviceCategory !== 'fawateer' && (fromSystem || missingPrice) && (
          <p className="note-line" style={{ gridColumn: '1 / -1', margin: 0 }}>
            {fromSystem
              ? canViewFinance
                ? 'قيمة المعاملة وعمولة المكتب تُعبأ تلقائياً من أسعار الخدمة.'
                : 'قيمة المعاملة وعمولة المكتب تُعرضان من أسعار الخدمة لتسعير العميل.'
              : 'سعر هذه الخدمة غير محدد بعد. يضيفه المشرف من صفحة أسعار الخدمات.'}
          </p>
        )}

        {serviceCategory !== 'fawateer' && (
          <div className="field full">
            <label htmlFor="note">ملاحظة (اختياري)</label>
            <textarea id="note" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        )}
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
