import { useEffect, useRef } from 'react'

/** Fired after a transaction is saved anywhere (a page form, the dashboard, the assistant). */
const TRANSACTIONS_CHANGED = 'app:transactions-changed'

export function notifyTransactionsChanged(): void {
  window.dispatchEvent(new Event(TRANSACTIONS_CHANGED))
}

/** Re-run `reload` whenever a transaction is added, so the page's numbers and lists stay current. */
export function useOnTransactionsChanged(reload: () => unknown): void {
  const latest = useRef(reload)
  useEffect(() => {
    latest.current = reload
  })

  useEffect(() => {
    const handler = () => void latest.current()
    window.addEventListener(TRANSACTIONS_CHANGED, handler)
    return () => window.removeEventListener(TRANSACTIONS_CHANGED, handler)
  }, [])
}
