import type { ReactNode } from 'react'

interface Props {
  title: string
  subtitle?: ReactNode
  extra?: ReactNode
  open: boolean
  onClose: () => void
  children: ReactNode
}

export default function Modal({ title, subtitle, extra, open, onClose, children }: Props) {
  if (!open) return null

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-head">
          <div className="modal-heading">
            <div className="modal-heading-row">
              <h2>{title}</h2>
              {extra}
            </div>
            {subtitle && <p className="modal-sub">{subtitle}</p>}
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="إغلاق">
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
              <path
                d="M3.2 3.2 12.8 12.8M12.8 3.2 3.2 12.8"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  )
}
