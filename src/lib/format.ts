import { createElement, type ReactNode } from 'react'
import { ExternalLink } from 'lucide-react'

const moneyFormatter = new Intl.NumberFormat('ar-SA', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  numberingSystem: 'latn',
})

const dateFormatter = new Intl.DateTimeFormat('en-GB', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  timeZone: 'Asia/Riyadh',
})

const dateTimeFormatter = new Intl.DateTimeFormat('en-GB', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
  timeZone: 'Asia/Riyadh',
})

export function money(value: string | number | null | undefined): string {
  const n = typeof value === 'number' ? value : Number(value ?? 0)
  return `${moneyFormatter.format(Number.isFinite(n) ? n : 0)} ر.س`
}

export function count(value: number | null | undefined): string {
  return new Intl.NumberFormat('ar-SA', { numberingSystem: 'latn' }).format(value ?? 0)
}

export function transactionStatus(status: string | null | undefined) {
  if (status === 'pending') return { label: 'قيد الانتظار', badge: 'badge badge-pending' }
  if (status === 'in_progress') return { label: 'قيد التنفيذ', badge: 'badge badge-progress' }
  if (status === 'completed') return { label: 'مكتملة', badge: 'badge badge-completed' }
  if (status === 'cancelled') return { label: 'ملغاة', badge: 'badge badge-cancelled' }
  return { label: 'مقفل', badge: 'badge badge-locked' }
}

export function formatRiyadhDate(date: Date): string {
  return dateFormatter.format(date)
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return '—'
  return formatRiyadhDate(new Date(value))
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
  if (/profession/i.test(message) && /schema cache|column/i.test(message)) {
    return 'المهنة غير جاهزة. شغّل ملف 0040_customer_optional_mobile_profession.sql في Supabase ثم حدّث الصفحة.'
  }
  if (/customers_mobile_check|mobile_normalized/i.test(message)) {
    return 'حفظ العميل بدون جوال غير جاهز. شغّل ملف 0040_customer_optional_mobile_profession.sql في Supabase ثم حدّث الصفحة.'
  }
  return message || 'حدث خطأ غير متوقع'
}

const STEP_LINK = /(?:https?:\/\/|www\.)[^\s<>"']+/gi

/** Turns web addresses in step text into links that open in a new tab. */
export function linkedText(text: string): ReactNode[] {
  const nodes: ReactNode[] = []
  let last = 0
  for (const match of text.matchAll(STEP_LINK)) {
    const raw = match[0]
    const index = match.index ?? 0
    const hrefBody = raw.replace(/[.,;:!?)]+$/, '')
    const trailing = raw.slice(hrefBody.length)
    if (index > last) nodes.push(text.slice(last, index))
    const href = hrefBody.startsWith('www.') ? `https://${hrefBody}` : hrefBody
    nodes.push(
      createElement(
        'a',
        {
          key: `${index}-${href}`,
          className: 'service-step-link',
          href,
          target: '_blank',
          rel: 'noopener noreferrer',
          title: hrefBody,
          'aria-label': 'فتح الرابط',
        },
        createElement(ExternalLink, { size: 14, strokeWidth: 2, 'aria-hidden': true }),
      ),
    )
    if (trailing) nodes.push(trailing)
    last = index + raw.length
  }
  if (last < text.length) nodes.push(text.slice(last))
  return nodes
}
