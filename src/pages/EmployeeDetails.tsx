import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useCompany } from '../auth/CompanyProvider'
import Modal from '../components/Modal'
import EmployeeForm from '../components/EmployeeForm'
import ExpiryDate from '../components/ExpiryDate'
import EmployeeDocuments from '../components/EmployeeDocuments'
import EmployeeTasks from '../components/EmployeeTasks'
import EmployeeActivity from '../components/EmployeeActivity'
import type { Branch, Employee, EmploymentStatus } from '../lib/types'
import {
  draftToInput,
  employeeError,
  employeeToDraft,
  employmentStatusLabel,
  formatEmployeeDate,
  readEmployee,
  type EmployeeDraft,
} from '../lib/employees'

const DETAIL_COLUMNS =
  'id, employee_number, full_name, nationality, mobile, email, branch_id, job_title, employment_status, hire_date, iqama_number, iqama_expiry_date, passport_number, passport_expiry_date, notes'

type BranchOption = Pick<Branch, 'id' | 'name' | 'is_active' | 'city'>

function statusClass(status: EmploymentStatus) {
  if (status === 'active') return 'badge badge-completed'
  if (status === 'vacation') return 'badge badge-pending'
  if (status === 'terminated') return 'badge badge-cancelled'
  return 'badge badge-locked'
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return 'م'
  if (parts.length === 1) return parts[0].slice(0, 1)
  return `${parts[0].slice(0, 1)}${parts[1].slice(0, 1)}`
}

function Field({ label, value, ltr }: { label: string; value: string; ltr?: boolean }) {
  const empty = !value.trim() || value === '—'
  return (
    <div className={empty ? 'profile-field is-empty' : 'profile-field'}>
      <div className="profile-label">{label}</div>
      <div className={ltr ? 'profile-value num' : 'profile-value'} dir={ltr ? 'ltr' : undefined}>
        {value || '—'}
      </div>
    </div>
  )
}

