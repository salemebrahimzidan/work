import { useCallback, useEffect, useRef, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { useCompany } from '../auth/CompanyProvider'
import { loadServiceCommissionMap } from '../lib/finance'
import { supabase } from '../lib/supabase'
import { errorMessage } from '../lib/format'
import { asServiceCategory, serviceCategoryLabel, type ServiceCategory, type ServicePrice } from '../lib/types'
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

export default function Services({ category }: { category: ServiceCategory }) {
  const { canViewFinance, loading: companyLoading } = useCompany()
  const [rows, setRows] = useState<ServicePrice[]>([])
  const [drafts, setDrafts] = useState<
    Record<string, { name: string; transaction_value: string; commission: string; steps: string }>
  >({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [savingId, setSavingId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<ServicePrice | null>(null)
  const [deletingBusy, setDeletingBusy] = useState(false)
  const [newName, setNewName] = useState('')
  const [newValue, setNewValue] = useState('')
  const [newCommission, setNewCommission] = useState('')
  const [newSteps, setNewSteps] = useState('')
  const [categoryReady, setCategoryReady] = useState(true)
  const [stepsReady, setStepsReady] = useState(true)
  const [addingOpen, setAddingOpen] = useState(false)
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<ServicePrice | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    const columns = 'id, name, transaction_value, manual, sort_order, category, steps'
    const primary = await supabase.from('services').select(columns).order('sort_order')
    // Older databases may not have category (0017) or steps (0018) yet.
    let data: Array<
      Omit<ServicePrice, 'category' | 'steps' | 'commission'> & { category?: string | null; steps?: string | null }
    > | null = primary.data
    let queryError = primary.error
    let ready = true
    let stepsColumn = true
    if (queryError && /steps|schema cache/i.test(errorMessage(queryError))) {
      stepsColumn = false
      const withoutSteps = await supabase
        .from('services')
        .select('id, name, transaction_value, manual, sort_order, category')
        .order('sort_order')
      data = withoutSteps.data
      queryError = withoutSteps.error
    }
    if (queryError && /category|schema cache/i.test(errorMessage(queryError))) {
      ready = false
      stepsColumn = false
      const fallback = await supabase
        .from('services')
        .select('id, name, transaction_value, manual, sort_order')
        .order('sort_order')
      data = fallback.data
      queryError = fallback.error
    }
    setCategoryReady(ready)
    setStepsReady(stepsColumn)

    if (queryError) {
      const message = errorMessage(queryError)
      setError(
        /schema cache|relation .*services/i.test(message)
          ? 'جدول أسعار الخدمات غير جاهز. شغّل ملف 0008_service_prices.sql في Supabase ثم حدّث الصفحة.'
          : message,
      )
      setRows([])
    } else {
      const list: ServicePrice[] = (data ?? []).map((row) => ({
        ...row,
        commission: null,
        category: asServiceCategory(row.category),
        steps: row.steps?.trim() ? row.steps : null,
      }))
      if (canViewFinance) {
        try {
          const fees = await loadServiceCommissionMap()
          for (const row of list) row.commission = fees[row.id] ?? null
        } catch (feeError) {
          setError(errorMessage(feeError))
        }
      }
      setRows(list)
      setDrafts(
        Object.fromEntries(
          list.map((row) => [
            row.id,
            {
              name: row.name,
              transaction_value: amountField(row.transaction_value),
              commission: amountField(row.commission),
              steps: row.steps ?? '',
            },
          ]),
        ),
      )
    }
    setLoading(false)
  }, [canViewFinance])

  useEffect(() => {
    if (companyLoading) return
    void load()
  }, [companyLoading, load])

  function setDraft(id: string, key: 'name' | 'transaction_value' | 'commission' | 'steps', value: string) {
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
    if (
      !row.manual &&
      (!draft ||
        !validAmount(draft.transaction_value) ||
        (canViewFinance && !validAmount(draft.commission)))
    ) {
      setError(canViewFinance ? 'أدخل قيمة المعاملة وعمولة المكتب' : 'أدخل قيمة المعاملة')
      return
    }

    setSavingId(row.id)
    setError('')
    const steps = draft?.steps.trim() || null
    const { error: saveError } = await supabase
      .from('services')
      .update({
        ...(row.manual
          ? { name }
          : {
              name,
              transaction_value: Number(draft.transaction_value).toFixed(2),
              ...(canViewFinance ? { commission: Number(draft.commission).toFixed(2) } : {}),
            }),
        ...(stepsReady ? { steps } : {}),
      })
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
    if (!validAmount(newValue) || (canViewFinance && !validAmount(newCommission))) {
      setError(canViewFinance ? 'أدخل قيمة المعاملة وعمولة المكتب' : 'أدخل قيمة المعاملة')
      return
    }
    if (rows.some((row) => row.name.trim() === name)) {
      setError('هذه الخدمة موجودة بالفعل')
      return
    }

    if (!categoryReady && category !== 'sdad') {
      setError('جدول الخدمات غير جاهز. شغّل ملف 0017_service_category.sql في Supabase ثم حدّث الصفحة.')
      return
    }

    const group = rows.filter((row) => row.category === category)
    const sortOrder = Math.max(0, ...group.map((row) => row.sort_order)) + 1
    setAdding(true)
    setError('')
    const { error: insertError } = await supabase.from('services').insert({
      name,
      transaction_value: valueAmount.toFixed(2),
      ...(canViewFinance ? { commission: commissionAmount.toFixed(2) } : {}),
      manual: false,
      sort_order: sortOrder,
      ...(categoryReady ? { category } : {}),
      ...(stepsReady ? { steps: newSteps.trim() || null } : {}),
    })
    setAdding(false)

    if (insertError) {
      setError(
        /duplicate|unique|services_name_key/i.test(errorMessage(insertError))
          ? 'هذه الخدمة موجودة بالفعل'
          : category === 'fawateer' && /services_category_check/i.test(errorMessage(insertError))
            ? 'جدول سداد الفواتير غير جاهز. شغّل ملف 0019_service_fawateer.sql في Supabase ثم حدّث الصفحة.'
            : errorMessage(insertError),
      )
      return
    }

    setNewName('')
    setNewValue('')
    setNewCommission('')
    setNewSteps('')
    setAddingOpen(false)
    void load()
  }

  function openAdd() {
    setNewName('')
    setNewValue('')
    setNewCommission('')
    setNewSteps('')
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
        steps: row.steps ?? '',
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
          <h1>{serviceCategoryLabel[category]}</h1>
          <p className="page-sub">
            عند اختيار الخدمة في معاملة جديدة تُعبأ قيمة المعاملة وعمولة المكتب من هنا.
          </p>
          {category !== 'sdad' && !categoryReady && (
            <p className="page-sub">شغّل ملف 0017_service_category.sql في Supabase ثم حدّث الصفحة حتى تُحفظ هذه الخدمات.</p>
          )}
        </div>
        <button type="button" className="btn btn-primary" onClick={openAdd}>
          إضافة خدمة
        </button>
      </div>

      {error && !addingOpen && !editing && <div className="alert alert-error">{error}</div>}

      <PriceSection
        rows={rows.filter((row) => row.category === category)}
        loading={loading && rows.length === 0}
        showCommission={canViewFinance}
        onEdit={openEdit}
        onDelete={setDeleting}
      />

      <Modal
        title={category === 'taqeeb' ? 'خدمة جديدة' : `خدمة ${serviceCategoryLabel[category]} جديدة`}
        center
        open={addingOpen}
        onClose={closeAdd}
      >
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
          {canViewFinance && (
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
          )}
          <div className="field">
            <label htmlFor="service-steps">الخطوات</label>
            <textarea
              id="service-steps"
              rows={4}
              placeholder="كل خطوة في سطر"
              value={newSteps}
              onChange={(event) => setNewSteps(event.target.value)}
            />
          </div>
          {!stepsReady && (
            <p className="muted">خطوات الخدمة غير جاهزة. شغّل ملف 0018_service_steps.sql في Supabase ثم حدّث الصفحة.</p>
          )}
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
                  {canViewFinance && (
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
                  )}
                </>
              )}
              <div className="field">
                <label htmlFor="edit-service-steps">الخطوات</label>
                <textarea
                  id="edit-service-steps"
                  rows={4}
                  placeholder="كل خطوة في سطر"
                  value={drafts[editing.id]?.steps ?? ''}
                  onChange={(event) => setDraft(editing.id, 'steps', event.target.value)}
                />
              </div>
              {!stepsReady && (
                <p className="muted">خطوات الخدمة غير جاهزة. شغّل ملف 0018_service_steps.sql في Supabase ثم حدّث الصفحة.</p>
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

const PAGE_SIZE = 12

function PriceSection({
  rows,
  loading,
  showCommission,
  onEdit,
  onDelete,
}: {
  rows: ServicePrice[]
  loading: boolean
  showCommission: boolean
  onEdit: (row: ServicePrice) => void
  onDelete: (row: ServicePrice) => void
}) {
  const [page, setPage] = useState(0)
  const previousCount = useRef(rows.length)
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  const currentPage = Math.min(page, pageCount - 1)
  const visibleRows = rows.slice(currentPage * PAGE_SIZE, currentPage * PAGE_SIZE + PAGE_SIZE)

  useEffect(() => {
    const alreadyLoaded = previousCount.current > 0
    if (alreadyLoaded && rows.length > previousCount.current) {
      setPage(Math.max(0, Math.ceil(rows.length / PAGE_SIZE) - 1))
    } else {
      setPage((current) => Math.min(current, Math.max(0, Math.ceil(rows.length / PAGE_SIZE) - 1)))
    }
    previousCount.current = rows.length
  }, [rows.length])

  return (
    <section className="price-section">
      <div className="card price-card">
        {loading ? (
          <div className="empty">جارٍ التحميل…</div>
        ) : rows.length === 0 ? (
          <div className="empty">لا توجد خدمات</div>
        ) : (
          <div className={showCommission ? 'price-sheet' : 'price-sheet price-sheet-safe'}>
            <div className="price-head">
              <span>الخدمة</span>
              <span>قيمة المعاملة (ر.س)</span>
              {showCommission && <span>عمولة المكتب (ر.س)</span>}
              <span />
            </div>
            {visibleRows.map((row) => (
              <div className="price-row" key={row.id}>
                <div className="price-name">{row.name}</div>
                {row.manual ? (
                  <p className="price-manual">تُدخل يدوياً عند إضافة المعاملة</p>
                ) : (
                  <>
                    <span className="price-value num">{amountField(row.transaction_value) || '—'}</span>
                    {showCommission && (
                      <span className="price-value num">{amountField(row.commission) || '—'}</span>
                    )}
                  </>
                )}
                <div className="price-actions">
                  <button type="button" className="btn btn-primary btn-sm" onClick={() => onEdit(row)}>
                    تعديل الخدمة
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-icon"
                    aria-label={`حذف ${row.name}`}
                    title="حذف"
                    onClick={() => onDelete(row)}
                  >
                    <Trash2 size={16} strokeWidth={2} aria-hidden="true" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
        {rows.length > PAGE_SIZE && (
          <div className="price-pager">
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={currentPage === 0}
              onClick={() => setPage(currentPage - 1)}
            >
              السابق
            </button>
            {Array.from({ length: pageCount }, (_, index) => (
              <button
                key={index}
                type="button"
                className={index === currentPage ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm'}
                onClick={() => setPage(index)}
              >
                {index + 1}
              </button>
            ))}
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={currentPage >= pageCount - 1}
              onClick={() => setPage(currentPage + 1)}
            >
              التالي
            </button>
          </div>
        )}
      </div>
    </section>
  )
}
