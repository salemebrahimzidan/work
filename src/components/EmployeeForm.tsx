import type { FormEvent } from 'react'
import type { Branch } from '../lib/types'
import {
  EMPLOYMENT_STATUSES,
  employmentStatusLabel,
  type EmployeeDraft,
} from '../lib/employees'

interface Props {
  draft: EmployeeDraft
  branches: Array<Pick<Branch, 'id' | 'name' | 'is_active'>>
  saving: boolean
  error: string
  onChange: (draft: EmployeeDraft) => void
  onSubmit: (event: FormEvent) => void
  onCancel: () => void
}

export default function EmployeeForm({ draft, branches, saving, error, onChange, onSubmit, onCancel }: Props) {
  const choices = branches.filter((branch) => branch.is_active || branch.id === draft.branch_id)

  function set<K extends keyof EmployeeDraft>(key: K, value: EmployeeDraft[K]) {
    onChange({ ...draft, [key]: value })
  }

  return (
    <form className="service-add-form" onSubmit={onSubmit}>
      {error && <div className="alert alert-error">{error}</div>}
      <div className="form-grid">
        <div className="field">
          <label htmlFor="employee-name">الاسم الكامل</label>
          <input id="employee-name" required value={draft.full_name} onChange={(event) => set('full_name', event.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="employee-number">الرقم الوظيفي</label>
          <input
            id="employee-number"
            value={draft.employee_number}
            onChange={(event) => set('employee_number', event.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="employee-nationality">الجنسية</label>
          <input
            id="employee-nationality"
            value={draft.nationality}
            onChange={(event) => set('nationality', event.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="employee-mobile">الجوال</label>
          <input id="employee-mobile" dir="ltr" value={draft.mobile} onChange={(event) => set('mobile', event.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="employee-email">البريد الإلكتروني</label>
          <input
            id="employee-email"
            type="email"
            dir="ltr"
            value={draft.email}
            onChange={(event) => set('email', event.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="employee-branch">الفرع</label>
          <select id="employee-branch" value={draft.branch_id} onChange={(event) => set('branch_id', event.target.value)}>
            <option value="">بدون فرع</option>
            {choices.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
                {branch.is_active ? '' : ' (متوقف)'}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="employee-title">المسمى الوظيفي</label>
          <input id="employee-title" value={draft.job_title} onChange={(event) => set('job_title', event.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="employee-status">حالة التوظيف</label>
          <select
            id="employee-status"
            value={draft.employment_status}
            onChange={(event) => set('employment_status', event.target.value as EmployeeDraft['employment_status'])}
          >
            {EMPLOYMENT_STATUSES.map((status) => (
              <option key={status} value={status}>
                {employmentStatusLabel[status]}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="employee-hire">تاريخ التعيين</label>
          <input
            id="employee-hire"
            type="date"
            dir="ltr"
            value={draft.hire_date}
            onChange={(event) => set('hire_date', event.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="employee-iqama">رقم الإقامة</label>
          <input
            id="employee-iqama"
            dir="ltr"
            value={draft.iqama_number}
            onChange={(event) => set('iqama_number', event.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="employee-iqama-expiry">انتهاء الإقامة</label>
          <input
            id="employee-iqama-expiry"
            type="date"
            dir="ltr"
            value={draft.iqama_expiry_date}
            onChange={(event) => set('iqama_expiry_date', event.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="employee-passport">رقم الجواز</label>
          <input
            id="employee-passport"
            dir="ltr"
            value={draft.passport_number}
            onChange={(event) => set('passport_number', event.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="employee-passport-expiry">انتهاء الجواز</label>
          <input
            id="employee-passport-expiry"
            type="date"
            dir="ltr"
            value={draft.passport_expiry_date}
            onChange={(event) => set('passport_expiry_date', event.target.value)}
          />
        </div>
        <div className="field full">
          <label htmlFor="employee-notes">ملاحظات</label>
          <textarea id="employee-notes" value={draft.notes} onChange={(event) => set('notes', event.target.value)} />
        </div>
      </div>
      <div className="form-actions">
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? 'جارٍ الحفظ…' : 'حفظ'}
        </button>
        <button type="button" className="btn btn-ghost" disabled={saving} onClick={onCancel}>
          إلغاء
        </button>
      </div>
    </form>
  )
}
