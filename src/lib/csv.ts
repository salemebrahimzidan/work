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

export function toCsv(rows: CsvValue[][]): string {
  return rows.map((row) => row.map(csvField).join(',')).join('\r\n')
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
