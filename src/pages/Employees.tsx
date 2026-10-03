import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useCompany } from '../auth/CompanyProvider'
import Modal from '../components/Modal'
import EmployeeForm from '../components/EmployeeForm'
import ExpiryDate from '../components/ExpiryDate'
import type { Branch, Employee, EmploymentStatus } from '../lib/types'
import {
  draftToInput,
  employeeError,
  employeeToDraft,
  employmentStatusLabel,
  emptyEmployeeDraft,
  readEmployee,
  type EmployeeDraft,
} from '../lib/employees'

const LIST_COLUMNS =
  'id, employee_number, full_name, nationality, mobile, branch_id, job_title, employment_status, iqama_number, iqama_expiry_date, passport_expiry_date'

const DETAIL_COLUMNS =
  'id, employee_number, full_name, nationality, mobile, email, branch_id, job_title, employment_status, hire_date, iqama_number, iqama_expiry_date, passport_number, passport_expiry_date, notes'

type BranchOption = Pick<Branch, 'id' | 'name' | 'is_active'>

export default function Employees() {
  const { company, loading: companyLoading, error: companyError, ambiguous, canManageEmployees, canDeleteEmployees } =
    useCompany()
  const [rows, setRows] = useState<Employee[]>([])
  const [branches, setBranches] = useState<BranchOption[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [search, setSearch] = useState('')
  const [branchFilter, setBranchFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState<'' | EmploymentStatus>('')
  const [draft, setDraft] = useState<EmployeeDraft | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<Employee | null>(null)
  const [deletingBusy, setDeletingBusy] = useState(false)

  const load = useCallback(async () => {
    if (!company) {
      setRows([])
      setBranches([])
      setLoading(false)
      return
    }
    setLoading(true)
    setError('')
    const [employeesRes, branchesRes] = await Promise.all([
      supabase.from('employees').select(LIST_COLUMNS).order('full_name'),
      supabase.from('branches').select('id, name, is_active').order('name'),
    ])
    if (employeesRes.error || branchesRes.error) {
      setRows([])
      setBranches([])
      setError(employeeError(employeesRes.error || branchesRes.error))
    } else {
      setRows((employeesRes.data ?? []).map((row) => readEmployee(row as Record<string, unknown>)))
      setBranches((branchesRes.data ?? []) as BranchOption[])
    }
    setLoading(false)
  }, [company])

  useEffect(() => {
    if (companyLoading) return
    void load()
  }, [companyLoading, load])

  const branchName = useMemo(() => new Map(branches.map((branch) => [branch.id, branch.name])), [branches])

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase()
    return rows.filter((row) => {
      if (statusFilter && row.employment_status !== statusFilter) return false
      if (branchFilter === 'none' && row.branch_id) return false
      if (branchFilter && branchFilter !== 'none' && row.branch_id !== branchFilter) return false
      if (!term) return true
      return [row.full_name, row.employee_number, row.iqama_number, row.mobile].some((value) =>
        (value ?? '').toLowerCase().includes(term),
      )
    })
  }, [rows, search, branchFilter, statusFilter])

  async function openEdit(id: string) {
    setError('')
    setNotice('')
    const { data, error: queryError } = await supabase.from('employees').select(DETAIL_COLUMNS).eq('id', id).maybeSingle()
    if (queryError || !data) {
      setError(queryError ? employeeError(queryError) : 'تعذر فتح بيانات الموظف')
      return
    }
    setDraft(employeeToDraft(readEmployee(data as Record<string, unknown>)))
  }

  async function save(event: FormEvent) {
    event.preventDefault()
    if (!draft || !canManageEmployees) return
    const parsed = draftToInput(draft)
    if ('error' in parsed) {
      setError(parsed.error)
      return
    }
    setSaving(true)
    setError('')
    const result = draft.id
      ? await supabase.from('employees').update(parsed.input).eq('id', draft.id)
      : await supabase.from('employees').insert(parsed.input)
    setSaving(false)
    if (result.error) {
      setError(employeeError(result.error))
      return
    }
    setDraft(null)
    setNotice(draft.id ? 'تم تحديث الموظف' : 'تمت إضافة الموظف')
    void load()
  }

  async function removeEmployee() {
    if (!deleting || !canDeleteEmployees) return
    setDeletingBusy(true)
    setError('')
    const { error: deleteError } = await supabase.from('employees').delete().eq('id', deleting.id)
    setDeletingBusy(false)
    if (deleteError) {
      setError(employeeError(deleteError))
      return
    }
    setDeleting(null)
    setNotice('تم حذف الموظف')
    void load()
  }

  const waiting = companyLoading || loading

  return (
    <>
      <div className="page-head">
        <div>
          <h1>الموظفين</h1>
          <p className="page-sub">
            {company ? company.name : 'موظفو الشركة الحالية'}
            {!waiting && company ? ` — ${visible.length} من ${rows.length}` : ''}
          </p>
        </div>
        {canManageEmployees && company && (
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              setError('')
              setNotice('')
              setDraft(emptyEmployeeDraft())
            }}
          >
            إضافة موظف
          </button>
        )}
      </div>

      {notice && !draft && !deleting && <div className="alert alert-ok">{notice}</div>}
      {(companyError || error) && !draft && !deleting && <div className="alert alert-error">{companyError || error}</div>}

      <div className="card">
        <div className="filters">
          <div className="field">
            <label htmlFor="employee-search">بحث</label>
            <input
              id="employee-search"
              value={search}
              placeholder="الاسم، الرقم الوظيفي، الإقامة، أو الجوال"
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="employee-branch-filter">الفرع</label>
            <select id="employee-branch-filter" value={branchFilter} onChange={(event) => setBranchFilter(event.target.value)}>
              <option value="">كل الفروع</option>
              <option value="none">بدون فرع</option>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="employee-status-filter">حالة التوظيف</label>
            <select
              id="employee-status-filter"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as '' | EmploymentStatus)}
            >
              <option value="">كل الحالات</option>
              {(Object.keys(employmentStatusLabel) as EmploymentStatus[]).map((status) => (
                <option key={status} value={status}>
                  {employmentStatusLabel[status]}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="card">
        {waiting ? (
          <div className="empty">جارٍ التحميل…</div>
        ) : !company ? (
          <div className="empty">
            {ambiguous ? 'يوجد أكثر من شركة لهذا الحساب ولم تُحدَّد الشركة النشطة.' : 'لا توجد شركة نشطة لهذا الحساب.'}
          </div>
        ) : rows.length === 0 ? (
          <div className="empty">لا يوجد موظفون</div>
        ) : visible.length === 0 ? (
          <div className="empty">لا توجد نتائج مطابقة</div>
        ) : (
          <>
            <div className="table-wrap employee-table">
              <table>
                <thead>
                  <tr>
                    <th>الرقم</th>
                    <th>الاسم</th>
                    <th>الجنسية</th>
                    <th>الفرع</th>
                    <th>الجوال</th>
                    <th>المسمى</th>
                    <th>الحالة</th>
                    <th>الإقامة</th>
                    <th>انتهاء الإقامة</th>
                    <th>انتهاء الجواز</th>
                    {(canManageEmployees || canDeleteEmployees) && <th />}
                  </tr>
                </thead>
                <tbody>
                  {visible.map((row) => (
                    <tr key={row.id}>
                      <td>{row.employee_number || '—'}</td>
                      <td className="strong">
                        <Link to={`/employees/${row.id}`}>{row.full_name}</Link>
                      </td>
                      <td>{row.nationality || '—'}</td>
                      <td>{row.branch_id ? branchName.get(row.branch_id) || '—' : '—'}</td>
                      <td className="num" dir="ltr">
                        {row.mobile || '—'}
                      </td>
                      <td>{row.job_title || '—'}</td>
                      <td>
                        <span className="badge badge-locked">{employmentStatusLabel[row.employment_status]}</span>
                      </td>
                      <td className="num" dir="ltr">
                        {row.iqama_number || '—'}
                      </td>
                      <td>
                        <ExpiryDate value={row.iqama_expiry_date} />
                      </td>
                      <td>
                        <ExpiryDate value={row.passport_expiry_date} />
                      </td>
                      {(canManageEmployees || canDeleteEmployees) && (
                        <td>
                          <div className="branch-actions">
                            {canManageEmployees && (
                              <button type="button" className="btn btn-ghost btn-sm" onClick={() => void openEdit(row.id)}>
                                تعديل
                              </button>
                            )}
                            {canDeleteEmployees && (
                              <button type="button" className="btn btn-danger btn-sm" onClick={() => setDeleting(row)}>
                                حذف
                              </button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="employee-cards">
              {visible.map((row) => (
                <article className="employee-card" key={row.id}>
                  <div className="employee-card-head">
                    <Link to={`/employees/${row.id}`} className="strong">
                      {row.full_name}
                    </Link>
                    <span className="badge badge-locked">{employmentStatusLabel[row.employment_status]}</span>
                  </div>
                  <div className="employee-card-meta">
                    <span>{row.employee_number || 'بدون رقم'}</span>
                    <span>{row.branch_id ? branchName.get(row.branch_id) || '—' : 'بدون فرع'}</span>
                    <span>{row.job_title || 'بدون مسمى'}</span>
                  </div>
                  <div className="num" dir="ltr">
                    {row.mobile || '—'}
                  </div>
                  <div>الإقامة: {row.iqama_number || '—'}</div>
                  <div>
                    انتهاء الإقامة: <ExpiryDate value={row.iqama_expiry_date} />
                  </div>
                  <div>
                    انتهاء الجواز: <ExpiryDate value={row.passport_expiry_date} />
                  </div>
                  {(canManageEmployees || canDeleteEmployees) && (
                    <div className="branch-actions">
                      {canManageEmployees && (
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => void openEdit(row.id)}>
                          تعديل
                        </button>
                      )}
                      {canDeleteEmployees && (
                        <button type="button" className="btn btn-danger btn-sm" onClick={() => setDeleting(row)}>
                          حذف
                        </button>
                      )}
                    </div>
                  )}
                </article>
              ))}
            </div>
          </>
        )}
      </div>

      <Modal
        title={draft?.id ? 'تعديل الموظف' : 'إضافة موظف'}
        open={Boolean(draft)}
        onClose={() => {
          if (!saving) setDraft(null)
        }}
      >
        {draft && (
          <EmployeeForm
            draft={draft}
            branches={branches}
            saving={saving}
            error={error}
            onChange={setDraft}
            onSubmit={(event) => void save(event)}
            onCancel={() => setDraft(null)}
          />
        )}
      </Modal>

      <Modal title="حذف الموظف" compact hideHeader open={Boolean(deleting)} onClose={() => !deletingBusy && setDeleting(null)}>
        {deleting && (
          <div className="confirm-dialog">
            <p className="confirm-copy">هل أنت متأكد من حذف هذا الموظف؟</p>
            <p className="confirm-detail">{deleting.full_name}</p>
            <p className="confirm-detail">قد يفشل الحذف إذا كان الموظف مرتبطاً بمستندات أو مهام أو سجلات أخرى.</p>
            {error && <div className="alert alert-error">{error}</div>}
            <div className="confirm-actions">
              <button type="button" className="btn confirm-delete" disabled={deletingBusy} onClick={() => void removeEmployee()}>
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
