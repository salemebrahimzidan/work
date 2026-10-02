import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { errorMessage, formatDate, money, transactionStatus } from '../lib/format'
import { supabase } from '../lib/supabase'
import type { TransactionDetail } from '../lib/types'
import Modal from './Modal'

interface Props {
  rows: TransactionDetail[]
  loading?: boolean
  showCustomer?: boolean
  onChanged?: () => void
}

export default function TransactionsTable({
  rows,
  loading,
  showCustomer = true,
  onChanged,
}: Props) {
  const { isAdmin } = useAuth()
  const [deleting, setDeleting] = useState<TransactionDetail | null>(null)

  return (
    <>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {showCustomer && <th>العميل</th>}
              <th>المعاملة</th>
              <th>قيمة المعاملة</th>
              {isAdmin && <th>عمولة المكتب</th>}
              <th>الحالة</th>
              <th>ملاحظة</th>
              <th>التاريخ</th>
              {isAdmin && <th>إجراءات</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                {showCustomer && (
                  <td>
                    <Link to={`/customers/${row.customer_id}`}>{row.customer_name}</Link>
                  </td>
                )}
                <td>
                  <Link to={`/transactions/${row.id}`}>{row.service_name}</Link>
                </td>
                <td className="num">
                  {row.transaction_value == null ? '—' : money(row.transaction_value)}
                </td>
                {isAdmin && <td className="num strong">{money(row.original_profit)}</td>}
                <td>
                  <StatusCell row={row} />
                </td>
                <td className="muted">{row.note || '—'}</td>
                <td className="num muted">{formatDate(row.created_at)}</td>
                {isAdmin && (
                  <td>
                    <button
                      type="button"
                      className="btn btn-ghost btn-icon"
                      aria-label="حذف"
                      title="حذف"
                      onClick={() => setDeleting(row)}
                    >
                      <Trash2 size={16} strokeWidth={2} aria-hidden="true" />
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

      <Modal title="حذف المعاملة" compact hideHeader open={Boolean(deleting)} onClose={() => setDeleting(null)}>
        {deleting && (
          <DeleteConfirm
            transaction={deleting}
            onCancel={() => setDeleting(null)}
            onDeleted={() => {
              setDeleting(null)
              onChanged?.()
            }}
          />
        )}
      </Modal>
    </>
  )
}

function StatusCell({ row }: { row: TransactionDetail }) {
  const status = transactionStatus(row.status)
  return (
    <div className="status-cell">
      <span className={status.badge}>{status.label}</span>
      {row.status === 'cancelled' && row.cancel_reason && (
        <span className="status-reason">{row.cancel_reason}</span>
      )}
    </div>
  )
}

function DeleteConfirm({
  transaction,
  onCancel,
  onDeleted,
}: {
  transaction: TransactionDetail
  onCancel: () => void
  onDeleted: () => void
}) {
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function confirmDelete() {
    setError('')
    setBusy(true)
    const { error: deleteError } = await supabase.rpc('admin_delete_transaction', {
      p_transaction_id: transaction.id,
    })
    setBusy(false)

    if (deleteError) {
      setError(errorMessage(deleteError))
      return
    }
    onDeleted()
  }

  return (
    <div>
      {error && <div className="alert alert-error">{error}</div>}
      <p className="confirm-copy">هل أنت متأكد من حذف هذه المعاملة؟</p>
      <p className="confirm-detail muted">
        {transaction.service_name} — {money(transaction.original_profit)}
      </p>
      <div className="form-actions">
        <button type="button" className="btn btn-danger" onClick={() => void confirmDelete()} disabled={busy}>
          {busy ? 'جارٍ الحذف…' : 'حذف'}
        </button>
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          إلغاء
        </button>
      </div>
    </div>
  )
}
