export type CsvValue = string | number | null | undefined

/** First meaningful character is = + - or @, including after leading whitespace. */
const FORMULA_PREFIX = /^[\s\u00A0\uFEFF]*[=+\-@]/u

export function neutralizeSpreadsheetFormula(value: string): string {
  return FORMULA_PREFIX.test(value) ? `'${value}` : value
}

export function csvField(value: CsvValue): string {
  const text = neutralizeSpreadsheetFormula(value == null ? '' : String(value))
  return `"${text.replace(/"/g, '""')}"`
}

/** Excel follows the Windows list separator. Arabic (ar-SA) uses ";" even though the decimal mark is ".". */
export function csvDelimiter(): ',' | ';' {
  const languages = [
    typeof document === 'undefined' ? '' : document.documentElement.lang,
    ...(typeof navigator === 'undefined' ? [] : (navigator.languages ?? [navigator.language])),
  ]
  if (languages.some((language) => language.toLowerCase().startsWith('ar'))) return ';'
  const sample = languages.find(Boolean)
  try {
    const decimal = new Intl.NumberFormat(sample || undefined)
      .formatToParts(1.1)
      .find((part) => part.type === 'decimal')?.value
    if (decimal === ',') return ';'
  } catch {
    return ','
  }
  return ','
}

export function toCsv(rows: CsvValue[][], delimiter: ',' | ';' = csvDelimiter()): string {
  return rows.map((row) => row.map(csvField).join(delimiter)).join('\r\n')
}

export function downloadCsv(filename: string, rows: CsvValue[][]): void {
  const csv = `\uFEFF${toCsv(rows)}\r\n`
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.rel = 'noopener'
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
