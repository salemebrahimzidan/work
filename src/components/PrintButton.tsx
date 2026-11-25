import { useState } from 'react'
import { Printer } from 'lucide-react'

/** Toolbar print button. `onPrint` may fetch data first; the button shows progress meanwhile. */
export default function PrintButton({
  onPrint,
  disabled,
}: {
  onPrint: () => void | Promise<void>
  disabled?: boolean
}) {
  const [busy, setBusy] = useState(false)

  async function handleClick() {
    setBusy(true)
    try {
      await onPrint()
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      type="button"
      className="btn btn-ghost print-btn"
      onClick={() => void handleClick()}
      disabled={disabled || busy}
      title="طباعة"
    >
      <Printer size={16} aria-hidden="true" />
      {busy ? 'جاري التجهيز...' : 'طباعة'}
    </button>
  )
}
