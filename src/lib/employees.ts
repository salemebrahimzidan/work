import type { Employee, EmploymentStatus } from './types'

export const employmentStatusLabel: Record<EmploymentStatus, string> = {
  active: 'نشط',
  inactive: 'غير نشط',
  vacation: 'إجازة',
  terminated: 'منتهية الخدمة',
}

export const EMPLOYMENT_STATUSES: EmploymentStatus[] = ['active', 'inactive', 'vacation', 'terminated']

export interface EmployeeDraft {
  id: string | null
  employee_number: string
  full_name: string
  nationality: string
  mobile: string
  email: string
  branch_id: string
  job_title: string
  employment_status: EmploymentStatus
  hire_date: string
  iqama_number: string
  iqama_expiry_date: string
  passport_number: string
  passport_expiry_date: string
  notes: string
}

export interface EmployeeInput {
  employee_number: string | null
  full_name: string
  nationality: string | null
  mobile: string | null
  email: string | null
  branch_id: string | null
  job_title: string | null
  employment_status: EmploymentStatus
  hire_date: string | null
  iqama_number: string | null
  iqama_expiry_date: string | null
  passport_number: string | null
  passport_expiry_date: string | null
  notes: string | null
}

export type ExpiryKind = 'none' | 'ok' | 'soon' | 'expired'

const dayFormatter = new Intl.DateTimeFormat('ar-SA', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  numberingSystem: 'latn',
  calendar: 'gregory',
  timeZone: 'Asia/Riyadh',
})

export function emptyEmployeeDraft(): EmployeeDraft {
  return {
    id: null,
    employee_number: '',
    full_name: '',
    nationality: '',
    mobile: '',
    email: '',
    branch_id: '',
    job_title: '',
    employment_status: 'active',
    hire_date: '',
    iqama_number: '',
    iqama_expiry_date: '',
    passport_number: '',
    passport_expiry_date: '',
    notes: '',
  }
}

export function employeeToDraft(row: Employee): EmployeeDraft {
  return {
    id: row.id,
    employee_number: row.employee_number ?? '',
    full_name: row.full_name,
    nationality: row.nationality ?? '',
    mobile: row.mobile ?? '',
    email: row.email ?? '',
    branch_id: row.branch_id ?? '',
    job_title: row.job_title ?? '',
    employment_status: row.employment_status,
    hire_date: dateInput(row.hire_date),
    iqama_number: row.iqama_number ?? '',
    iqama_expiry_date: dateInput(row.iqama_expiry_date),
    passport_number: row.passport_number ?? '',
    passport_expiry_date: dateInput(row.passport_expiry_date),
    notes: row.notes ?? '',
  }
}

export function draftToInput(draft: EmployeeDraft): { error: string } | { input: EmployeeInput } {
  const fullName = draft.full_name.trim()
  if (!fullName) return { error: 'أدخل اسم الموظف' }
  if (!EMPLOYMENT_STATUSES.includes(draft.employment_status)) return { error: 'حالة التوظيف غير صالحة' }

  const email = blankToNull(draft.email)
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: 'صيغة البريد الإلكتروني غير صحيحة' }

  const hireDate = blankToNull(draft.hire_date)
  const iqamaExpiry = blankToNull(draft.iqama_expiry_date)
  const passportExpiry = blankToNull(draft.passport_expiry_date)
  if (!validDate(hireDate) || !validDate(iqamaExpiry) || !validDate(passportExpiry)) {
    return { error: 'صيغة التاريخ غير صحيحة' }
  }

  return {
    input: {
      employee_number: blankToNull(draft.employee_number),
      full_name: fullName,
      nationality: blankToNull(draft.nationality),
      mobile: blankToNull(draft.mobile),
      email,
      branch_id: draft.branch_id || null,
      job_title: blankToNull(draft.job_title),
      employment_status: draft.employment_status,
      hire_date: hireDate,
      iqama_number: blankToNull(draft.iqama_number),
      iqama_expiry_date: iqamaExpiry,
      passport_number: blankToNull(draft.passport_number),
      passport_expiry_date: passportExpiry,
      notes: blankToNull(draft.notes),
    },
  }
}

export function employeeError(error: unknown): string {
  const message = typeof error === 'string' ? error : (error as { message?: string } | null)?.message || ''
  if (/employees_company_number_key/i.test(message)) return 'الرقم الوظيفي مستخدم لموظف آخر في الشركة'
  if (/employees_company_iqama_key/i.test(message)) return 'رقم الإقامة مستخدم لموظف آخر في الشركة'
  if (/employees_company_passport_key/i.test(message)) return 'رقم الجواز مستخدم لموظف آخر في الشركة'
  if (/employees_employment_status_check/i.test(message)) return 'حالة التوظيف غير صالحة'
  if (/foreign key|violates foreign key/i.test(message)) return 'لا يمكن حذف الموظف لارتباطه بسجلات أخرى'
  if (/row-level security|permission denied|violates row-level/i.test(message)) return 'لا تملك صلاحية تنفيذ هذا الإجراء'
  return message || 'حدث خطأ غير متوقع'
}

export function formatEmployeeDate(value: string | null | undefined): string {
  if (!value) return '—'
  const day = value.slice(0, 10)
  const parsed = new Date(`${day}T12:00:00+03:00`)
  if (Number.isNaN(parsed.getTime())) return '—'
  return dayFormatter.format(parsed)
}

export function expiryKind(value: string | null | undefined): ExpiryKind {
  if (!value) return 'none'
  const day = value.slice(0, 10)
  const today = riyadhToday()
  if (day < today) return 'expired'
  if (day <= addDays(today, 30)) return 'soon'
  return 'ok'
}

export function expiryLabel(kind: ExpiryKind): string | null {
  if (kind === 'expired') return 'منتهية'
  if (kind === 'soon') return 'خلال 30 يوماً'
  return null
}

function blankToNull(value: string): string | null {
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function dateInput(value: string | null): string {
  return value ? value.slice(0, 10) : ''
}

function validDate(value: string | null): boolean {
  if (!value) return true
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const parsed = new Date(Date.UTC(year, month - 1, day))
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day
}

function riyadhToday(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Riyadh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

function addDays(iso: string, days: number): string {
  const [year, month, day] = iso.split('-').map(Number)
  const parsed = new Date(Date.UTC(year, month - 1, day + days))
  return parsed.toISOString().slice(0, 10)
}

export function asEmploymentStatus(value: string): EmploymentStatus {
  if (value === 'inactive' || value === 'vacation' || value === 'terminated') return value
  return 'active'
}

export function readEmployee(row: Record<string, unknown>): Employee {
  return {
    id: String(row.id),
    employee_number: (row.employee_number as string | null) ?? null,
    full_name: String(row.full_name ?? ''),
    nationality: (row.nationality as string | null) ?? null,
    mobile: (row.mobile as string | null) ?? null,
    email: (row.email as string | null) ?? null,
    branch_id: (row.branch_id as string | null) ?? null,
    job_title: (row.job_title as string | null) ?? null,
    employment_status: asEmploymentStatus(String(row.employment_status ?? 'active')),
    hire_date: (row.hire_date as string | null) ?? null,
    iqama_number: (row.iqama_number as string | null) ?? null,
    iqama_expiry_date: (row.iqama_expiry_date as string | null) ?? null,
    passport_number: (row.passport_number as string | null) ?? null,
    passport_expiry_date: (row.passport_expiry_date as string | null) ?? null,
    notes: (row.notes as string | null) ?? null,
  }
}
