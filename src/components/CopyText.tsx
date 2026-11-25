import { useEffect, useId, useRef, useState } from 'react'
import { Check, Copy } from 'lucide-react'

/** Fired on every copy so only the most recently copied value keeps its "تم النسخ" badge. */
const COPIED_EVENT = 'copytext:copied'

/** A value (mobile, iqama, code…) that copies itself on click and briefly shows "تم النسخ". */
export default function CopyText({ value, label = 'نسخ' }: { value: string; label?: string }) {
  const id = useId()
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => () => clearTimeout(timer.current), [])

  // Another value was copied: drop this one's confirmation right away.
  useEffect(() => {
    function onOtherCopied(event: Event) {
      if ((event as CustomEvent<string>).detail === id) return
      clearTimeout(timer.current)
      setCopied(false)
    }
    window.addEventListener(COPIED_EVENT, onOtherCopied)
    return () => window.removeEventListener(COPIED_EVENT, onOtherCopied)
  }, [id])

  async function copy() {
    window.dispatchEvent(new CustomEvent(COPIED_EVENT, { detail: id }))
    // Confirm right away; the clipboard write can take a moment to resolve.
    setCopied(true)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setCopied(false), 1800)
    try {
      await navigator.clipboard.writeText(value)
    } catch {
      // Older browsers / blocked clipboard: fall back to a hidden textarea.
      const area = document.createElement('textarea')
      area.value = value
      area.style.cssText = 'position:fixed;opacity:0'
      document.body.appendChild(area)
      area.select()
      document.execCommand('copy')
      area.remove()
    }
  }

  return (
    <button
      type="button"
      className={`copy-text${copied ? ' is-copied' : ''}`}
      onClick={() => void copy()}
      aria-label={`${label} ${value}`}
    >
      <span dir="ltr">{value}</span>
      {copied ? <Check size={13} aria-hidden="true" /> : <Copy size={13} aria-hidden="true" />}
      <span className="copy-tip" role="status">
        {copied ? 'تم النسخ ✓' : 'اضغط للنسخ'}
      </span>
    </button>
  )
}
