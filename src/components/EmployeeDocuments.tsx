import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { useCompany } from '../auth/CompanyProvider'
import Modal from './Modal'
import ExpiryDate from './ExpiryDate'
import { formatEmployeeDate } from '../lib/employees'
import { notifyEmployeeActivity } from '../lib/activity'
import {
  DOCUMENT_TYPES,
  documentError,
  documentToDraft,
  documentTypeLabel,
  documentTypeText,
  draftToDocumentInput,
  emptyDocumentDraft,
  type DocumentDraft,
  type EmployeeDocument,
} from '../lib/documents'

const COLUMNS = 'id, document_type, document_number, issue_date, expiry_date, file_path, notes, created_at'

function readDocument(row: Record<string, unknown>): EmployeeDocument {
  return {
    id: String(row.id),
    document_type: String(row.document_type ?? ''),
    document_number: (row.document_number as string | null) ?? null,
    issue_date: (row.issue_date as string | null) ?? null,
    expiry_date: (row.expiry_date as string | null) ?? null,
    file_path: (row.file_path as string | null) ?? null,
    notes: (row.notes as string | null) ?? null,
  }
}

export default function EmployeeDocuments({ employeeId }: { employeeId: string }) {
  const { canManageDocuments, canDeleteDocuments } = useCompany()
  const [rows, setRows] = useState<EmployeeDocument[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [draft, setDraft] = useState<DocumentDraft | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<EmployeeDocument | null>(null)
  const [deletingBusy, setDeletingBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    const { data, error: queryError } = await supabase
      .from('employee_documents')
      .select(COLUMNS)
      .eq('employee_id', employeeId)
      .order('created_at', { ascending: false })
    if (queryError) {
      setRows([])
      setError(documentError(queryError))
    } else {
      setRows((data ?? []).map((row) => readDocument(row as Record<string, unknown>)))
    }
    setLoading(false)
  }, [employeeId])

  useEffect(() => {
    void load()
  }, [load])

  async function save(event: FormEvent) {
    event.preventDefault()
    if (!draft || !canManageDocuments) return
    const parsed = draftToDocumentInput(draft)
    if ('error' in parsed) {
      setError(parsed.error)
      return
    }
    setSaving(true)
    setError('')
    const result = draft.id
      ? await supabase.from('employee_documents').update(parsed.input).eq('id', draft.id).eq('employee_id', employeeId)
      : await supabase.from('employee_documents').insert({ ...parsed.input, employee_id: employeeId })
    setSaving(false)
    if (result.error) {
      setError(documentError(result.error))
      return
    }
    setDraft(null)
    setNotice(draft.id ? 'تم تحديث المستند' : 'تمت إضافة المستند')
    notifyEmployeeActivity()
    void load()
  }

  async function removeDocument() {
    if (!deleting || !canDeleteDocuments) return
    setDeletingBusy(true)
    setError('')
    const { error: deleteError } = await supabase
      .from('employee_documents')
      .delete()
      .eq('id', deleting.id)
      .eq('employee_id', employeeId)
    setDeletingBusy(false)
    if (deleteError) {
      setError(documentError(deleteError))
      return
    }
    setDeleting(null)
    setNotice('تم حذف المستند')
    notifyEmployeeActivity()
    void load()
  }

  return (
    <section className="card">
      <div className="price-section-head">
        <h2>مستندات الموظف</h2>
        {canManageDocuments && (
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => {
              setError('')
              setNotice('')
              setDraft(emptyDocumentDraft())
            }}
          >
            إضافة مستند
          </button>
        )}
      </div>

      {notice && !draft && !deleting && <div className="alert alert-ok">{notice}</div>}
      {error && !draft && !deleting && <div className="alert alert-error">{error}</div>}

      {loading ? (
        <div className="empty">جارٍ التحميل…</div>
      ) : rows.length === 0 ? (
        <div className="empty">لا توجد مستندات</div>
      ) : (
        <div className="document-list">
          {rows.map((row) => (
            <article className="employee-card" key={row.id}>
              <div className="employee-card-head">
                <strong>{documentTypeText(row.document_type)}</strong>
                {row.file_path?.trim() ? <span className="badge badge-locked">يوجد ملف</span> : null}
              </div>
              <div className="document-grid">
                <div>
                  <div className="profile-label">رقم المستند</div>
                  <div className="num" dir="ltr">
                    {row.document_number || '—'}
                  </div>
                </div>
                <div>
                  <div className="profile-label">تاريخ الإصدار</div>
                  <div className="num" dir="ltr">
                    {formatEmployeeDate(row.issue_date)}
                  </div>
                </div>
                <div>
                  <div className="profile-label">تاريخ الانتهاء</div>
                  <ExpiryDate value={row.expiry_date} expiredLabel="منتهي" />
                </div>
              </div>
              {row.notes?.trim() ? <p className="note-line">{row.notes}</p> : null}
              {(canManageDocuments || canDeleteDocuments) && (
                <div className="branch-actions">
                  {canManageDocuments && (
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => {
                        setError('')
                        setNotice('')
                        setDraft(documentToDraft(row))
                      }}
                    >
                      تعديل
                    </button>
                  )}
                  {canDeleteDocuments && (
                    <button type="button" className="btn btn-danger btn-sm" onClick={() => setDeleting(row)}>
                      حذف
                    </button>
                  )}
                </div>
              )}
            </article>
          ))}
        </div>
      )}

      <Modal
        title={draft?.id ? 'تعديل المستند' : 'إضافة مستند'}
        open={Boolean(draft)}
        onClose={() => {
          if (!saving) setDraft(null)
        }}
      >
        {draft && (
          <form className="service-add-form" onSubmit={(event) => void save(event)}>
            {error && <div className="alert alert-error">{error}</div>}
            <div className="form-grid">
              <div className="field">
                <label htmlFor="document-type">نوع المستند</label>
                <select
                  id="document-type"
                  value={draft.kind}
                  onChange={(event) =>
                    setDraft((current) =>
                      current ? { ...current, kind: event.target.value as DocumentDraft['kind'] } : current,
                    )
                  }
                >
                  {DOCUMENT_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {documentTypeLabel[type]}
                    </option>
                  ))}
                </select>
              </div>
              {draft.kind === 'other' && (
                <div className="field">
                  <label htmlFor="document-custom-type">اسم المستند</label>
                  <input
                    id="document-custom-type"
                    value={draft.customType}
                    placeholder="مثال: رخصة قيادة"
                    onChange={(event) =>
                      setDraft((current) => (current ? { ...current, customType: event.target.value } : current))
                    }
                  />
                </div>
              )}
              <div className="field">
                <label htmlFor="document-number">رقم المستند</label>
                <input
                  id="document-number"
                  dir="ltr"
                  value={draft.document_number}
                  onChange={(event) =>
                    setDraft((current) => (current ? { ...current, document_number: event.target.value } : current))
                  }
                />
              </div>
              <div className="field">
                <label htmlFor="document-issue">تاريخ الإصدار</label>
                <input
                  id="document-issue"
                  type="date"
                  dir="ltr"
                  value={draft.issue_date}
                  onChange={(event) =>
                    setDraft((current) => (current ? { ...current, issue_date: event.target.value } : current))
                  }
                />
              </div>
              <div className="field">
                <label htmlFor="document-expiry">تاريخ الانتهاء</label>
                <input
                  id="document-expiry"
                  type="date"
                  dir="ltr"
                  value={draft.expiry_date}
                  onChange={(event) =>
                    setDraft((current) => (current ? { ...current, expiry_date: event.target.value } : current))
                  }
                />
              </div>
              <div className="field full">
                <label htmlFor="document-notes">ملاحظات</label>
                <textarea
                  id="document-notes"
                  value={draft.notes}
                  onChange={(event) =>
                    setDraft((current) => (current ? { ...current, notes: event.target.value } : current))
                  }
                />
              </div>
            </div>
            <div className="form-actions">
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? 'جارٍ الحفظ…' : 'حفظ'}
              </button>
              <button type="button" className="btn btn-ghost" disabled={saving} onClick={() => setDraft(null)}>
                إلغاء
              </button>
            </div>
          </form>
        )}
      </Modal>

      <Modal title="حذف المستند" compact hideHeader open={Boolean(deleting)} onClose={() => !deletingBusy && setDeleting(null)}>
        {deleting && (
          <div className="confirm-dialog">
            <p className="confirm-copy">هل أنت متأكد من حذف هذا المستند؟</p>
            <p className="confirm-detail">{documentTypeText(deleting.document_type)}</p>
            {error && <div className="alert alert-error">{error}</div>}
            <div className="confirm-actions">
              <button type="button" className="btn confirm-delete" disabled={deletingBusy} onClick={() => void removeDocument()}>
                {deletingBusy ? 'جارٍ الحذف…' : 'حذف'}
              </button>
              <button type="button" className="btn confirm-cancel" disabled={deletingBusy} onClick={() => setDeleting(null)}>
                إلغاء
              </button>
            </div>
          </div>
        )}
      </Modal>
    </section>
  )
}
