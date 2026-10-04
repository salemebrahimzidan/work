import { useEffect, useId, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react'

const WEEKDAYS = ['أحد', 'إثن', 'ثلا', 'أرب', 'خمي', 'جمع', 'سبت']
const MONTHS = [
  'يناير',
  'فبراير',
  'مارس',
  'أبريل',
  'مايو',
  'يونيو',
  'يوليو',
  'أغسطس',
  'سبتمبر',
  'أكتوبر',
  'نوفمبر',
  'ديسمبر',
]

function parseIso(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(year, month - 1, day)
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null
  return date
}

function toIso(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

function formatDisplay(date: Date): string {
  const day = String(date.getDate()).padStart(2, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  return `${day}/${month}/${date.getFullYear()}`
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

function startOfToday(): Date {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate())
}

function monthCells(year: number, month: number): Date[] {
  const first = new Date(year, month, 1)
  const start = new Date(year, month, 1 - first.getDay())
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start)
    date.setDate(start.getDate() + index)
    return date
  })
}

function yearChoices(selectedYear: number): number[] {
  const now = new Date().getFullYear()
  const start = Math.min(2015, selectedYear)
  const end = Math.max(now + 1, selectedYear)
  const years: number[] = []
  for (let year = end; year >= start; year -= 1) years.push(year)
  return years
}

function useDismiss(
  open: boolean,
  onClose: () => void,
  rootRef: RefObject<HTMLElement | null>,
  menuRef: RefObject<HTMLElement | null>,
) {
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useEffect(() => {
    if (!open) return

    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node
      if (rootRef.current?.contains(target) || menuRef.current?.contains(target)) return
      closeRef.current()
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') closeRef.current()
    }

    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open, rootRef, menuRef])
}

function usePopover(open: boolean, rootRef: RefObject<HTMLElement | null>, menuRef: RefObject<HTMLElement | null>) {
  const [box, setBox] = useState({ top: 0, left: 0 })

  useLayoutEffect(() => {
    if (!open) return

    function place() {
      const rect = rootRef.current?.getBoundingClientRect()
      if (!rect) return
      const width = Math.min(332, window.innerWidth - 16)
      const gap = 6
      const margin = 8
      const height = menuRef.current?.offsetHeight ?? 380
      const rtl = getComputedStyle(document.documentElement).direction === 'rtl'
      const aligned = rtl ? rect.right - width : rect.left
      const left = Math.max(margin, Math.min(aligned, window.innerWidth - width - margin))
      const spaceBelow = window.innerHeight - rect.bottom - gap - margin
      const openUp = spaceBelow < height && rect.top > spaceBelow
      const top = openUp ? Math.max(margin, rect.top - gap - height) : rect.bottom + gap
      setBox({ top, left })
    }

    place()
    const frame = requestAnimationFrame(place)
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open, rootRef, menuRef])

  return box
}

export default function DateField({
  id,
  value,
  onChange,
  placeholder = 'اختر التاريخ',
}: {
  id?: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
}) {
  const selected = parseIso(value)
  const [open, setOpen] = useState(false)
  const [cursor, setCursor] = useState(() => selected ?? startOfToday())
  const rootRef = useRef<HTMLDivElement>(null)
  const popRef = useRef<HTMLDivElement>(null)
  const dialogId = useId()
  const box = usePopover(open, rootRef, popRef)

  useDismiss(open, () => setOpen(false), rootRef, popRef)

  const year = cursor.getFullYear()
  const month = cursor.getMonth()
  const today = startOfToday()
  const cells = monthCells(year, month)

  function toggle() {
    setCursor(selected ?? startOfToday())
    setOpen((current) => !current)
  }

  function pick(date: Date) {
    onChange(toIso(date))
    setOpen(false)
  }

  function shiftMonth(delta: number) {
    setCursor(new Date(year, month + delta, 1))
  }

  return (
    <div className={open ? 'date-field open' : 'date-field'} ref={rootRef}>
      <button
        id={id}
        type="button"
        className="date-trigger"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={dialogId}
        onClick={toggle}
      >
        <Calendar size={16} className="date-icon" aria-hidden="true" />
        {selected ? (
          <span className="num" dir="ltr">
            {formatDisplay(selected)}
          </span>
        ) : (
          <span className="date-placeholder">{placeholder}</span>
        )}
      </button>
      {open &&
        createPortal(
          <div
            id={dialogId}
            ref={popRef}
            className="date-popover"
            role="dialog"
            aria-label="اختيار التاريخ"
            style={{ top: box.top, left: box.left }}
          >
            <div className="date-popover-head">
              <button type="button" className="date-nav" aria-label="الشهر السابق" onClick={() => shiftMonth(-1)}>
                <ChevronRight size={16} />
              </button>
              <div className="date-popover-title">
                <select
                  className="date-select"
                  aria-label="الشهر"
                  value={month}
                  onChange={(event) => setCursor(new Date(year, Number(event.target.value), 1))}
                >
                  {MONTHS.map((name, index) => (
                    <option key={name} value={index}>
                      {name}
                    </option>
                  ))}
                </select>
                <select
                  className="date-select date-select-year"
                  aria-label="السنة"
                  value={year}
                  onChange={(event) => setCursor(new Date(Number(event.target.value), month, 1))}
                >
                  {yearChoices(year).map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </div>
              <button type="button" className="date-nav" aria-label="الشهر التالي" onClick={() => shiftMonth(1)}>
                <ChevronLeft size={16} />
              </button>
            </div>
            <div className="date-weekdays" aria-hidden="true">
              {WEEKDAYS.map((day) => (
                <span key={day}>{day}</span>
              ))}
            </div>
            <div className="date-grid">
              {cells.map((date) => {
                const outside = date.getMonth() !== month
                const isSelected = selected ? sameDay(date, selected) : false
                const isToday = sameDay(date, today)
                const className = ['date-day', outside ? 'outside' : '', isSelected ? 'selected' : '', isToday ? 'today' : '']
                  .filter(Boolean)
                  .join(' ')
                return (
                  <button
                    key={toIso(date)}
                    type="button"
                    className={className}
                    aria-pressed={isSelected}
                    aria-current={isToday ? 'date' : undefined}
                    aria-label={`${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`}
                    onClick={() => pick(date)}
                  >
                    {date.getDate()}
                  </button>
                )
              })}
            </div>
            <div className="date-popover-foot">
              <button
                type="button"
                className="date-foot"
                disabled={!selected}
                onClick={() => {
                  onChange('')
                  setOpen(false)
                }}
              >
                مسح
              </button>
              <button type="button" className="date-foot" onClick={() => pick(today)}>
                اليوم
              </button>
            </div>
          </div>,
          document.body,
        )}
    </div>
  )
}
