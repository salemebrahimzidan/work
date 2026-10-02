import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { errorMessage } from '../lib/format'
import type { ServicePrice } from '../lib/types'

function amountField(value: string | null): string {
  if (value == null || value === '') return ''
  const amount = Number(value)
  return Number.isFinite(amount) ? String(amount) : ''
}

export default function Services() {
  const [rows, setRows] = useState<ServicePrice[]>([])
  const [drafts, setDrafts] = useState<Record<string, { transaction_value: string; commission: string }>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [savingId, setSavingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    const { data, error: queryError } = await supabase
      .from('services')
      .select('id, name, transaction_value, commission, manual, sort_order')
      .order('sort_order')

    if (queryError) {
      const message = errorMessage(queryError)
      setError(
        /schema cache|relation .*services/i.test(message)
          ? 'جدول أسعار الخدمات غير جاهز. شغّل ملف 0008_service_prices.sql في Supabase ثم حدّث الصفحة.'
          : message,
      )
      setRows([])
    } else {
      const list = (data ?? []) as ServicePrice[]
      setRows(list)
      setDrafts(
        Object.fromEntries(
          list.map((row) => [
            row.id,
            {
              transaction_value: amountField(row.transaction_value),
              commission: amountField(row.commission),
            },
          ]),
        ),
      )
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  function setDraft(id: string, key: 'transaction_value' | 'commission', value: string) {
    setDrafts((current) => ({
      ...current,
      [id]: { ...current[id], [key]: value },
    }))
  }

  async function save(row: ServicePrice) {
    const draft = drafts[row.id]
    const valueAmount = Number(draft?.transaction_value)
    const commissionAmount = Number(draft?.commission)
    if (
      !draft ||
      draft.transaction_value === '' ||
      draft.commission === '' ||
      !Number.isFinite(valueAmount) ||
      valueAmount < 0 ||
      !Number.isFinite(commissionAmount) ||
      commissionAmount < 0
    ) {
      setError('أدخل قيمة المعاملة وعمولة المكتب')
      return
    }

    setSavingId(row.id)
    setError('')
    const { error: saveError } = await supabase
      .from('services')
      .update({
        transaction_value: valueAmount.toFixed(2),
        commission: commissionAmount.toFixed(2),
      })
      .eq('id', row.id)
    setSavingId(null)

    if (saveError) {
      setError(errorMessage(saveError))
      return
    }
    void load()
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>أسعار الخدمات</h1>
          <p className="page-sub">
            عند اختيار الخدمة في معاملة جديدة تُعبأ قيمة المعاملة وعمولة المكتب من هنا.
          </p>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>الخدمة</th>
                <th>قيمة المعاملة (ر.س)</th>
                <th>عمولة المكتب (ر.س)</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>{row.name}</td>
                  {row.manual ? (
                    <td colSpan={3} className="muted">
                      تُدخل يدوياً عند إضافة المعاملة
                    </td>
                  ) : (
                    <>
                      <td>
                        <input
                          dir="ltr"
                          type="number"
                          min="0"
                          step="0.01"
                          inputMode="decimal"
                          aria-label={`قيمة المعاملة لـ ${row.name}`}
                          value={drafts[row.id]?.transaction_value ?? ''}
                          onChange={(event) => setDraft(row.id, 'transaction_value', event.target.value)}
                        />
                      </td>
                      <td>
                        <input
                          dir="ltr"
                          type="number"
                          min="0"
                          step="0.01"
                          inputMode="decimal"
                          aria-label={`عمولة المكتب لـ ${row.name}`}
                          value={drafts[row.id]?.commission ?? ''}
                          onChange={(event) => setDraft(row.id, 'commission', event.target.value)}
                        />
                      </td>
                      <td>
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          disabled={savingId === row.id}
                          onClick={() => void save(row)}
                        >
                          {savingId === row.id ? 'جارٍ الحفظ…' : 'حفظ'}
                        </button>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && (
            <div className="empty">{loading ? 'جارٍ التحميل…' : 'لا توجد خدمات'}</div>
          )}
        </div>
      </div>
    </>
  )
}
