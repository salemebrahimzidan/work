import { useCallback, useEffect, useRef, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Navigate, useParams } from 'react-router-dom'
import { useCompany } from '../auth/CompanyProvider'
import { loadServiceCommissionMap, loadServiceQuoteCommissionMap } from '../lib/finance'
import { supabase } from '../lib/supabase'
import { errorMessage } from '../lib/format'
import {
  asServiceCategory,
  billerCategoryLabel,
  isBillerCategory,
  serviceCategoryLabel,
  type ServiceCategory,
  type ServicePrice,
} from '../lib/types'
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

function stepLink(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed || /\s/.test(trimmed)) return null
  const withScheme = /^www\./i.test(trimmed) ? `https://${trimmed}` : /^(https?:)?\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
  try {
    const url = new URL(withScheme)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    if (!url.hostname.includes('.')) return null
    return url.href
  } catch {
    return null
  }
}

function StepsField({
  id,
  value,
  onChange,
}: {
  id: string
  value: string
  onChange: (value: string) => void
}) {
  const areaRef = useRef<HTMLTextAreaElement>(null)
  const selectionRef = useRef<{ start: number; end: number } | null>(null)
  const [linkOpen, setLinkOpen] = useState(false)
  const [link, setLink] = useState('')
  const [linkError, setLinkError] = useState('')

  function rememberSelection() {
    const area = areaRef.current
    if (!area) return
    selectionRef.current = { start: area.selectionStart, end: area.selectionEnd }
  }

  function insertLink() {
    const href = stepLink(link)
    if (!href) {
      setLinkError('أدخل رابطاً صحيحاً، مثل https://example.com')
      return
    }
    const area = areaRef.current
    const saved = selectionRef.current
    const start = saved?.start ?? value.length
    const end = saved?.end ?? value.length
    const before = value.slice(0, start)
    const after = value.slice(end)
    const atEnd = start === value.length && end === value.length
    const padBefore = atEnd
      ? value.length > 0 && !/\n$/.test(value)
        ? '\n'
        : ''
      : before.length > 0 && !/\s$/.test(before)
        ? ' '
        : ''
    const padAfter = !atEnd && after.length > 0 && !/^\s/.test(after) ? ' ' : ''
    const next = `${before}${padBefore}${href}${padAfter}${after}`
    onChange(next)
    setLink('')
    setLinkError('')
    setLinkOpen(false)
    const cursor = before.length + padBefore.length + href.length
    selectionRef.current = { start: cursor, end: cursor }
    requestAnimationFrame(() => {
      area?.focus()
      area?.setSelectionRange(cursor, cursor)
    })
  }

  return (
    <>
      <textarea
        ref={areaRef}
        id={id}
        rows={4}
        placeholder="كل خطوة في سطر"
        value={value}
        onSelect={rememberSelection}
        onBlur={rememberSelection}
        onChange={(event) => onChange(event.target.value)}
      />
      {linkOpen ? (
        <div className="steps-link">
          <input
            dir="ltr"
            type="url"
            inputMode="url"
            placeholder="https://example.com"
            aria-label="رابط الخطوة"
            value={link}
            onChange={(event) => {
              setLink(event.target.value)
              setLinkError('')
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                insertLink()
              }
            }}
          />
          <button type="button" className="btn btn-primary btn-sm" onClick={insertLink}>
            إدراج
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => {
              setLinkOpen(false)
              setLink('')
              setLinkError('')
            }}
          >
            إلغاء
          </button>
        </div>
      ) : (
        <button type="button" className="btn btn-ghost btn-sm steps-link-btn" onClick={() => setLinkOpen(true)}>
          إضافة رابط
        </button>
      )}
      {linkError && <p className="steps-link-error">{linkError}</p>}
    </>
  )
}

