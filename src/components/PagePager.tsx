import { useEffect, useState } from 'react'

function useNarrow() {
  const [narrow, setNarrow] = useState(() => window.matchMedia('(max-width: 800px)').matches)

  useEffect(() => {
    const media = window.matchMedia('(max-width: 800px)')
    const onChange = () => setNarrow(media.matches)
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [])

  return narrow
}

function pageSlots(current: number, count: number): Array<number | 'gap'> {
  const keep = new Set<number>([0, count - 1, current])
  for (const next of [current - 1, current + 1]) {
    if (next > 0 && next < count - 1) keep.add(next)
  }
  const pages = [...keep].sort((a, b) => a - b)
  const slots: Array<number | 'gap'> = []
  pages.forEach((page, index) => {
    if (index > 0 && page - pages[index - 1] > 1) slots.push('gap')
    slots.push(page)
  })
  return slots
}

export function PagePager({
  page,
  pageCount,
  onPage,
  className,
}: {
  page: number
  pageCount: number
  onPage: (page: number) => void
  className: string
}) {
  const narrow = useNarrow()
  const many = pageCount > 7
  const slots = many ? pageSlots(page, pageCount) : Array.from({ length: pageCount }, (_, index) => index)

  return (
    <div className={className}>
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        disabled={page === 0}
        onClick={() => onPage(page - 1)}
      >
        السابق
      </button>
      {narrow && many ? (
        <span className="pager-status">
          {page + 1} / {pageCount}
        </span>
      ) : (
        slots.map((slot, index) =>
          slot === 'gap' ? (
            <span key={`gap-${index}`} className="pager-gap" aria-hidden="true">
              …
            </span>
          ) : (
            <button
              key={slot}
              type="button"
              className={slot === page ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm'}
              onClick={() => onPage(slot)}
            >
              {slot + 1}
            </button>
          ),
        )
      )}
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        disabled={page >= pageCount - 1}
        onClick={() => onPage(page + 1)}
      >
        التالي
      </button>
    </div>
  )
}
