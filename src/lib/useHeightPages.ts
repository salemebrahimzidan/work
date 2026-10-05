import { useLayoutEffect, useRef, useState } from 'react'

function pageStarts(heights: number[], available: number): number[] {
  const starts = [0]
  let used = 0
  heights.forEach((height, index) => {
    const rowHeight = Math.max(height, 1)
    if (index > starts[starts.length - 1] && used + rowHeight > available + 1) {
      starts.push(index)
      used = rowHeight
    } else {
      used += rowHeight
    }
  })
  return starts
}

export function useHeightPages(itemCount: number, active: boolean, layoutKey = '') {
  const [page, setPage] = useState(0)
  const [breaks, setBreaks] = useState<number[]>([0])
  const sheetRef = useRef<HTMLDivElement>(null)
  const measureRef = useRef<HTMLTableSectionElement>(null)
  const pageCount = breaks.length
  const currentPage = Math.min(page, Math.max(0, pageCount - 1))
  const start = breaks[currentPage] ?? 0
  const end = breaks[currentPage + 1] ?? itemCount

  useLayoutEffect(() => {
    if (!active || itemCount === 0) {
      setBreaks((current) => (current.length === 1 && current[0] === 0 ? current : [0]))
      setPage(0)
      return
    }

    const sheet = sheetRef.current
    const measure = measureRef.current
    if (!sheet || !measure) return

    function layout() {
      const box = sheetRef.current
      const body = measureRef.current
      if (!box || !body) return
      const narrow = window.matchMedia('(max-width: 800px)').matches
      if (narrow || box.clientHeight <= 0) {
        setBreaks((current) => (current.length === 1 && current[0] === 0 ? current : [0]))
        return
      }
      const measureTable = body.closest('table')
      if (measureTable instanceof HTMLTableElement) measureTable.style.width = `${box.clientWidth}px`
      const head = box.querySelector('thead')
      const available = box.clientHeight - (head?.getBoundingClientRect().height ?? 0)
      const heights = [...body.querySelectorAll('tr')].map((row) => row.getBoundingClientRect().height)
      let starts = pageStarts(heights, available)
      if (starts.length > 1) starts = pageStarts(heights, available - 52)
      setBreaks((current) =>
        current.length === starts.length && current.every((value, index) => value === starts[index]) ? current : starts,
      )
      setPage((current) => Math.min(current, Math.max(0, starts.length - 1)))
    }

    layout()
    const observer = new ResizeObserver(layout)
    observer.observe(sheet)
    window.addEventListener('resize', layout)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', layout)
    }
  }, [active, itemCount, layoutKey])

  return { sheetRef, measureRef, start, end, pageCount, currentPage, setPage }
}