export default function Services({ category }: { category: ServiceCategory }) {
  const { canViewFinance, canViewServiceQuoteCommission, loading: companyLoading } = useCompany()
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
  const commissionAuto = useRef(false)
  const [newSteps, setNewSteps] = useState('')
  const [categoryReady, setCategoryReady] = useState(true)
  const [stepsReady, setStepsReady] = useState(true)
  const [addingOpen, setAddingOpen] = useState(false)
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<ServicePrice | null>(null)
  const [billerReady, setBillerReady] = useState(true)
  const { biller: billerParam } = useParams()
  const selectedBiller = category === 'fawateer' && isBillerCategory(billerParam) ? billerParam : null

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    const withBiller = await supabase
      .from('services')
      .select('id, name, transaction_value, manual, sort_order, category, steps, biller_category')
      .order('sort_order')
    const billerColumn = !(withBiller.error && /biller_category|schema cache/i.test(errorMessage(withBiller.error)))
    const primary = billerColumn
      ? withBiller
      : await supabase
          .from('services')
          .select('id, name, transaction_value, manual, sort_order, category, steps')
          .order('sort_order')
    // Older databases may not have category (0017) or steps (0018) yet.
    let data: Array<
      Omit<ServicePrice, 'category' | 'steps' | 'commission' | 'biller_category'> & {
        category?: string | null
        steps?: string | null
        biller_category?: string | null
      }
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
    setBillerReady(billerColumn)

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
        biller_category: isBillerCategory(row.biller_category) ? row.biller_category : null,
        steps: row.steps?.trim() ? row.steps : null,
      }))
      if (canViewServiceQuoteCommission) {
        try {
          const fees = canViewFinance
            ? await loadServiceCommissionMap()
            : await loadServiceQuoteCommissionMap()
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
  }, [canViewFinance, canViewServiceQuoteCommission])

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
    const isFawateer = row.category === 'fawateer'
    if (
      !isFawateer &&
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
        ...(isFawateer || row.manual
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
    const isFawateer = category === 'fawateer'
    if (!name) {
      setError('أدخل اسم الخدمة')
      return
    }
    if (!isFawateer && (!validAmount(newValue) || (canViewFinance && !validAmount(newCommission)))) {
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
    if (category === 'fawateer' && !selectedBiller) {
      setError('اختر فئة المفوتر أولاً')
      return
    }
    if (category === 'fawateer' && !billerReady) {
      setError('فئات المفوتر غير جاهزة. شغّل ملف 0035_fawateer_biller_categories.sql في Supabase ثم حدّث الصفحة.')
      return
    }

    const group = rows.filter(
      (row) => row.category === category && (category !== 'fawateer' || row.biller_category === selectedBiller),
    )
    const sortOrder = Math.max(0, ...group.map((row) => row.sort_order)) + 1
    setAdding(true)
    setError('')
    const { error: insertError } = await supabase.from('services').insert({
      name,
      ...(isFawateer
        ? { transaction_value: null, ...(canViewFinance ? { commission: null } : {}) }
        : {
            transaction_value: valueAmount.toFixed(2),
            ...(canViewFinance ? { commission: commissionAmount.toFixed(2) } : {}),
          }),
      manual: false,
      sort_order: sortOrder,
      ...(categoryReady ? { category } : {}),
      ...(category === 'fawateer' && selectedBiller ? { biller_category: selectedBiller } : {}),
      ...(stepsReady ? { steps: newSteps.trim() || null } : {}),
    })
    setAdding(false)

    if (insertError) {
      setError(
        /duplicate|unique|services_name_key/i.test(errorMessage(insertError))
          ? 'هذه الخدمة موجودة بالفعل'
          : /services_biller_category_check/i.test(errorMessage(insertError))
            ? 'فئة المفوتر غير جاهزة. شغّل ملف 0035_fawateer_biller_categories.sql في Supabase ثم حدّث الصفحة.'
          : /services_category_check/i.test(errorMessage(insertError))
            ? 'نوع الخدمة غير جاهز في قاعدة البيانات. شغّل ملف 0039_taqdeem_service_category.sql في Supabase ثم حدّث الصفحة.'
            : errorMessage(insertError),
      )
      return
    }

    setNewName('')
    setNewValue('')
    setNewCommission('')
    commissionAuto.current = false
    setNewSteps('')
    setAddingOpen(false)
    void load()
  }

  function openAdd() {
    setNewName('')
    setNewValue('')
    setNewCommission('')
    commissionAuto.current = false
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

  const catalogRows = rows.filter(
    (row) => row.category === category && (category !== 'fawateer' || row.biller_category === selectedBiller),
  )

  if (category === 'fawateer' && !selectedBiller) {
    return <Navigate to="/fawateer/communications" replace />
  }

  return (
    <>
      <div className="services-page">
        <div className="page-head">
          <div>
            <h1>{selectedBiller ? billerCategoryLabel[selectedBiller] : serviceCategoryLabel[category]}</h1>
            <p className="page-sub">
              {category === 'fawateer'
                ? 'عمولة المكتب تُحسب من قيمة السداد عند إنشاء المعاملة.'
                : 'عند اختيار الخدمة في معاملة جديدة تُعبأ قيمة المعاملة وعمولة المكتب من هنا.'}
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
          key={category === 'fawateer' ? `${category}:${selectedBiller}` : category}
          rows={catalogRows}
          loading={loading && rows.length === 0}
          showPrices={category !== 'fawateer'}
          showCommission={category !== 'fawateer' && canViewServiceQuoteCommission}
          onEdit={openEdit}
          onDelete={setDeleting}
        />
      </div>

      <Modal
        title={
          selectedBiller
            ? `خدمة ${billerCategoryLabel[selectedBiller]} جديدة`
            : category === 'taqeeb'
              ? 'خدمة جديدة'
              : `خدمة ${serviceCategoryLabel[category]} جديدة`
        }
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
          {category !== 'fawateer' && (
          <>
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
              onChange={(event) => {
                const value = event.target.value
                setNewValue(value)
                const amount = Number(value)
                if (commissionAuto.current && (value === '' || (Number.isFinite(amount) && amount > 750))) {
                  commissionAuto.current = false
                  setNewCommission('')
                }
              }}
              onBlur={(event) => {
                const value = event.currentTarget.value
                const amount = Number(value)
                if (value !== '' && Number.isFinite(amount) && amount >= 0 && amount <= 750) {
                  commissionAuto.current = true
                  setNewCommission('10')
                }
              }}
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
                onChange={(event) => {
                  commissionAuto.current = false
                  setNewCommission(event.target.value)
                }}
              />
            </div>
          )}
          </>
          )}
          <div className="field">
            <label htmlFor="service-steps">الخطوات</label>
            <StepsField id="service-steps" value={newSteps} onChange={setNewSteps} />
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
              {editing.category === 'fawateer' ? null : editing.manual ? (
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
                  {canViewFinance ? (
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
                  ) : canViewServiceQuoteCommission ? (
                    <div className="field">
                      <label htmlFor="edit-service-commission">عمولة المكتب (ر.س)</label>
                      <input
                        id="edit-service-commission"
                        disabled
                        readOnly
                        dir="ltr"
                        type="text"
                        value={amountField(editing.commission) || '—'}
                      />
                    </div>
                  ) : null}
                </>
              )}
              <div className="field">
                <label htmlFor="edit-service-steps">الخطوات</label>
                <StepsField
                  id="edit-service-steps"
                  value={drafts[editing.id]?.steps ?? ''}
                  onChange={(value) => setDraft(editing.id, 'steps', value)}
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

function PriceRow({
  row,
  showPrices,
  showCommission,
  onEdit,
  onDelete,
}: {
  row: ServicePrice
  showPrices: boolean
  showCommission: boolean
  onEdit?: (row: ServicePrice) => void
  onDelete?: (row: ServicePrice) => void
}) {
  return (
    <tr>
      <td className="price-name">{row.name}</td>
      {showPrices &&
        (row.manual ? (
          <td className="price-manual" colSpan={showCommission ? 2 : 1}>
            تُدخل يدوياً عند إضافة المعاملة
          </td>
        ) : (
          <>
            <td className="price-value num">{amountField(row.transaction_value) || '—'}</td>
            {showCommission && <td className="price-value num">{amountField(row.commission) || '—'}</td>}
          </>
        ))}
      <td>
        <div className="price-actions">
          <button type="button" className="btn btn-primary btn-sm" onClick={() => onEdit?.(row)}>
            تعديل الخدمة
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-icon"
            aria-label={`حذف ${row.name}`}
            title="حذف"
            onClick={() => onDelete?.(row)}
          >
            <Trash2 size={16} strokeWidth={2} aria-hidden="true" />
          </button>
        </div>
      </td>
    </tr>
  )
}

function PriceSection({
  rows,
  loading,
  showPrices,
  showCommission,
  onEdit,
  onDelete,
}: {
  rows: ServicePrice[]
  loading: boolean
  showPrices: boolean
  showCommission: boolean
  onEdit: (row: ServicePrice) => void
  onDelete: (row: ServicePrice) => void
}) {
  return (
    <section className="price-section">
      {loading ? (
        <div className="table-wrap" aria-busy="true">
          <table>
            <PriceHead showPrices={showPrices} showCommission={showCommission} />
            <tbody>
                {Array.from({ length: 10 }, (_, index) => (
                  <tr key={index}>
                    <td>
                      <span className="skeleton price-skeleton-name" />
                    </td>
                    {showPrices && (
                      <td>
                        <span className="skeleton price-skeleton-num" />
                      </td>
                    )}
                    {showPrices && showCommission && (
                      <td>
                        <span className="skeleton price-skeleton-num" />
                      </td>
                    )}
                    <td>
                      <span className="price-skeleton-actions">
                        <span className="skeleton price-skeleton-btn" />
                        <span className="skeleton price-skeleton-icon" />
                      </span>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      ) : rows.length === 0 ? (
        <div className="card">
          <div className="empty price-empty">
            <span className="price-empty-mark" aria-hidden="true">
              <Plus size={22} strokeWidth={2} />
            </span>
            <strong>لا توجد خدمات</strong>
            <p>أضف أول خدمة في هذا القسم لتظهر عند إنشاء معاملة جديدة.</p>
          </div>
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <PriceHead showPrices={showPrices} showCommission={showCommission} />
            <tbody>
              {rows.map((row) => (
                <PriceRow
                  key={row.id}
                  row={row}
                  showPrices={showPrices}
                  showCommission={showCommission}
                  onEdit={onEdit}
                  onDelete={onDelete}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

function PriceHead({ showPrices, showCommission }: { showPrices: boolean; showCommission: boolean }) {
  return (
    <thead>
      <tr>
        <th>الخدمة</th>
        {showPrices && <th>قيمة المعاملة (ر.س)</th>}
        {showPrices && showCommission && <th>عمولة المكتب (ر.س)</th>}
        <th>إجراءات</th>
      </tr>
    </thead>
  )
}
