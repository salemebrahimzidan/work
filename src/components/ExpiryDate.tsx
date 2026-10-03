import { expiryKind, expiryLabel, formatEmployeeDate } from '../lib/employees'

export default function ExpiryDate({
  value,
  expiredLabel = 'منتهية',
}: {
  value: string | null | undefined
  expiredLabel?: string
}) {
  const kind = expiryKind(value)
  const label = kind === 'expired' ? expiredLabel : expiryLabel(kind)
  return (
    <span className="expiry-flag">
      <span className="num" dir="ltr">
        {formatEmployeeDate(value)}
      </span>
      {label && <span className={kind === 'expired' ? 'badge badge-cancelled' : 'badge badge-pending'}>{label}</span>}
    </span>
  )
}
