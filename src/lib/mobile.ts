/** Same rules as public.normalize_mobile: drop spaces and separators, keep the digits. */
export function normalizeMobile(value: string): string {
  return value.replace(/[\s\u00A0\u2000-\u200B\u202F\u205F\u3000().\-]+/g, '')
}

/** Full-string HTML pattern for a local Saudi mobile: 05 and 8 more digits. */
export const SAUDI_MOBILE_PATTERN = '05[0-9]{8}'

/**
 * Saudi mobiles only (05xxxxxxxx, or the same number with 966 / +966 / 00966).
 * Returns the local form 05xxxxxxxx, or null when the value is not a Saudi mobile.
 */
export function saudiMobile(value: string): string | null {
  const compact = normalizeMobile(value.trim())
  const match = compact.match(/^(?:\+966|00966|966)?0?(5\d{8})$/)
  return match ? `0${match[1]}` : null
}

/** What the mobile field may contain while a Saudi number is being typed. */
export function saudiMobileInput(raw: string): string {
  const complete = saudiMobile(raw)
  if (complete) return complete

  let digits = raw.replace(/\D/g, '')
  if (digits.startsWith('00966')) digits = digits.slice(5)
  else if (digits.startsWith('966')) digits = digits.slice(3)
  if (digits.startsWith('5')) digits = `0${digits}`

  if (!digits.startsWith('0')) return ''
  if (digits.length === 1) return '0'
  if (digits[1] !== '5') return '0'
  return digits.slice(0, 10)
}
