/**
 * Loosen Arabic spelling for search: drop diacritics/tatweel and unify أإآ→ا, ة→ه, ى→ي,
 * so "اعمال" finds "أعمال" and "فاتوره" finds "فاتورة".
 */
export function normalizeSearch(text: string): string {
  return text
    .toLowerCase()
    .replace(/[ً-ْـ]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .trim()
}
