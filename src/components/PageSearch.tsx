import { useEffect, useMemo, useRef, useState } from 'react'
import { CornerDownLeft, FileText, Search, type LucideIcon } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import ThemeToggle from './ThemeToggle'
import { normalizeSearch } from '../lib/search'

export interface SearchPage {
  to: string
  label: string
  group?: string
  icon?: LucideIcon
}

const normalize = normalizeSearch

export default function PageSearch({ pages }: { pages: SearchPage[] }) {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  const results = useMemo(() => {
    const q = normalize(query)
    if (!q) return pages
    return pages.filter((page) => normalize(`${page.label} ${page.group ?? ''}`).includes(q))
  }, [pages, query])

  function toggle(next: boolean) {
    if (next) {
      setQuery('')
      setActive(0)
    }
    setOpen(next)
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setOpen((current) => {
          if (!current) {
            setQuery('')
            setActive(0)
          }
          return !current
        })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (!open) return
    const id = requestAnimationFrame(() => inputRef.current?.focus())
    return () => cancelAnimationFrame(id)
  }, [open])

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [active])

  function go(page: SearchPage | undefined) {
    if (!page) return
    setOpen(false)
    navigate(page.to)
  }

  function onInputKey(event: React.KeyboardEvent) {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActive((index) => Math.min(index + 1, results.length - 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActive((index) => Math.max(index - 1, 0))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      go(results[active])
    } else if (event.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <>
      <div className="topbar">
        <div className="search-pill">
          <button
            type="button"
            className="search-trigger"
            onClick={() => toggle(true)}
            aria-keyshortcuts="Control+K"
            aria-haspopup="dialog"
          >
            <Search size={17} aria-hidden="true" />
            <span className="search-pill-text">ابحث في الصفحات...</span>
            <kbd className="search-kbd" dir="ltr">
              Ctrl <span>K</span>
            </kbd>
          </button>
          <span className="search-divider" aria-hidden="true" />
          <ThemeToggle />
        </div>
      </div>

      {open && (
        <div className="palette-backdrop" onMouseDown={() => setOpen(false)}>
          <div
            className="palette"
            role="dialog"
            aria-modal="true"
            aria-label="البحث في الصفحات"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="palette-input">
              <Search size={18} aria-hidden="true" />
              <input
                ref={inputRef}
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value)
                  setActive(0)
                }}
                onKeyDown={onInputKey}
                placeholder="اكتب اسم الصفحة..."
                role="combobox"
                aria-expanded="true"
                aria-controls="palette-list"
                aria-activedescendant={results[active] ? `palette-item-${active}` : undefined}
              />
              <kbd className="search-kbd" dir="ltr">
                Esc
              </kbd>
            </div>

            {results.length === 0 ? (
              <p className="palette-empty">لا توجد صفحة بهذا الاسم</p>
            ) : (
              <ul className="palette-list" id="palette-list" role="listbox" ref={listRef}>
                {results.map((page, index) => {
                  const Icon = page.icon ?? FileText
                  return (
                    <li
                      key={page.to}
                      id={`palette-item-${index}`}
                      role="option"
                      aria-selected={index === active}
                      className="palette-item"
                      onMouseEnter={() => setActive(index)}
                      onClick={() => go(page)}
                    >
                      <span className="palette-icon" aria-hidden="true">
                        <Icon size={16} />
                      </span>
                      <span className="palette-label">{page.label}</span>
                      {page.group && <span className="palette-group">{page.group}</span>}
                      <CornerDownLeft className="palette-enter" size={14} aria-hidden="true" />
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </>
  )
}
