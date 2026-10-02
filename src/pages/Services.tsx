import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { errorMessage } from '../lib/format'
import type { ServicePrice } from '../lib/types'

function amountField(value: string | null): string {
  if (value == null || value === '') return ''
  const amount = Number(value)
  return Number.isFinite(amount) ? String(amount) : ''
}

function validAmount(value: string): boolean {
  if (value === '') return false
  const amount = Number(value)
  return Number.isFinite(amount) && amount >= 0
}

export default function Services() {
  const [rows, setRows] = useState<ServicePrice[]>([])
  const [drafts, setDrafts] = useState<Record<string, { transaction_value: string; commission: string }>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [savingId, setSavingId] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const [newValue, setNewValue] = useState('')
  const [newCommission, setNewCommission] = useState('')
  const [adding, setAdding] = useState(false)

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
    if (!draft || !validAmount(draft.transaction_value) || !validAmount(draft.commission)) {
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

  async function addService() {
    const name = newName.trim()
    const valueAmount = Number(newValue)
    const commissionAmount = Number(newCommission)
    if (!name) {
      setError('أدخل اسم الخدمة')
      return
    }
    if (!validAmount(newValue) || !validAmount(newCommission)) {
      setError('أدخل قيمة المعاملة وعمولة المكتب')
      return
    }
    if (rows.some((row) => row.name.trim() === name)) {
      setError('هذه الخدمة موجودة بالفعل')
      return
    }

    const sortOrder = Math.max(0, ...rows.map((row) => row.sort_order)) + 1
    setAdding(true)
    setError('')
    const { error: insertError } = await supabase.from('services').insert({
      name,
      transaction_value: valueAmount.toFixed(2),
      commission: commissionAmount.toFixed(2),
      manual: false,
      sort_order: sortOrder,
    })
    setAdding(false)

    if (insertError) {
      setError(
        /duplicate|unique|services_name_key/i.test(errorMessage(insertError))
          ? 'هذه الخدمة موجودة بالفعل'
          : errorMessage(insertError),
      )
      return
    }

    setNewName('')
    setNewValue('')
    setNewCommission('')
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
              <tr>
                <td>
                  <input
                    id="service-name"
                    placeholder="خدمة جديدة"
                    aria-label="اسم الخدمة الجديدة"
                    value={newName}
                    onChange={(event) => setNewName(event.target.value)}
                  />
                </td>
                <td>
                  <input
                    id="service-value"
                    dir="ltr"
                    type="number"
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                    placeholder="0"
                    aria-label="قيمة المعاملة للخدمة الجديدة"
                    value={newValue}
                    onChange={(event) => setNewValue(event.target.value)}
                  />
                </td>
                <td>
                  <input
                    id="service-commission"
                    dir="ltr"
                    type="number"
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                    placeholder="0"
                    aria-label="عمولة المكتب للخدمة الجديدة"
                    value={newCommission}
                    onChange={(event) => setNewCommission(event.target.value)}
                  />
                </td>
                <td>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    disabled={adding}
                    onClick={() => void addService()}
                  >
                    {adding ? 'جارٍ الحفظ…' : 'إضافة'}
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
          {loading && rows.length === 0 && <div className="empty">جارٍ التحميل…</div>}
        </div>
      </div>
    </>
  )
}
