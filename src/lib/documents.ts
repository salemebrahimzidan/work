export const DOCUMENT_TYPES = ['iqama', 'passport', 'contract', 'insurance', 'other'] as const

export type KnownDocumentType = (typeof DOCUMENT_TYPES)[number]

export const documentTypeLabel: Record<KnownDocumentType, string> = {
  iqama: 'إقامة',
  passport: 'جواز سفر',
  contract: 'عقد',
  insurance: 'تأمين',
  other: 'مستند آخر',
}

export interface EmployeeDocument {
  id: string
  document_type: string
  document_number: string | null
  issue_date: string | null
  expiry_date: string | null
  file_path: string | null
  notes: string | null
}

export interface DocumentDraft {
  id: string | null
  kind: KnownDocumentType
  customType: string
  document_number: string
  issue_date: string
  expiry_date: string
  notes: string
}

export interface DocumentInput {
  document_type: string
  document_number: string | null
  issue_date: string | null
  expiry_date: string | null
  notes: string | null
}

export function emptyDocumentDraft(): DocumentDraft {
  return {
    id: null,
    kind: 'iqama',
    customType: '',
    document_number: '',
    issue_date: '',
    expiry_date: '',
    notes: '',
  }
}

export function documentToDraft(row: EmployeeDocument): DocumentDraft {
  const known = DOCUMENT_TYPES.find((type) => type === row.document_type && type !== 'other')
  return {
    id: row.id,
    kind: known ?? 'other',
    customType: known ? '' : row.document_type === 'other' ? '' : row.document_type,
    document_number: row.document_number ?? '',
    issue_date: row.issue_date?.slice(0, 10) ?? '',
    expiry_date: row.expiry_date?.slice(0, 10) ?? '',
    notes: row.notes ?? '',
  }
}

export function documentTypeText(value: string): string {
  if (value === 'iqama' || value === 'passport' || value === 'contract' || value === 'insurance' || value === 'other') {
    return documentTypeLabel[value]
  }
  return value
}

export function draftToDocumentInput(draft: DocumentDraft): { error: string } | { input: DocumentInput } {
  const custom = draft.customType.trim()
  if (draft.kind === 'other' && !custom) return { error: 'أدخل اسم المستند' }
  const documentType = draft.kind === 'other' ? custom : draft.kind
  if (!documentType.trim()) return { error: 'أدخل نوع المستند' }

  const issueDate = blankToNull(draft.issue_date)
  const expiryDate = blankToNull(draft.expiry_date)
  if (!isIsoDate(issueDate) || !isIsoDate(expiryDate)) return { error: 'صيغة التاريخ غير صحيحة' }
  if (issueDate && expiryDate && expiryDate < issueDate) return { error: 'تاريخ الانتهاء أسبق من تاريخ الإصدار' }

  return {
    input: {
      document_type: documentType.trim(),
      document_number: blankToNull(draft.document_number),
      issue_date: issueDate,
      expiry_date: expiryDate,
      notes: blankToNull(draft.notes),
    },
  }
}

export function documentError(error: unknown): string {
  const message = typeof error === 'string' ? error : (error as { message?: string } | null)?.message || ''
  if (/employee_documents_type_not_blank/i.test(message)) return 'أدخل نوع المستند'
  if (/row-level security|permission denied|violates row-level/i.test(message)) return 'لا تملك صلاحية تنفيذ هذا الإجراء'
  if (/لا تملك صلاحية/.test(message)) return message
  return message || 'حدث خطأ غير متوقع'
}

function blankToNull(value: string): string | null {
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function isIsoDate(value: string | null): boolean {
  if (!value) return true
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const parsed = new Date(Date.UTC(year, month - 1, day))
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day
}
