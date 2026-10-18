import { useState, type FormEvent, type ReactNode } from 'react'
import { Ban, Eye, ListChecks, Trash2 } from 'lucide-react'
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
  const [viewing, setViewing] = useState<TransactionDetail | null>(null)
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
              <th className="num-left">قيمة المعاملة</th>
              {canViewFinance && <th className="num-left">عمولة المكتب</th>}
              <th className="num-left">الإجمالي</th>
              <th>الحالة</th>
              <th>ملاحظة</th>
              <th>التاريخ</th>
              <th>إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {loading && rows.length === 0 ? (
              <SkeletonRows
                columns={(showCustomer ? 1 : 0) + (canViewFinance ? 1 : 0) + 8}
              />
            ) : rows.map((row) => (
              <tr key={row.id}>
                {showCustomer && (
                  <td data-label="العميل">
                    <Link to={`/customers/${row.customer_id}`}>{row.customer_name}</Link>
                  </td>
                )}
                <td data-label="المعاملة">
                  <button type="button" className="tx-name-link" onClick={() => setViewing(row)}>
                    {row.service_name}
                  </button>
                </td>
                <td className="num" dir="ltr" data-label="رقم الفاتورة">
                  {billNumber(row) || '—'}
                </td>
                <td className="num" data-label="قيمة المعاملة">
                  {row.transaction_value == null ? '—' : amountLabel(row.transaction_value)}
                </td>
                {canViewFinance && (
                  <td className="num strong" data-label="عمولة المكتب">
                    {row.original_profit == null ? '—' : amountLabel(row.original_profit)}
                  </td>
                )}
                <td className="num" data-label="الإجمالي">
                  <RowTotal row={row} includeCommission={canViewFinance} />
                </td>
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
                    <button
                      type="button"
                      className="tx-action tx-action-icon"
                      aria-label="عرض"
                      title="عرض"
                      onClick={() => setViewing(row)}
                    >
                      <Eye size={16} strokeWidth={2} aria-hidden="true" />
                    </button>
                    <button type="button" className="tx-action" onClick={() => setStepsRow(row)}>
                      <ListChecks size={15} strokeWidth={2} aria-hidden="true" />
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

      <Modal
        title={viewing?.service_name ?? 'عرض المعاملة'}
        center
        open={Boolean(viewing)}
        onClose={() => setViewing(null)}
      >
        {viewing && (
          <div className="tx-view">
            <ViewField label="العميل" value={viewing.customer_name} />
            <ViewField label="الجوال" value={viewing.customer_mobile || '—'} ltr />
            <ViewField label="المعاملة" value={viewing.service_name} />
            {billNumber(viewing) != null && (
              <ViewField label="رقم الفاتورة" value={billNumber(viewing) || '—'} ltr />
            )}
            <ViewField
              label="قيمة المعاملة"
              value={viewing.transaction_value == null ? '—' : amountLabel(viewing.transaction_value)}
            />
            {canViewFinance && (
              <ViewField
                label="عمولة المكتب"
                value={viewing.original_profit == null ? '—' : amountLabel(viewing.original_profit)}
              />
            )}
            <ViewField label="الإجمالي" value={<RowTotal row={viewing} includeCommission={canViewFinance} />} />
            <ViewField label="الحالة" value={<StatusBadge status={viewing.status} />} />
            <ViewField label="التاريخ" value={formatDate(viewing.created_at)} />
            <ViewField label="المدينة" value={viewing.city || '—'} />
            <ViewField label="الجنسية" value={viewing.nationality || '—'} />
            {viewing.note && billNumber(viewing) == null && (
              <ViewField label="ملاحظة" value={viewing.note} />
            )}
            {viewing.status === 'cancelled' && (
              <ViewField label="سبب الإلغاء" value={viewing.cancel_reason?.trim() || 'لا يوجد سبب'} />
            )}
            {(viewing.status === 'pending' || viewing.status === 'in_progress') && (
              <PopupStatus
                row={viewing}
                onChanged={(status, reason) => {
                  setViewing({ ...viewing, status, cancel_reason: reason ?? viewing.cancel_reason })
                  onChanged?.()
                }}
              />
            )}
          </div>
        )}
      </Modal>

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

function PopupStatus({
  row,
  onChanged,
}: {
  row: TransactionDetail
  onChanged: (status: NonNullable<TransactionDetail['status']>, reason?: string) => void
}) {
  const [mode, setMode] = useState<'cancel' | null>(null)
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const next = row.status === 'in_progress' ? 'completed' : 'in_progress'
  const nextLabel = next === 'completed' ? 'إتمام المعاملة' : 'بدء التنفيذ'

  async function changeStatus(status: 'in_progress' | 'completed' | 'cancelled', cancelReason?: string) {
    setError('')
    setBusy(true)
    const { error: saveError } = await supabase.rpc('set_transaction_status', {
      p_transaction_id: row.id,
      p_status: status,
      p_reason: cancelReason ?? null,
    })
    setBusy(false)
    if (saveError) {
      setError(errorMessage(saveError))
      return
    }
    setMode(null)
    setReason('')
    onChanged(status, cancelReason)
  }

  async function confirmCancel(event: FormEvent) {
    event.preventDefault()
    if (!reason.trim()) {
      setError('سبب الإلغاء مطلوب')
      return
    }
    await changeStatus('cancelled', reason.trim())
  }

  return (
    <div className="tx-view-status">
      {error && <div className="alert alert-error">{error}</div>}
      {mode === 'cancel' ? (
        <form className="tx-view-cancel" onSubmit={(event) => void confirmCancel(event)}>
          <label htmlFor="popup-cancel-reason">سبب الإلغاء *</label>
          <textarea
            id="popup-cancel-reason"
            required
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="اكتب سبب الإلغاء"
          />
          <div className="tx-view-status-actions">
            <button type="submit" className="btn btn-danger" disabled={busy}>
              {busy ? 'جارٍ الإلغاء…' : 'تأكيد الإلغاء'}
            </button>
            <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => setMode(null)}>
              رجوع
            </button>
          </div>
        </form>
      ) : (
        <div className="tx-view-status-actions">
          <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void changeStatus(next)}>
            {busy ? 'جارٍ الحفظ…' : nextLabel}
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            disabled={busy}
            onClick={() => {
              setError('')
              setMode('cancel')
            }}
          >
            <Ban size={16} strokeWidth={2} aria-hidden="true" />
            إلغاء المعاملة
          </button>
        </div>
      )}
    </div>
  )
}

function StatusBadge({ status }: { status: TransactionDetail['status'] }) {
  const item = transactionStatus(status)
  return <span className={item.badge}>{item.label}</span>
}

function ViewField({
  label,
  value,
  ltr,
}: {
  label: string
  value: ReactNode
  ltr?: boolean
}) {
  const empty = value === '—'
  return (
    <div className={empty ? 'tx-view-row is-empty' : 'tx-view-row'}>
      <div className="tx-view-label">{label}</div>
      <div className="tx-view-value">
        {ltr ? (
          <span className="num" dir="ltr">
            {value}
          </span>
        ) : (
          value
        )}
      </div>
    </div>
  )
}

function amountLabel(value: string | number | null | undefined): string {
  return money(value).replace(/ ر\.س$/, '').replace(/\.00$/, '')
}

function RowTotal({ row, includeCommission }: { row: TransactionDetail; includeCommission: boolean }) {
  const value = Number(row.transaction_value)
  const commission = Number(row.original_profit)
  const hasValue = row.transaction_value != null && Number.isFinite(value)
  const hasCommission = includeCommission && row.original_profit != null && Number.isFinite(commission)
  if (!hasValue && !hasCommission) return '—'
  const amount = amountLabel((hasValue ? value : 0) + (hasCommission ? commission : 0))
  return <span className="tx-total">{amount}</span>
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
