import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { errorMessage } from '../lib/format'
import type { Branch } from '../lib/types'
import { useCompany } from '../auth/CompanyProvider'
import Modal from '../components/Modal'

interface Draft {
  id: string | null
  name: string
  code: string
  city: string
  phone: string
  is_active: boolean
}

const emptyDraft: Draft = {
  id: null,
  name: '',
  code: '',
  city: '',
  phone: '',
  is_active: true,
}

function blankToNull(value: string): string | null {
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function branchError(error: unknown): string {
  const message = errorMessage(error)
  if (/branches_company_name_key/i.test(message)) return 'هذا الاسم مستخدم لفرع آخر في الشركة'
  if (/branches_company_code_key/i.test(message)) return 'هذا الرمز مستخدم لفرع آخر في الشركة'
  if (/foreign key|violates foreign key/i.test(message)) return 'لا يمكن حذف الفرع لارتباطه ببيانات أخرى'
  return message
}

export default function Branches() {
  const { company, loading: companyLoading, error: companyError, ambiguous, canManageBranches } = useCompany()
  const [rows, setRows] = useState<Branch[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [draft, setDraft] = useState<Draft | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<Branch | null>(null)
  const [deletingBusy, setDeletingBusy] = useState(false)

  const load = useCallback(async () => {
    if (!company) {
      setRows([])
      setLoading(false)
      return
    }
    setLoading(true)
    setError('')
    const { data, error: queryError } = await supabase
      .from('branches')
      .select('id, name, code, city, phone, is_active')
      .order('name')
    if (queryError) {
      setRows([])
      setError(branchError(queryError))
    } else {
      setRows((data ?? []) as Branch[])
    }
    setLoading(false)
  }, [company])

  useEffect(() => {
    if (companyLoading) return
    void load()
  }, [companyLoading, load])

  function openCreate() {
    setError('')
    setDraft(emptyDraft)
  }

  function openEdit(row: Branch) {
    setError('')
    setDraft({
      id: row.id,
      name: row.name,
      code: row.code ?? '',
      city: row.city ?? '',
      phone: row.phone ?? '',
      is_active: row.is_active,
    })
  }

  async function save(event: FormEvent) {
    event.preventDefault()
    if (!draft || !canManageBranches) return
    const name = draft.name.trim()
    if (!name) {
      setError('أدخل اسم الفرع')
      return
    }
    const code = blankToNull(draft.code)
    const duplicateName = rows.some((row) => row.id !== draft.id && row.name.trim() === name)
    const duplicateCode = code !== null && rows.some((row) => row.id !== draft.id && row.code === code)
    if (duplicateName) {
      setError('هذا الاسم مستخدم لفرع آخر في الشركة')
      return
    }
    if (duplicateCode) {
      setError('هذا الرمز مستخدم لفرع آخر في الشركة')
      return
    }

    setSaving(true)
    setError('')
    const payload = {
      name,
      code,
      city: blankToNull(draft.city),
      phone: blankToNull(draft.phone),
      is_active: draft.is_active,
    }
    const result = draft.id
      ? await supabase.from('branches').update(payload).eq('id', draft.id)
      : await supabase.from('branches').insert(payload)
    setSaving(false)

    if (result.error) {
      setError(branchError(result.error))
      return
    }
    setDraft(null)
    void load()
  }

  async function removeBranch() {
    if (!deleting || !canManageBranches) return
    setDeletingBusy(true)
    setError('')
    const { error: deleteError } = await supabase.from('branches').delete().eq('id', deleting.id)
    setDeletingBusy(false)
    if (deleteError) {
      setError(branchError(deleteError))
      return
    }
    setDeleting(null)
    void load()
  }

  const waiting = companyLoading || loading

  return (
    <>
      <div className="page-head">
        <div>
          <h1>الفروع</h1>
          <p className="page-sub">{company ? company.name : 'فروع الشركة الحالية'}</p>
        </div>
        {canManageBranches && company && (
          <button type="button" className="btn btn-primary" onClick={openCreate}>
            إضافة فرع
          </button>
        )}
      </div>

      {(companyError || error) && !draft && !deleting && (
        <div className="alert alert-error">{companyError || error}</div>
      )}

      <div className="card">
        {waiting ? (
          <div className="empty">جارٍ التحميل…</div>
        ) : !company ? (
          <div className="empty">
            {ambiguous
              ? 'يوجد أكثر من شركة لهذا الحساب ولم تُحدَّد الشركة النشطة.'
              : 'لا توجد شركة نشطة لهذا الحساب.'}
          </div>
        ) : rows.length === 0 ? (
          <div className="empty">لا توجد فروع</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>الفرع</th>
                  <th>الرمز</th>
                  <th>المدينة</th>
                  <th>الهاتف</th>
                  <th>الحالة</th>
                  {canManageBranches && <th />}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td className="strong">{row.name}</td>
                    <td>{row.code || '—'}</td>
                    <td>{row.city || '—'}</td>
                    <td className="num" dir="ltr">
                      {row.phone || '—'}
                    </td>
                    <td>
                      <span className={row.is_active ? 'badge badge-completed' : 'badge badge-locked'}>
                        {row.is_active ? 'نشط' : 'متوقف'}
                      </span>
                    </td>
                    {canManageBranches && (
                      <td>
                        <div className="branch-actions">
                          <button type="button" className="btn btn-ghost btn-sm" onClick={() => openEdit(row)}>
                            تعديل
                          </button>
                          <button type="button" className="btn btn-danger btn-sm" onClick={() => setDeleting(row)}>
                            حذف
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal
        title={draft?.id ? 'تعديل الفرع' : 'إضافة فرع'}
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
                <label htmlFor="branch-name">اسم الفرع</label>
                <input
                  id="branch-name"
                  value={draft.name}
                  required
                  onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                />
              </div>
              <div className="field">
                <label htmlFor="branch-code">الرمز</label>
                <input
                  id="branch-code"
                  value={draft.code}
                  onChange={(event) => setDraft({ ...draft, code: event.target.value })}
                />
              </div>
              <div className="field">
                <label htmlFor="branch-city">المدينة</label>
                <input
                  id="branch-city"
                  value={draft.city}
                  onChange={(event) => setDraft({ ...draft, city: event.target.value })}
                />
              </div>
              <div className="field">
                <label htmlFor="branch-phone">الهاتف</label>
                <input
                  id="branch-phone"
                  dir="ltr"
                  value={draft.phone}
                  onChange={(event) => setDraft({ ...draft, phone: event.target.value })}
                />
              </div>
              <div className="field">
                <label htmlFor="branch-active">الحالة</label>
                <select
                  id="branch-active"
                  value={draft.is_active ? 'active' : 'inactive'}
                  onChange={(event) => setDraft({ ...draft, is_active: event.target.value === 'active' })}
                >
                  <option value="active">نشط</option>
                  <option value="inactive">متوقف</option>
                </select>
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

      <Modal title="حذف الفرع" compact hideHeader open={Boolean(deleting)} onClose={() => !deletingBusy && setDeleting(null)}>
        {deleting && (
          <div className="confirm-dialog">
            <p className="confirm-copy">هل أنت متأكد من حذف هذا الفرع؟</p>
            <p className="confirm-detail">{deleting.name}</p>
            {error && <div className="alert alert-error">{error}</div>}
            <div className="confirm-actions">
              <button type="button" className="btn confirm-delete" disabled={deletingBusy} onClick={() => void removeBranch()}>
                {deletingBusy ? 'جارٍ الحذف…' : 'حذف'}
              </button>
              <button type="button" className="btn confirm-cancel" disabled={deletingBusy} onClick={() => setDeleting(null)}>
                إلغاء
              </button>
            </div>
          </div>
        )}
      </Modal>
    </>
  )
}
