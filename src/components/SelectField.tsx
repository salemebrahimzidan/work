import { useEffect, useId, useRef, useState, type RefObject } from 'react'
import { createPortal } from 'react-dom'

interface Option {
  value: string
  label: string
}

interface Props {
  id?: string
  value: string
  onChange: (value: string) => void
  options: Option[]
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

function useAnchor(open: boolean, rootRef: RefObject<HTMLElement | null>) {
  const [box, setBox] = useState({ top: 0, left: 0, width: 0 })

  useEffect(() => {
    if (!open) return

    function place() {
      const rect = rootRef.current?.getBoundingClientRect()
      if (!rect) return
      setBox({ top: rect.bottom + 4, left: rect.left, width: rect.width })
    }

    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open, rootRef])

  return box
}

export function ComboField({
  id,
  value,
  onChange,
  options,
  required,
}: {
  id?: string
  value: string
  onChange: (value: string) => void
  options: string[]
  required?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<string | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLUListElement>(null)
  const listId = useId()
  const box = useAnchor(open, rootRef)
  const text = draft ?? value
  const choices = !value || options.includes(value) ? options : [value, ...options]
  const query = draft?.trim() ?? ''
  const visible = query && query !== value ? choices.filter((item) => item.includes(query)) : choices

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
          if (draft !== null) onChange(draft)
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
            style={{ top: box.top, left: box.left, width: box.width }}
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

export default function SelectField({ id, value, onChange, options }: Props) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLUListElement>(null)
  const listId = useId()
  const selected = options.find((option) => option.value === value) ?? options[0]

  useDismiss(open, () => setOpen(false), rootRef, menuRef)

  return (
    <div className={open ? 'select-field open' : 'select-field'} ref={rootRef}>
      <button
        id={id}
        type="button"
        className="select-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
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
      {open && (
        <ul className="select-menu" id={listId} role="listbox" ref={menuRef}>
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
        </ul>
      )}
    </div>
  )
}
