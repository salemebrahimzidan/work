import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { count, errorMessage, formatDate, money } from '../lib/format'
import { useAuth } from '../auth/AuthProvider'
import type { Customer, TransactionDetail } from '../lib/types'
import Modal from '../components/Modal'
import CustomerForm from '../components/CustomerForm'
import TransactionForm from '../components/TransactionForm'
import CorrectionForm from '../components/CorrectionForm'
import TransactionsTable from '../components/TransactionsTable'

export default function CustomerDetails() {
  const { id = '' } = useParams()
  const { isAdmin } = useAuth()
  const [customer, setCustomer] = useState<Customer | null>(null)
  const [rows, setRows] = useState<TransactionDetail[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editOpen, setEditOpen] = useState(false)
  const [txOpen, setTxOpen] = useState(false)
  const [correcting, setCorrecting] = useState<TransactionDetail | null>(null)

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

  const total = rows.reduce((sum, row) => sum + Number(row.effective_profit), 0)

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
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="card">
        <div className="detail-list">
          <Item label="الاسم" value={customer.full_name} />
          <Item label="الجوال" value={customer.mobile} ltr />
          <Item label="الجنسية" value={customer.nationality} />
          <Item label="المدينة" value={customer.city} />
          <Item label="الحي / المنطقة" value={customer.district || '—'} />
          <Item label="رقم الهوية / الإقامة" value={customer.national_id || '—'} ltr />
          <Item label="تاريخ الإضافة" value={formatDate(customer.created_at)} />
          <Item label="عدد المعاملات" value={count(rows.length)} />
        </div>
        {customer.notes && (
          <div style={{ marginTop: 14 }}>
            <div className="stat-label">ملاحظات</div>
            <div>{customer.notes}</div>
          </div>
        )}
      </div>

      <div className="stat-grid" style={{ marginTop: 16 }}>
        <div className="stat accent">
          <div className="stat-label">إجمالي أرباح هذا العميل</div>
          <div className="stat-value num">{money(total)}</div>
        </div>
      </div>

      <div className="page-head" style={{ marginTop: 24 }}>
        <h2 className="card-title" style={{ margin: 0 }}>
          المعاملات
        </h2>
      </div>

      <TransactionsTable
        rows={rows}
        loading={loading}
        showCustomer={false}
        canCorrect={isAdmin}
        onCorrect={setCorrecting}
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

      <Modal
        title="تصحيح الربح (مشرف)"
        open={Boolean(correcting)}
        onClose={() => setCorrecting(null)}
      >
        {correcting && (
          <CorrectionForm
            transaction={correcting}
            onCancel={() => setCorrecting(null)}
            onSaved={() => {
              setCorrecting(null)
              void load()
            }}
          />
        )}
      </Modal>
    </>
  )
}

function Item({ label, value, ltr }: { label: string; value: string; ltr?: boolean }) {
  return (
    <div className="detail-item">
      <div className="stat-label">{label}</div>
      <div className={ltr ? 'value num' : 'value'} dir={ltr ? 'ltr' : undefined}>
        {value}
      </div>
    </div>
  )
}
