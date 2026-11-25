import { useEffect, useId, useRef, useState, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { Search } from 'lucide-react'
import { normalizeSearch } from '../lib/search'

interface Option {
  value: string
  label: string
  /** Extra text the search also matches but that isn't shown (e.g. a customer's mobile). */
  keywords?: string
}

interface Props {
  id?: string
  value: string
  onChange: (value: string) => void
  options: Option[]
  disabled?: boolean
  ariaLabel?: string
  /** Adds a search box at the top of the menu that filters options by their label. */
  searchable?: boolean
  searchPlaceholder?: string
  /** Open the (searchable) menu as soon as the field appears, with the search box focused. */
  autoOpen?: boolean
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

function useAnchor(
  open: boolean,
  rootRef: RefObject<HTMLElement | null>,
  menuRef: RefObject<HTMLElement | null>,
  cap = 240,
) {
  const [box, setBox] = useState({ top: 0, left: 0, width: 0, maxHeight: cap })

  useEffect(() => {
    if (!open) return

    function place() {
      const rect = rootRef.current?.getBoundingClientRect()
      if (!rect) return
      const gap = 4
      const margin = 8
      const spaceBelow = window.innerHeight - rect.bottom - gap - margin
      const spaceAbove = rect.top - gap - margin
      const openUp = spaceBelow < 180 && spaceAbove > spaceBelow
      const maxHeight = Math.min(cap, Math.max(80, openUp ? spaceAbove : spaceBelow))
      const measured = menuRef.current?.offsetHeight ?? maxHeight
      const height = Math.min(measured, maxHeight)
      const top = openUp ? Math.max(margin, rect.top - gap - height) : rect.bottom + gap
      setBox({ top, left: rect.left, width: rect.width, maxHeight })
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
  }, [open, rootRef, menuRef, cap])

  return box
}

export function ComboField({
  id,
  value,
  onChange,
  options,
  required,
  onlyOptions = false,
}: {
  id?: string
  value: string
  onChange: (value: string) => void
  options: string[]
  required?: boolean
  onlyOptions?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<string | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLUListElement>(null)
  const listId = useId()
  const box = useAnchor(open, rootRef, menuRef)
  const text = draft ?? value
  const choices = onlyOptions || !value || options.includes(value) ? options : [value, ...options]
  const query = draft?.trim() ?? ''
  const term = normalizeSearch(query)
  const visible =
    query && query !== value ? choices.filter((item) => normalizeSearch(item).includes(term)) : choices

  useDismiss(open, () => setOpen(false), rootRef, menuRef)

  function choose(next: string) {
    setDraft(null)
    onChange(next)
    setOpen(false)
  }

  return (
    <div className={open ? 'select-field open' : 'select-field'} ref={rootRef}>
      <input
        id={id}
        className="select-combo"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        required={required}
        value={text}
        onChange={(event) => {
          setDraft(event.target.value)
          setOpen(true)
        }}
        onBlur={() => {
          if (draft !== null) onChange(draft.trim())
          setDraft(null)
        }}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
      />
      {open &&
        visible.length > 0 &&
        createPortal(
          <ul
            className="select-menu select-menu-fixed"
            id={listId}
            role="listbox"
            ref={menuRef}
            style={{ top: box.top, left: box.left, width: box.width, maxHeight: box.maxHeight }}
          >
            {visible.map((item) => (
              <li key={item} role="presentation">
                <button
                  type="button"
                  role="option"
                  aria-selected={item === value}
                  className={item === value ? 'select-option active' : 'select-option'}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => choose(item)}
                >
                  {item}
                </button>
              </li>
            ))}
          </ul>,
          document.body,
        )}
    </div>
  )
}

export default function SelectField({
  id,
  value,
  onChange,
  options,
  disabled = false,
  ariaLabel,
  // Every dropdown is searchable by default; pass searchable={false} to opt out.
  searchable = true,
  searchPlaceholder = 'ابحث...',
  autoOpen = false,
}: Props) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLUListElement>(null)
  const listId = useId()
  const selected = options.find((option) => option.value === value) ?? options[0]
  const box = useAnchor(open, rootRef, menuRef)

  useDismiss(open, () => setOpen(false), rootRef, menuRef)

  if (searchable) {
    return (
      <SearchableSelect
        id={id}
        value={value}
        onChange={onChange}
        options={options}
        disabled={disabled}
        ariaLabel={ariaLabel}
        placeholder={searchPlaceholder}
        autoOpen={autoOpen}
      />
    )
  }

  return (
    <div className={open ? 'select-field open' : 'select-field'} ref={rootRef}>
      <button
        id={id}
        type="button"
        className="select-trigger"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
      >
        <span>{selected?.label ?? ''}</span>
        <svg className="select-chevron" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
          <path
            d="M4 6.2 8 10.2 12 6.2"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      {open &&
        createPortal(
          <ul
            className="select-menu select-menu-fixed"
            id={listId}
            role="listbox"
            ref={menuRef}
            style={{ top: box.top, left: box.left, width: box.width, maxHeight: box.maxHeight }}
          >
            {options.map((option) => {
              const active = option.value === value
              return (
                <li key={option.value || '__empty'} role="presentation">
                  <button
                    type="button"
                    role="option"
                    aria-selected={active}
                    className={active ? 'select-option active' : 'select-option'}
                    onClick={() => {
                      onChange(option.value)
                      setOpen(false)
                    }}
                  >
                    {option.label}
                  </button>
                </li>
              )
            })}
          </ul>,
          document.body,
        )}
    </div>
  )
}

/** SelectField with a search box at the top of the menu; filters by label (name, mobile, …). */
function SearchableSelect({
  id,
  value,
  onChange,
  options,
  disabled,
  ariaLabel,
  placeholder,
  autoOpen = false,
}: {
  id?: string
  value: string
  onChange: (value: string) => void
  options: Option[]
  disabled: boolean
  ariaLabel?: string
  placeholder: string
  autoOpen?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const listId = useId()
  const selected = options.find((option) => option.value === value) ?? options[0]
  const box = useAnchor(open, rootRef, menuRef, 320)

  const term = normalizeSearch(query)
  // Digits-only search also matches numbers typed without spaces or dashes (e.g. mobiles).
  const digits = query.replace(/\D/g, '')
  const visible = term
    ? options.filter((option) => {
        if (!option.value) return false
        // Hidden keywords (e.g. a customer's mobile) are searchable without being shown.
        const text = option.keywords ? `${option.label} ${option.keywords}` : option.label
        return normalizeSearch(text).includes(term) || (digits.length >= 3 && text.replace(/\D/g, '').includes(digits))
      })
    : options

  // The trigger button only exists again after the menu closes, so focus it in an effect.
  const refocus = useRef(false)
  function close(restoreFocus = false) {
    refocus.current = restoreFocus
    setOpen(false)
  }

  useEffect(() => {
    if (open || !refocus.current) return
    refocus.current = false
    triggerRef.current?.focus()
  }, [open])

  useDismiss(open, () => close(), rootRef, menuRef)

  function openMenu() {
    setQuery('')
    setActive(Math.max(0, options.findIndex((option) => option.value === value)))
    setOpen(true)
  }

  // Open once on mount when asked (e.g. "choose the customer" right after picking a service).
  const autoOpened = useRef(false)
  useEffect(() => {
    if (!autoOpen || autoOpened.current || disabled) return
    autoOpened.current = true
    openMenu()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoOpen, disabled])

  useEffect(() => {
    if (!open) return
    const frame = requestAnimationFrame(() => inputRef.current?.focus())
    return () => cancelAnimationFrame(frame)
  }, [open])

  useEffect(() => {
    if (!open) return
    listRef.current?.querySelector<HTMLElement>('[data-active="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [active, open])

  function choose(next: string) {
    onChange(next)
    close(true)
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActive((index) => Math.min(index + 1, visible.length - 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActive((index) => Math.max(index - 1, 0))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      const option = visible[active]
      if (option) choose(option.value)
    } else if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      close(true)
    } else if (event.key === 'Tab') {
      close()
    }
  }

  return (
    <div className={open ? 'select-field open' : 'select-field'} ref={rootRef}>
      {open ? (
        // While open, the field itself becomes the search box: type a name or mobile right in it.
        <div className="select-trigger select-trigger-search">
          <Search size={15} aria-hidden="true" />
          <input
            ref={inputRef}
            id={id}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              setActive(0)
            }}
            onKeyDown={onKeyDown}
            placeholder={value ? selected?.label : placeholder}
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-autocomplete="list"
            aria-label={ariaLabel ?? placeholder}
            autoComplete="off"
          />
          <button
            type="button"
            className="select-search-close"
            aria-label="إغلاق القائمة"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => close(true)}
          >
            <svg className="select-chevron" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
              <path
                d="M4 9.8 8 5.8 12 9.8"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
      ) : (
        <button
          ref={triggerRef}
          id={id}
          type="button"
          className="select-trigger"
          aria-label={ariaLabel}
          aria-haspopup="listbox"
          aria-expanded={false}
          aria-controls={listId}
          disabled={disabled}
          onClick={openMenu}
        >
          <span>{selected?.label ?? ''}</span>
          <svg className="select-chevron" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
            <path
              d="M4 6.2 8 10.2 12 6.2"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      )}
      {open &&
        createPortal(
          <div
            className="select-menu select-menu-fixed select-menu-search"
            ref={menuRef}
            style={{ top: box.top, left: box.left, width: box.width, maxHeight: box.maxHeight }}
          >
            <ul className="select-search-list" id={listId} role="listbox" ref={listRef}>
              {visible.length === 0 ? (
                <li className="select-empty">لا توجد نتائج</li>
              ) : (
                visible.map((option, index) => {
                  const isSelected = option.value === value
                  return (
                    <li key={option.value || '__empty'} role="presentation">
                      <button
                        type="button"
                        role="option"
                        tabIndex={-1}
                        aria-selected={isSelected}
                        data-active={index === active}
                        className={`select-option${isSelected ? ' active' : ''}${index === active ? ' is-focus' : ''}`}
                        onMouseDown={(event) => event.preventDefault()}
                        onMouseEnter={() => setActive(index)}
                        onClick={() => choose(option.value)}
                      >
                        {option.label}
                      </button>
                    </li>
                  )
                })
              )}
            </ul>
          </div>,
          document.body,
        )}
    </div>
  )
}