export default function EmployeeDetails() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const { company, loading: companyLoading, error: companyError, canManageEmployees, canDeleteEmployees } = useCompany()
  const [employee, setEmployee] = useState<Employee | null>(null)
  const [branches, setBranches] = useState<BranchOption[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [draft, setDraft] = useState<EmployeeDraft | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deletingBusy, setDeletingBusy] = useState(false)

  const load = useCallback(async () => {
    if (!id) return
    setLoading(true)
    setError('')
    const [employeeRes, branchesRes] = await Promise.all([
      supabase.from('employees').select(DETAIL_COLUMNS).eq('id', id).maybeSingle(),
      supabase.from('branches').select('id, name, is_active, city').order('name'),
    ])
    if (employeeRes.error || branchesRes.error) {
      setEmployee(null)
      setError(employeeError(employeeRes.error || branchesRes.error))
    } else {
      setEmployee(employeeRes.data ? readEmployee(employeeRes.data as Record<string, unknown>) : null)
      setBranches((branchesRes.data ?? []) as BranchOption[])
    }
    setLoading(false)
  }, [id])

  useEffect(() => {
    if (companyLoading) return
    void load()
  }, [companyLoading, load])

  const branch = branches.find((item) => item.id === employee?.branch_id) ?? null

  async function save(event: FormEvent) {
    event.preventDefault()
    if (!draft?.id || !canManageEmployees) return
    const parsed = draftToInput(draft)
    if ('error' in parsed) {
      setError(parsed.error)
      return
    }
    setSaving(true)
    setError('')
    const { error: saveError } = await supabase.from('employees').update(parsed.input).eq('id', draft.id)
    setSaving(false)
    if (saveError) {
      setError(employeeError(saveError))
      return
    }
    setDraft(null)
    setNotice('تم تحديث الموظف')
    void load()
  }

  async function removeEmployee() {
    if (!employee || !canDeleteEmployees) return
    setDeletingBusy(true)
    setError('')
    const { error: deleteError } = await supabase.from('employees').delete().eq('id', employee.id)
    setDeletingBusy(false)
    if (deleteError) {
      setError(employeeError(deleteError))
      return
    }
    navigate('/employees')
  }

  const waiting = companyLoading || loading

  return (
    <>
      {!employee && (
        <div className="page-head">
          <div>
            <h1>بيانات الموظف</h1>
            <p className="page-sub">
              <Link to="/employees">العودة إلى الموظفين</Link>
              {company ? ` — ${company.name}` : ''}
            </p>
          </div>
        </div>
      )}

      {notice && !draft && !deleteOpen && <div className="alert alert-ok">{notice}</div>}
      {(companyError || error) && !draft && !deleteOpen && <div className="alert alert-error">{companyError || error}</div>}

      {waiting ? (
        <div className="card">
          <div className="empty">جارٍ التحميل…</div>
        </div>
      ) : !employee ? (
        <div className="card">
          <div className="empty">لا يوجد موظف بهذه البيانات</div>
        </div>
      ) : (
        <div className="employee-sections">
          <section className="card employee-hero">
            <div className="employee-identity">
              <div className="employee-avatar" aria-hidden="true">
                {initials(employee.full_name)}
              </div>
              <div className="employee-identity-copy">
                <p className="employee-kicker">
                  <Link to="/employees">العودة إلى الموظفين</Link>
                  {company ? ` — ${company.name}` : ''}
                </p>
                <h1>{employee.full_name}</h1>
                <div className="employee-hero-meta">
                  <span className={statusClass(employee.employment_status)}>
                    {employmentStatusLabel[employee.employment_status]}
                  </span>
                  <span className="employee-chip">{employee.job_title || 'بدون مسمى'}</span>
                  <span className="employee-chip">{branch ? branch.name : 'بدون فرع'}</span>
                  {employee.employee_number ? (
                    <span className="employee-chip">
                      رقم <span className="num" dir="ltr">{employee.employee_number}</span>
                    </span>
                  ) : null}
                </div>
              </div>
            </div>
            {(canManageEmployees || canDeleteEmployees) && (
              <div className="branch-actions">
                {canManageEmployees && (
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => {
                      setError('')
                      setNotice('')
                      setDraft(employeeToDraft(employee))
                    }}
                  >
                    تعديل
                  </button>
                )}
                {canDeleteEmployees && (
                  <button type="button" className="btn btn-danger" onClick={() => setDeleteOpen(true)}>
                    حذف
                  </button>
                )}
              </div>
            )}
          </section>

          <div className="employee-pair">
            <section className="card">
              <h2 className="card-title">البيانات الأساسية</h2>
              <div className="profile-grid">
                <Field label="الرقم الوظيفي" value={employee.employee_number || '—'} />
                <Field label="الاسم الكامل" value={employee.full_name} />
                <Field label="الجنسية" value={employee.nationality || '—'} />
                <Field label="الجوال" value={employee.mobile || '—'} ltr />
                <Field label="البريد الإلكتروني" value={employee.email || '—'} ltr />
              </div>
            </section>

            <section className="card">
              <h2 className="card-title">بيانات العمل</h2>
              <div className="profile-grid">
                <Field label="الفرع" value={branch ? branch.name : 'بدون فرع'} />
                <Field label="مدينة الفرع" value={branch?.city || '—'} />
                <Field label="المسمى الوظيفي" value={employee.job_title || '—'} />
                <div className="profile-field">
                  <div className="profile-label">حالة التوظيف</div>
                  <div className="profile-value">
                    <span className={statusClass(employee.employment_status)}>
                      {employmentStatusLabel[employee.employment_status]}
                    </span>
                  </div>
                </div>
                <Field label="تاريخ التعيين" value={formatEmployeeDate(employee.hire_date)} ltr />
              </div>
            </section>
          </div>

          <div className="employee-pair">
            <section className="card">
              <h2 className="card-title">الإقامة</h2>
              <div className="profile-grid">
                <Field label="رقم الإقامة" value={employee.iqama_number || '—'} ltr />
                <div className={employee.iqama_expiry_date ? 'profile-field' : 'profile-field is-empty'}>
                  <div className="profile-label">تاريخ الانتهاء</div>
                  <div className="profile-value">
                    <ExpiryDate value={employee.iqama_expiry_date} />
                  </div>
                </div>
              </div>
            </section>

            <section className="card">
              <h2 className="card-title">الجواز</h2>
              <div className="profile-grid">
                <Field label="رقم الجواز" value={employee.passport_number || '—'} ltr />
                <div className={employee.passport_expiry_date ? 'profile-field' : 'profile-field is-empty'}>
                  <div className="profile-label">تاريخ الانتهاء</div>
                  <div className="profile-value">
                    <ExpiryDate value={employee.passport_expiry_date} />
                  </div>
                </div>
              </div>
            </section>
          </div>

          <section className="card">
            <h2 className="card-title">ملاحظات</h2>
            <p className={employee.notes ? 'employee-notes' : 'note-line'}>{employee.notes || 'لا توجد ملاحظات'}</p>
          </section>

          <EmployeeDocuments employeeId={employee.id} />
          <EmployeeTasks employeeId={employee.id} branchId={employee.branch_id} />
          <EmployeeActivity employeeId={employee.id} />
        </div>
      )}

      <Modal
        title="تعديل الموظف"
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

      <Modal title="حذف الموظف" compact hideHeader open={deleteOpen} onClose={() => !deletingBusy && setDeleteOpen(false)}>
        {employee && (
          <div className="confirm-dialog">
            <p className="confirm-copy">هل أنت متأكد من حذف هذا الموظف؟</p>
            <p className="confirm-detail">{employee.full_name}</p>
            <p className="confirm-detail">قد يفشل الحذف إذا كان الموظف مرتبطاً بمستندات أو مهام أو سجلات أخرى.</p>
            {error && <div className="alert alert-error">{error}</div>}
            <div className="confirm-actions">
              <button type="button" className="btn confirm-delete" disabled={deletingBusy} onClick={() => void removeEmployee()}>
                {deletingBusy ? 'جارٍ الحذف…' : 'حذف'}
              </button>
              <button type="button" className="btn confirm-cancel" disabled={deletingBusy} onClick={() => setDeleteOpen(false)}>
                إلغاء
              </button>
            </div>
          </div>
        )}
      </Modal>
    </>
  )
}
