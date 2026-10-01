const moneyFormatter = new Intl.NumberFormat('ar-SA', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  numberingSystem: 'latn',
})

const dateFormatter = new Intl.DateTimeFormat('ar-SA', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  numberingSystem: 'latn',
  calendar: 'gregory',
  timeZone: 'Asia/Riyadh',
})

const dateTimeFormatter = new Intl.DateTimeFormat('ar-SA', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  numberingSystem: 'latn',
  calendar: 'gregory',
  timeZone: 'Asia/Riyadh',
})

export function money(value: string | number | null | undefined): string {
  const n = typeof value === 'number' ? value : Number(value ?? 0)
  return `${moneyFormatter.format(Number.isFinite(n) ? n : 0)} ر.س`
}

export function count(value: number | null | undefined): string {
  return new Intl.NumberFormat('ar-SA', { numberingSystem: 'latn' }).format(value ?? 0)
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return '—'
  return dateFormatter.format(new Date(value))
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—'
  return dateTimeFormatter.format(new Date(value))
}

/** رسائل أخطاء Supabase بصيغة مفهومة */
export function errorMessage(error: unknown): string {
  if (!error) return 'حدث خطأ غير متوقع'
  const message = typeof error === 'string' ? error : (error as { message?: string }).message || ''

  if (/invalid login credentials/i.test(message)) return 'بيانات الدخول غير صحيحة'
  if (/email not confirmed/i.test(message)) return 'لم يتم تأكيد البريد الإلكتروني'
  if (/row-level security|permission denied|violates row-level/i.test(message)) {
    return 'لا تملك صلاحية تنفيذ هذا الإجراء'
  }
  if (/غير قابلة للتعديل/.test(message)) return message
  return message || 'حدث خطأ غير متوقع'
}
