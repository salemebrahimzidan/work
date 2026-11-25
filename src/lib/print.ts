/**
 * Print a list as a clean report (all rows, not just the visible page).
 * Builds an RTL document in a hidden iframe so the app page itself is untouched.
 */

export interface PrintColumn<T> {
  label: string
  value: (row: T) => string | number | null | undefined
  /** Numbers and amounts read left-to-right and align to the end. */
  numeric?: boolean
}

export interface PrintOptions<T> {
  title: string
  /** Short lines under the title, e.g. the active filters. */
  details?: string[]
  columns: PrintColumn<T>[]
  rows: T[]
  /** Optional closing line under the table, e.g. a total. */
  footer?: string
}

const BRAND = 'الايمان روح الذهبية'

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function printedAt(): string {
  return new Intl.DateTimeFormat('ar-SA', {
    dateStyle: 'medium',
    timeStyle: 'short',
    calendar: 'gregory',
    timeZone: 'Asia/Riyadh',
    numberingSystem: 'latn',
  }).format(new Date())
}

const STYLES = `
  /* Zero top/bottom page margin leaves the browser no room for its own header/footer
     (page URL, date, page number). The .sheet table below adds that spacing back on every page. */
  @page { size: A4 landscape; margin: 0 12mm; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: 'Segoe UI', Tahoma, 'Noto Naskh Arabic', 'Dubai', system-ui, sans-serif;
    color: #18202b;
    font-size: 11.5px;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .head { display: flex; align-items: center; justify-content: space-between; gap: 16px;
    padding-bottom: 10px; margin-bottom: 12px; border-bottom: 2px solid #0f3d34; }
  .brand { display: flex; align-items: center; gap: 10px; }
  .brand img { width: 38px; height: 38px; border-radius: 10px; }
  .brand-name { font-size: 15px; font-weight: 800; color: #0f3d34; }
  .brand-name span { display: block; font-size: 11px; font-weight: 600; color: #8a7346; }
  .meta { text-align: left; color: #687385; font-size: 11px; line-height: 1.6; }
  h1 { margin: 0 0 4px; font-size: 18px; }
  .details { margin: 0 0 12px; color: #3b4654; font-size: 11.5px; }
  .details span + span::before { content: ' · '; color: #98a2b3; }
  .sheet { width: 100%; border-collapse: collapse; }
  .sheet > thead { display: table-header-group; }
  .sheet > tfoot { display: table-footer-group; }
  .sheet > * > tr > td { padding: 0; border: 0; background: none; }
  .sheet-space { height: 12mm; }
  .data { width: 100%; border-collapse: collapse; }
  .data thead { display: table-header-group; }
  .data th { background: #f1f5f4; color: #3b4654; font-weight: 700; text-align: right;
    padding: 7px 8px; border-bottom: 1.5px solid #cfd8d6; white-space: nowrap; }
  .data td { padding: 6px 8px; border-bottom: 1px solid #e6eaee; vertical-align: top; }
  .data tr { break-inside: avoid; }
  .data tbody tr:nth-child(even) td { background: #fafbfb; }
  .num { direction: ltr; text-align: left; font-variant-numeric: tabular-nums; white-space: nowrap; }
  th.num { text-align: left; }
  .idx { color: #98a2b3; width: 1%; }
  .empty { padding: 24px; text-align: center; color: #687385; }
  .foot { margin-top: 10px; font-weight: 700; }
`

export function printReport<T>({ title, details = [], columns, rows, footer }: PrintOptions<T>): void {
  const head = columns
    .map((col) => `<th${col.numeric ? ' class="num"' : ''}>${escapeHtml(col.label)}</th>`)
    .join('')
  const body = rows.length
    ? rows
        .map(
          (row, index) =>
            `<tr><td class="idx num">${index + 1}</td>${columns
              .map((col) => {
                const value = col.value(row)
                const text = value == null || value === '' ? '—' : value
                return `<td${col.numeric ? ' class="num"' : ''}>${escapeHtml(text)}</td>`
              })
              .join('')}</tr>`,
        )
        .join('')
    : `<tr><td class="empty" colspan="${columns.length + 1}">لا توجد بيانات</td></tr>`

  const logo = new URL('/logo.svg', window.location.origin).href
  const html = `<!doctype html>
<html lang="ar" dir="rtl">
<head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>${STYLES}</style></head>
<body>
<table class="sheet">
<thead><tr><td class="sheet-space"></td></tr></thead>
<tfoot><tr><td class="sheet-space"></td></tr></tfoot>
<tbody><tr><td>
  <div class="head">
    <div class="brand">
      <img src="${logo}" alt="">
      <div class="brand-name">${BRAND}<span>نظام إدارة العملاء</span></div>
    </div>
    <div class="meta">تاريخ الطباعة: ${escapeHtml(printedAt())}<br>عدد السجلات: ${rows.length}</div>
  </div>
  <h1>${escapeHtml(title)}</h1>
  ${details.length ? `<p class="details">${details.map((d) => `<span>${escapeHtml(d)}</span>`).join('')}</p>` : ''}
  <table class="data">
    <thead><tr><th class="idx">#</th>${head}</tr></thead>
    <tbody>${body}</tbody>
  </table>
  ${footer ? `<p class="foot">${escapeHtml(footer)}</p>` : ''}
</td></tr></tbody>
</table>
</body>
</html>`

  const frame = document.createElement('iframe')
  frame.setAttribute('aria-hidden', 'true')
  frame.style.cssText = 'position:fixed;width:0;height:0;border:0;right:0;bottom:0;visibility:hidden'
  document.body.appendChild(frame)

  const doc = frame.contentDocument
  const win = frame.contentWindow
  if (!doc || !win) {
    frame.remove()
    return
  }
  doc.open()
  doc.write(html)
  doc.close()

  let printed = false
  const run = () => {
    if (printed) return
    printed = true
    win.focus()
    win.print()
    // Remove after the print dialog closes (afterprint), with a fallback.
    win.addEventListener('afterprint', () => frame.remove())
    setTimeout(() => frame.remove(), 60_000)
  }
  // Wait for the logo so it appears on paper; never block printing on it.
  const img = doc.querySelector('img')
  if (img && !img.complete) {
    img.addEventListener('load', run)
    img.addEventListener('error', run)
    setTimeout(run, 1500)
  } else {
    run()
  }
}
