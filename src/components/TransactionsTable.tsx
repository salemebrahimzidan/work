import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { useCompany } from '../auth/CompanyProvider'
import { errorMessage, formatDate, linkedText, money, transactionStatus } from '../lib/format'
import { useServicePrices } from '../lib/hooks'
import { supabase } from '../lib/supabase'
import type { TransactionDetail } from '../lib/types'
import { SkeletonRows } from './LoadingSkeleton'
import Modal from './Modal'

interface Props {
  rows: TransactionDetail[]
  loading?: boolean
  showCustomer?: boolean
  /** Transactions page: a note badge instead of the full note. */
  officeLayout?: boolean
  emptyLabel?: string
  onChanged?: () => void
}

export default function TransactionsTable({
  rows,
  loading,
  showCustomer = true,
  officeLayout = false,
  emptyLabel = 'لا توجد معاملات',
  onChanged,
}: Props) {
  const { isAdmin } = useAuth()
  const { canViewFinance } = useCompany()
  const { services } = useServicePrices()
  const [deleting, setDeleting] = useState<TransactionDetail | null>(null)
  const [reasonRow, setReasonRow] = useState<TransactionDetail | null>(null)
  const [stepsRow, setStepsRow] = useState<TransactionDetail | null>(null)
  const stepsText = services.find((item) => item.name === stepsRow?.service_name)?.steps?.trim() ?? ''

  function billNumber(row: TransactionDetail): string | null {
    const isFawateer = services.some(
      (item) => item.name === row.service_name && item.category === 'fawateer',
    )
    if (!isFawateer) return null
    return row.note?.trim() ?? ''
  }

  return (
    <>
      <div className={officeLayout ? 'table-wrap tx-list' : 'table-wrap'}>
        <table>
          <thead>
            <tr>
              {showCustomer && <th>العميل</th>}
              <th>المعاملة</th>
              <th>رقم الفاتورة</th>
              <th>قيمة المعاملة</th>
              {canViewFinance && <th>عمولة المكتب</th>}
              <th>الحالة</th>
              <th>ملاحظة</th>
              <th>التاريخ</th>
              <th>إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {loading && rows.length === 0 ? (
              <SkeletonRows
                columns={(showCustomer ? 1 : 0) + (canViewFinance ? 1 : 0) + 7}
              />
            ) : rows.map((row) => (
              <tr key={row.id}>
                {showCustomer && (
                  <td data-label="العميل">
                    <Link to={`/customers/${row.customer_id}`}>{row.customer_name}</Link>
                  </td>
                )}
                <td data-label="المعاملة">
                  <Link to={`/transactions/${row.id}`}>{row.service_name}</Link>
                </td>
                <td className="num" dir="ltr" data-label="رقم الفاتورة">
                  {billNumber(row) || '—'}
                </td>
                <td className="num" data-label="قيمة المعاملة">
                  {row.transaction_value == null ? '—' : money(row.transaction_value)}
                </td>
                {canViewFinance && (
                  <td className="num strong" data-label="عمولة المكتب">
                    {row.original_profit == null ? '—' : money(row.original_profit)}
                  </td>
                )}
                <td data-label="الحالة">
                  <StatusCell
                    row={row}
                    onShowReason={row.status === 'cancelled' ? () => setReasonRow(row) : undefined}
                  />
                </td>
                <td className="muted" data-label="ملاحظة">
                  {billNumber(row) != null ? (
                    '—'
                  ) : officeLayout ? (
                    row.note?.trim() ? (
                      <span className="badge" title={row.note}>
                        ملاحظة
                      </span>
                    ) : (
                      '—'
                    )
                  ) : (
                    row.note || '—'
                  )}
                </td>
                <td className="num muted" data-label="التاريخ">
                  {formatDate(row.created_at)}
                </td>
                <td data-label="إجراءات">
                  <div className="row-actions">
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setStepsRow(row)}>
                      الخطوات
                    </button>
                    {isAdmin && (
                      <button
                        type="button"
                        className="btn btn-ghost btn-icon"
                        aria-label="حذف"
                        title="حذف"
                        onClick={() => setDeleting(row)}
                      >
                        <Trash2 size={16} strokeWidth={2} aria-hidden="true" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && rows.length === 0 && <div className="empty">{emptyLabel}</div>}
      </div>

      <Modal title="الخطوات" subtitle={stepsRow?.service_name} center open={Boolean(stepsRow)} onClose={() => setStepsRow(null)}>
        {stepsText ? (
          <p className="service-steps">{linkedText(stepsText)}</p>
        ) : (
          <p className="muted">لم تُضف خطوات لهذه الخدمة بعد. يمكن للمشرف كتابتها من صفحة الخدمة.</p>
        )}
      </Modal>

      <Modal title="سبب الإلغاء" compact hideHeader open={Boolean(reasonRow)} onClose={() => setReasonRow(null)}>
        {reasonRow && (
          <ReasonMessage
            reason={reasonRow.cancel_reason?.trim() ?? ''}
            onClose={() => setReasonRow(null)}
          />
        )}
      </Modal>

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

function StatusCell({ row, onShowReason }: { row: TransactionDetail; onShowReason?: () => void }) {
  const status = transactionStatus(row.status)
  return (
    <div className="status-cell">
      {onShowReason ? (
        <button type="button" className={status.badge} onClick={onShowReason} title="عرض سبب الإلغاء">
          {status.label}
        </button>
      ) : (
        <span className={status.badge}>{status.label}</span>
      )}
    </div>
  )
}

function ReasonMessage({ reason, onClose }: { reason: string; onClose: () => void }) {
  return (
    <div className="reason-dialog">
      <p>
        <span className="reason-dialog-label">سبب الإلغاء: </span>
        <span className="reason-dialog-value">{reason || 'لا يوجد سبب'}</span>
      </p>
      <button type="button" className="btn btn-primary" onClick={onClose}>
        إغلاق
      </button>
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
  const { canViewFinance } = useCompany()
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
    <div className="confirm-dialog">
      {error && <div className="alert alert-error">{error}</div>}
      <p className="confirm-copy">هل أنت متأكد من حذف هذه المعاملة؟</p>
      <p className="confirm-detail">
        {transaction.service_name}
        {canViewFinance && transaction.original_profit != null
          ? ` — ${money(transaction.original_profit)}`
          : ''}
      </p>
      <div className="confirm-actions">
        <button type="button" className="btn confirm-delete" onClick={() => void confirmDelete()} disabled={busy}>
          {busy ? 'جارٍ الحذف…' : 'حذف'}
        </button>
        <button type="button" className="btn confirm-cancel" onClick={onCancel}>
          إلغاء
        </button>
      </div>
    </div>
  )
}
