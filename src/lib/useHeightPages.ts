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
  // While the pager is on screen the sheet has already shrunk to make room for it.
  const pagerShown = useRef(false)
  pagerShown.current = pageCount > 1

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
      // Match the visible table's real width (it can be wider than the box when it scrolls sideways).
      const shownTable = box.querySelector('table')
      const width = Math.max(box.clientWidth, shownTable?.offsetWidth ?? 0)
      if (measureTable instanceof HTMLTableElement) measureTable.style.width = `${width}px`
      const head = box.querySelector('thead')
      const available = box.clientHeight - (head?.getBoundingClientRect().height ?? 0)
      const heights = [...body.querySelectorAll('tr')].map((row) => row.getBoundingClientRect().height)
      let starts = pageStarts(heights, available)
      // Reserve room for the pager only before it appears; afterwards the sheet height already excludes it.
      if (starts.length > 1 && !pagerShown.current) starts = pageStarts(heights, available - 52)
      setBreaks((current) =>
        current.length === starts.length && current.every((value, index) => value === starts[index]) ? current : starts,
      )
      setPage((current) => Math.min(current, Math.max(0, starts.length - 1)))
    }

    layout()
    const observer = new ResizeObserver(layout)
    observer.observe(sheet)
    observer.observe(measure)
    window.addEventListener('resize', layout)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', layout)
    }
  }, [active, itemCount, layoutKey])

  return { sheetRef, measureRef, start, end, pageCount, currentPage, setPage }
}
