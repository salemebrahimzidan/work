import { Link } from 'react-router-dom'
import { formatDate, money } from '../lib/format'
import type { TransactionDetail } from '../lib/types'

interface Props {
  rows: TransactionDetail[]
  loading?: boolean
  showCustomer?: boolean
  canCorrect?: boolean
  onCorrect?: (transaction: TransactionDetail) => void
}

export default function TransactionsTable({
  rows,
  loading,
  showCustomer = true,
  canCorrect = false,
  onCorrect,
}: Props) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>رقم المعاملة</th>
            {showCustomer && <th>العميل</th>}
            <th>المعاملة</th>
            <th>الربح</th>
            <th>الحالة</th>
            <th>ملاحظة</th>
            <th>التاريخ</th>
            {canCorrect && <th>تصحيح</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td className="num muted" dir="ltr" title={row.id}>
                {row.id.slice(0, 8)}
              </td>
              {showCustomer && (
                <td>
                  <Link to={`/customers/${row.customer_id}`}>{row.customer_name}</Link>
                </td>
              )}
              <td>{row.service_name}</td>
              <td className="num strong">
                {money(row.effective_profit)}
                {row.is_corrected && (
                  <div className="note-line num">الأصلي: {money(row.original_profit)}</div>
                )}
              </td>
              <td>
                {row.is_corrected ? (
                  <span className="badge badge-corrected" title={row.correction_reason ?? ''}>
                    مُصحَّح
                  </span>
                ) : (
                  <span className="badge badge-locked">مقفل</span>
                )}
              </td>
              <td className="muted">{row.note || '—'}</td>
              <td className="num muted">{formatDate(row.created_at)}</td>
              {canCorrect && (
                <td>
                  <button
                    type="button"
                    className="btn btn-warning btn-sm"
                    onClick={() => onCorrect?.(row)}
                  >
                    تصحيح
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && (
        <div className="empty">{loading ? 'جارٍ التحميل…' : 'لا توجد معاملات'}</div>
      )}
    </div>
  )
}
