/** Same rules as public.normalize_mobile: drop spaces and separators, keep the digits. */
export function normalizeMobile(value: string): string {
  return value.replace(/[\s\u00A0\u2000-\u200B\u202F\u205F\u3000().\-]+/g, '')
}
