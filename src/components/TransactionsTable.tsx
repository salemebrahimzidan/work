import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { errorMessage, formatDate, money } from '../lib/format'
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
  const [editing, setEditing] = useState<TransactionDetail | null>(null)
  const [deleting, setDeleting] = useState<TransactionDetail | null>(null)

  return (
    <>
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
              {isAdmin && <th>إجراءات</th>}
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
                <td className="num strong">{money(row.original_profit)}</td>
                <td>
                  <span className="badge badge-locked">مقفل</span>
                </td>
                <td className="muted">{row.note || '—'}</td>
                <td className="num muted">{formatDate(row.created_at)}</td>
                {isAdmin && (
                  <td>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <button type="button" className="btn btn-sm" onClick={() => setEditing(row)}>
                        تعديل الربح
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => setDeleting(row)}
                      >
                        حذف
                      </button>
                    </div>
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

      <Modal title="تعديل الربح" open={Boolean(editing)} onClose={() => setEditing(null)}>
        {editing && (
          <ProfitEditForm
            transaction={editing}
            onCancel={() => setEditing(null)}
            onSaved={() => {
              setEditing(null)
              onChanged?.()
            }}
          />
        )}
      </Modal>

      <Modal title="حذف المعاملة" open={Boolean(deleting)} onClose={() => setDeleting(null)}>
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

function ProfitEditForm({
  transaction,
  onCancel,
  onSaved,
}: {
  transaction: TransactionDetail
  onCancel: () => void
  onSaved: () => void
}) {
  const [profit, setProfit] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError('')

    const amount = Number(profit)
    if (!Number.isFinite(amount) || amount < 0) {
      setError('قيمة الربح غير صحيحة')
      return
    }

    setBusy(true)
    const { error: saveError } = await supabase.rpc('admin_update_transaction_profit', {
      p_transaction_id: transaction.id,
      p_new_profit: amount.toFixed(2),
    })
    setBusy(false)

    if (saveError) {
      setError(errorMessage(saveError))
      return
    }
    onSaved()
  }

  return (
    <form onSubmit={handleSubmit}>
      {error && <div className="alert alert-error">{error}</div>}

      <div className="form-grid">
        <div className="field">
          <label htmlFor="edit-service">اسم المعاملة</label>
          <input id="edit-service" value={transaction.service_name} readOnly disabled />
        </div>
        <div className="field">
          <label htmlFor="edit-current">الربح الحالي</label>
          <input
            id="edit-current"
            value={money(transaction.original_profit)}
            readOnly
            disabled
          />
        </div>
        <div className="field">
          <label htmlFor="edit-new">الربح الجديد *</label>
          <input
            id="edit-new"
            required
            dir="ltr"
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            value={profit}
            onChange={(event) => setProfit(event.target.value)}
          />
        </div>
      </div>

      <div className="form-actions">
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? 'جارٍ الحفظ…' : 'حفظ'}
        </button>
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          إلغاء
        </button>
      </div>
    </form>
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
      <p>هل أنت متأكد من حذف هذه المعاملة؟</p>
      <p className="muted">
        {transaction.service_name} — {money(transaction.original_profit)}
      </p>
      <div className="form-actions">
        <button type="button" className="btn btn-primary" onClick={() => void confirmDelete()} disabled={busy}>
          {busy ? 'جارٍ الحذف…' : 'حذف'}
        </button>
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          إلغاء
        </button>
      </div>
    </div>
  )
}
