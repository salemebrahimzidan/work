import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { supabase } from '../lib/supabase'
import { count, errorMessage, formatDate, money } from '../lib/format'
import type { Customer, TransactionDetail } from '../lib/types'
import Modal from '../components/Modal'
import CustomerForm from '../components/CustomerForm'
import TransactionForm from '../components/TransactionForm'
import TransactionsTable from '../components/TransactionsTable'

export default function CustomerDetails() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const { isAdmin } = useAuth()
  const [customer, setCustomer] = useState<Customer | null>(null)
  const [rows, setRows] = useState<TransactionDetail[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editOpen, setEditOpen] = useState(false)
  const [txOpen, setTxOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const [deleting, setDeleting] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    const [customerRes, txRes] = await Promise.all([
      supabase.from('customers').select('*').eq('id', id).maybeSingle(),
      supabase
        .from('transaction_details')
        .select('*')
        .eq('customer_id', id)
        .order('created_at', { ascending: false }),
    ])

    const failure = customerRes.error || txRes.error
    if (failure) setError(errorMessage(failure))
    else {
      setCustomer((customerRes.data as Customer | null) ?? null)
      setRows((txRes.data ?? []) as TransactionDetail[])
    }
    setLoading(false)
  }, [id])

  useEffect(() => {
    void load()
  }, [load])

  const total = rows.reduce((sum, row) => sum + Number(row.original_profit), 0)

  async function confirmDelete() {
    if (!customer) return
    setDeleteError('')
    setDeleting(true)

    const { data: transactions, error: listError } = await supabase
      .from('transactions')
      .select('id')
      .eq('customer_id', customer.id)

    if (listError) {
      setDeleting(false)
      setDeleteError(errorMessage(listError))
      return
    }

    for (const transaction of transactions ?? []) {
      const { error: txError } = await supabase.rpc('admin_delete_transaction', {
        p_transaction_id: transaction.id,
      })
      if (txError) {
        setDeleting(false)
        setDeleteError(errorMessage(txError))
        void load()
        return
      }
    }

    const { error: customerError } = await supabase.from('customers').delete().eq('id', customer.id)
    setDeleting(false)
    if (customerError) {
      setDeleteError(errorMessage(customerError))
      void load()
      return
    }
    navigate('/customers')
  }

  if (loading && !customer) {
    return <p className="muted">جارٍ التحميل…</p>
  }

  if (!customer) {
    return (
      <>
        {error && <div className="alert alert-error">{error}</div>}
        <div className="card">
          <p className="muted">العميل غير موجود.</p>
          <Link to="/customers">رجوع إلى العملاء</Link>
        </div>
      </>
    )
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{customer.full_name}</h1>
          <p className="page-sub">
            <Link to="/customers">العملاء</Link> / بطاقة العميل
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="btn" onClick={() => setEditOpen(true)}>
            تعديل البيانات
          </button>
          <button type="button" className="btn btn-primary" onClick={() => setTxOpen(true)}>
            إضافة معاملة
          </button>
          {isAdmin && (
            <button
              type="button"
              className="btn btn-danger"
              onClick={() => {
                setDeleteError('')
                setDeleteOpen(true)
              }}
            >
              حذف العميل
            </button>
          )}
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="card">
        <div className="profile-grid">
          <Item label="الاسم" value={customer.full_name} />
          <Item label="الجوال" value={customer.mobile} ltr />
          <Item label="الجنسية" value={customer.nationality || '—'} />
          <Item label="المدينة" value={customer.city || '—'} />
          <Item label="الحي / المنطقة" value={customer.district || '—'} />
          <Item label="رقم الهوية / الإقامة" value={customer.national_id || '—'} ltr />
          <Item label="تاريخ الإضافة" value={formatDate(customer.created_at)} />
          <Item label="عدد المعاملات" value={count(rows.length)} />
        </div>
        {customer.notes && (
          <div className="profile-notes">
            <div className="profile-label">ملاحظات</div>
            <div className="profile-value">{customer.notes}</div>
          </div>
        )}
      </div>

      {isAdmin && (
        <div className="stat-grid" style={{ marginTop: 16 }}>
          <div className="stat accent">
            <div className="stat-label">إجمالي أرباح هذا العميل</div>
            <div className="stat-value num">{money(total)}</div>
          </div>
        </div>
      )}

      <div className="page-head" style={{ marginTop: 24 }}>
        <h2 className="card-title" style={{ margin: 0 }}>
          المعاملات
        </h2>
      </div>

      <TransactionsTable
        rows={rows}
        loading={loading}
        showCustomer={false}
        onChanged={() => void load()}
      />

      <Modal title="تعديل بيانات العميل" open={editOpen} onClose={() => setEditOpen(false)}>
        <CustomerForm
          customer={customer}
          onCancel={() => setEditOpen(false)}
          onSaved={() => {
            setEditOpen(false)
            void load()
          }}
        />
      </Modal>

      <Modal
        title="حذف العميل"
        open={deleteOpen}
        onClose={() => {
          if (deleting) return
          setDeleteOpen(false)
        }}
      >
        {deleteError && <div className="alert alert-error">{deleteError}</div>}
        <p>
          هل أنت متأكد من حذف <strong>{customer.full_name}</strong>؟
        </p>
        <p className="muted">
          {rows.length > 0
            ? `سيتم أيضاً حذف ${count(rows.length)} معاملة مرتبطة بهذا العميل. لا يمكن التراجع عن هذا الإجراء.`
            : 'لا يمكن التراجع عن هذا الإجراء.'}
        </p>
        <div className="form-actions">
          <button type="button" className="btn btn-danger" onClick={() => void confirmDelete()} disabled={deleting}>
            {deleting ? 'جارٍ الحذف…' : 'حذف العميل'}
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => setDeleteOpen(false)} disabled={deleting}>
            إلغاء
          </button>
        </div>
      </Modal>

      <Modal title="إضافة معاملة" open={txOpen} onClose={() => setTxOpen(false)}>
        <TransactionForm
          fixedCustomerId={customer.id}
          onCancel={() => setTxOpen(false)}
          onSaved={() => {
            setTxOpen(false)
            void load()
          }}
        />
      </Modal>
    </>
  )
}

function Item({ label, value, ltr }: { label: string; value: string; ltr?: boolean }) {
  const empty = value === '—'
  return (
    <div className={empty ? 'profile-field is-empty' : 'profile-field'}>
      <div className="profile-label">{label}</div>
      <div className={ltr ? 'profile-value num' : 'profile-value'} dir={ltr ? 'ltr' : undefined}>
        {value}
      </div>
    </div>
  )
}
