import { useCallback, useEffect, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { errorMessage } from '../lib/format'
import type { ServicePrice } from '../lib/types'
import Modal from '../components/Modal'

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
  const [drafts, setDrafts] = useState<Record<string, { name: string; transaction_value: string; commission: string }>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [savingId, setSavingId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<ServicePrice | null>(null)
  const [deletingBusy, setDeletingBusy] = useState(false)
  const [newName, setNewName] = useState('')
  const [newValue, setNewValue] = useState('')
  const [newCommission, setNewCommission] = useState('')
  const [addingOpen, setAddingOpen] = useState(false)
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<ServicePrice | null>(null)

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
              name: row.name,
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

  function setDraft(id: string, key: 'name' | 'transaction_value' | 'commission', value: string) {
    setDrafts((current) => ({
      ...current,
      [id]: { ...current[id], [key]: value },
    }))
  }

  async function save(row: ServicePrice) {
    const draft = drafts[row.id]
    const name = draft?.name.trim() ?? ''
    if (!name) {
      setError('أدخل اسم الخدمة')
      return
    }
    if (rows.some((item) => item.id !== row.id && item.name.trim() === name)) {
      setError('هذه الخدمة موجودة بالفعل')
      return
    }
    if (!row.manual && (!draft || !validAmount(draft.transaction_value) || !validAmount(draft.commission))) {
      setError('أدخل قيمة المعاملة وعمولة المكتب')
      return
    }

    setSavingId(row.id)
    setError('')
    const { error: saveError } = await supabase
      .from('services')
      .update(
        row.manual
          ? { name }
          : {
              name,
              transaction_value: Number(draft.transaction_value).toFixed(2),
              commission: Number(draft.commission).toFixed(2),
            },
      )
      .eq('id', row.id)
    setSavingId(null)

    if (saveError) {
      setError(
        /duplicate|unique|services_name_key/i.test(errorMessage(saveError))
          ? 'هذه الخدمة موجودة بالفعل'
          : errorMessage(saveError),
      )
      return
    }
    setEditing(null)
    void load()
  }

  async function removeService() {
    if (!deleting) return
    setDeletingBusy(true)
    setError('')
    const { error: deleteError } = await supabase.from('services').delete().eq('id', deleting.id)
    setDeletingBusy(false)
    if (deleteError) {
      setError(errorMessage(deleteError))
      return
    }
    setDeleting(null)
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
    setAddingOpen(false)
    void load()
  }

  function openAdd() {
    setNewName('')
    setNewValue('')
    setNewCommission('')
    setError('')
    setAddingOpen(true)
  }

  function closeAdd() {
    if (adding) return
    setAddingOpen(false)
  }

  function openEdit(row: ServicePrice) {
    setDrafts((current) => ({
      ...current,
      [row.id]: {
        name: row.name,
        transaction_value: amountField(row.transaction_value),
        commission: amountField(row.commission),
      },
    }))
    setError('')
    setEditing(row)
  }

  function closeEdit() {
    if (savingId) return
    setEditing(null)
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
        <button type="button" className="btn btn-primary" onClick={openAdd}>
          إضافة خدمة
        </button>
      </div>

      {error && !addingOpen && !editing && <div className="alert alert-error">{error}</div>}

      <div className="card price-card">
        {loading && rows.length === 0 ? (
          <div className="empty">جارٍ التحميل…</div>
        ) : (
          <div className="price-sheet">
            <div className="price-head">
              <span>الخدمة</span>
              <span>قيمة المعاملة (ر.س)</span>
              <span>عمولة المكتب (ر.س)</span>
              <span />
            </div>
            {rows.map((row) => (
              <div className="price-row" key={row.id}>
                <div className="price-name">{row.name}</div>
                {row.manual ? (
                  <p className="price-manual">تُدخل يدوياً عند إضافة المعاملة</p>
                ) : (
                  <>
                    <span className="price-value num">{amountField(row.transaction_value) || '—'}</span>
                    <span className="price-value num">{amountField(row.commission) || '—'}</span>
                  </>
                )}
                <div className="price-actions">
                  <button type="button" className="btn btn-primary btn-sm" onClick={() => openEdit(row)}>
                    تعديل الخدمة
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-icon"
                    aria-label={`حذف ${row.name}`}
                    title="حذف"
                    onClick={() => setDeleting(row)}
                  >
                    <Trash2 size={16} strokeWidth={2} aria-hidden="true" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Modal title="خدمة جديدة" center open={addingOpen} onClose={closeAdd}>
        {error && <div className="alert alert-error">{error}</div>}
        <div className="service-add-form">
          <div className="field">
            <label htmlFor="service-name">الخدمة</label>
            <input
              id="service-name"
              placeholder="اسم الخدمة"
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="service-value">قيمة المعاملة (ر.س)</label>
            <input
              id="service-value"
              dir="ltr"
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              placeholder="0"
              value={newValue}
              onChange={(event) => setNewValue(event.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="service-commission">عمولة المكتب (ر.س)</label>
            <input
              id="service-commission"
              dir="ltr"
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              placeholder="0"
              value={newCommission}
              onChange={(event) => setNewCommission(event.target.value)}
            />
          </div>
          <div className="form-actions">
            <button type="button" className="btn btn-primary" disabled={adding} onClick={() => void addService()}>
              {adding ? 'جارٍ الحفظ…' : 'إضافة'}
            </button>
            <button type="button" className="btn btn-ghost" onClick={closeAdd}>
              إلغاء
            </button>
          </div>
        </div>
      </Modal>

      <Modal title="تعديل الخدمة" center open={Boolean(editing)} onClose={closeEdit}>
        {editing && (
          <>
            {error && <div className="alert alert-error">{error}</div>}
            <div className="service-add-form">
              <div className="field">
                <label htmlFor="edit-service-name">الخدمة</label>
                <input
                  id="edit-service-name"
                  value={drafts[editing.id]?.name ?? ''}
                  onChange={(event) => setDraft(editing.id, 'name', event.target.value)}
                />
              </div>
              {editing.manual ? (
                <p className="muted">تُدخل قيمة المعاملة وعمولة المكتب يدوياً عند إضافة المعاملة.</p>
              ) : (
                <>
                  <div className="field">
                    <label htmlFor="edit-service-value">قيمة المعاملة (ر.س)</label>
                    <input
                      id="edit-service-value"
                      dir="ltr"
                      type="number"
                      min="0"
                      step="0.01"
                      inputMode="decimal"
                      value={drafts[editing.id]?.transaction_value ?? ''}
                      onChange={(event) => setDraft(editing.id, 'transaction_value', event.target.value)}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="edit-service-commission">عمولة المكتب (ر.س)</label>
                    <input
                      id="edit-service-commission"
                      dir="ltr"
                      type="number"
                      min="0"
                      step="0.01"
                      inputMode="decimal"
                      value={drafts[editing.id]?.commission ?? ''}
                      onChange={(event) => setDraft(editing.id, 'commission', event.target.value)}
                    />
                  </div>
                </>
              )}
              <div className="form-actions">
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={savingId === editing.id}
                  onClick={() => void save(editing)}
                >
                  {savingId === editing.id ? 'جارٍ الحفظ…' : 'حفظ'}
                </button>
                <button type="button" className="btn btn-ghost" onClick={closeEdit}>
                  إلغاء
                </button>
              </div>
            </div>
          </>
        )}
      </Modal>

      <Modal title="حذف الخدمة" compact hideHeader open={Boolean(deleting)} onClose={() => setDeleting(null)}>
        {deleting && (
          <div className="confirm-dialog">
            <p className="confirm-copy">هل أنت متأكد من حذف هذه الخدمة؟</p>
            <p className="confirm-detail">{deleting.name}</p>
            <div className="confirm-actions">
              <button
                type="button"
                className="btn confirm-delete"
                disabled={deletingBusy}
                onClick={() => void removeService()}
              >
                {deletingBusy ? 'جارٍ الحذف…' : 'حذف'}
              </button>
              <button type="button" className="btn confirm-cancel" onClick={() => setDeleting(null)}>
                إلغاء
              </button>
            </div>
          </div>
        )}
      </Modal>
    </>
  )
}
