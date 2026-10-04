import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { useCompany } from '../auth/CompanyProvider'
import { TRANSACTION_DETAIL_COLUMNS, loadOfficeProfitMap } from '../lib/finance'
import { supabase } from '../lib/supabase'
import { count, errorMessage, formatDate, money } from '../lib/format'
import type { Customer, TransactionDetail } from '../lib/types'
import Modal from '../components/Modal'
import CustomerForm from '../components/CustomerForm'
import TransactionForm from '../components/TransactionForm'
import TransactionsTable from '../components/TransactionsTable'

const CUSTOMER_COLUMNS = 'id, full_name, mobile, national_id, nationality, city, district, notes, created_at'

const STATUS_KEYS = ['pending', 'in_progress', 'completed', 'cancelled'] as const
type StatusKey = (typeof STATUS_KEYS)[number]

const STATUS_LABELS: Record<StatusKey, string> = {
  pending: 'قيد الانتظار',
  in_progress: 'قيد التنفيذ',
  completed: 'مكتملة',
  cancelled: 'ملغاة',
}

export default function CustomerDetails() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const { isAdmin } = useAuth()
  const { canViewFinance, loading: companyLoading } = useCompany()
  const [customer, setCustomer] = useState<Customer | null>(null)
  const [rows, setRows] = useState<TransactionDetail[]>([])
  const [transactionCount, setTransactionCount] = useState(0)
  const [listComplete, setListComplete] = useState(true)
  const [profitReady, setProfitReady] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editOpen, setEditOpen] = useState(false)
  const [txOpen, setTxOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [statusFilter, setStatusFilter] = useState<'' | StatusKey>('')
  const [serviceQuery, setServiceQuery] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    setProfitReady(false)
    const [customerRes, txRes] = await Promise.all([
      supabase.from('customers').select(CUSTOMER_COLUMNS).eq('id', id).maybeSingle(),
      supabase
        .from('transaction_details')
        .select(TRANSACTION_DETAIL_COLUMNS, { count: 'exact' })
        .eq('customer_id', id)
        .order('created_at', { ascending: false }),
    ])

    const failure = customerRes.error || txRes.error
    if (failure) setError(errorMessage(failure))
    else {
      setCustomer((customerRes.data as Customer | null) ?? null)
      const list = (txRes.data ?? []) as TransactionDetail[]
      const total = txRes.count ?? list.length
      setTransactionCount(total)
      setListComplete(list.length >= total)
      if (canViewFinance) {
        try {
          const profits = await loadOfficeProfitMap()
          setRows(list.map((row) => ({ ...row, original_profit: profits[row.id] })))
          setProfitReady(true)
        } catch (profitError) {
          setRows(list)
          setError(errorMessage(profitError))
        }
      } else {
        setRows(list)
      }
    }
    setLoading(false)
  }, [id, canViewFinance])

  useEffect(() => {
    if (companyLoading) return
    void load()
  }, [companyLoading, load])

  const statusCounts = useMemo(() => {
    const next: Record<StatusKey, number> = {
      pending: 0,
      in_progress: 0,
      completed: 0,
      cancelled: 0,
    }
    for (const row of rows) {
      if (row.status && row.status in next) next[row.status] += 1
    }
    return next
  }, [rows])

  const transactionValue = useMemo(
    () => rows.reduce((sum, row) => sum + (Number(row.transaction_value) || 0), 0),
    [rows],
  )

  const completedProfit = useMemo(
    () =>
      rows.reduce((sum, row) => {
        if (row.status !== 'completed') return sum
        return sum + (Number(row.original_profit) || 0)
      }, 0),
    [rows],
  )

  const visibleRows = useMemo(() => {
    const term = serviceQuery.trim().toLocaleLowerCase('ar')
    return rows.filter((row) => {
      if (statusFilter && row.status !== statusFilter) return false
      if (!term) return true
      return row.service_name.toLocaleLowerCase('ar').includes(term)
    })
  }, [rows, serviceQuery, statusFilter])

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

  const valueLabel = listComplete ? 'إجمالي قيمة معاملات العميل' : 'إجمالي قيمة المعاملات المحملة'
  const profitLabel = listComplete ? 'إجمالي ربح المكتب من العميل' : 'ربح المكتب من المعاملات المكتملة المحملة'
  const filterActive = statusFilter !== '' || serviceQuery.trim() !== ''

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{customer.full_name}</h1>
          <p className="page-sub">
            <Link to="/customers">العملاء</Link> / بطاقة العميل
          </p>
        </div>
        <div className="dashboard-actions">
          <button type="button" className="btn" onClick={() => setEditOpen(true)}>
            تعديل البيانات
          </button>
          <button type="button" className="btn btn-primary" onClick={() => setTxOpen(true)}>
            + إضافة معاملة
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
      {!listComplete && (
        <div className="alert alert-error">
          تعذر تحميل كل معاملات هذا العميل دفعة واحدة. الأرقام التالية تخص المعاملات المحملة فقط وليست إجمالي كل المعاملات.
        </div>
      )}

      <div className="card">
        <div className="profile-grid">
          <Item label="الاسم" value={customer.full_name} />
          <Item label="الجوال" value={customer.mobile} ltr />
          <Item label="رقم الهوية / الإقامة" value={customer.national_id || '—'} ltr />
          <Item label="الجنسية" value={customer.nationality || '—'} />
          <Item label="المدينة" value={customer.city || '—'} />
          <Item label="الحي / المنطقة" value={customer.district || '—'} />
          <Item label="تاريخ الإضافة" value={formatDate(customer.created_at)} />
        </div>
        <div className="profile-notes">
          <div className="profile-label">ملاحظات</div>
          <div className="profile-value">{customer.notes?.trim() || '—'}</div>
        </div>
      </div>

      <div className="tx-summary" aria-label="ملخص معاملات العميل">
        <Summary label={listComplete ? 'إجمالي المعاملات' : 'المعاملات المحملة'} value={listComplete ? transactionCount : rows.length} />
        {STATUS_KEYS.map((item) => (
          <Summary key={item} label={STATUS_LABELS[item]} value={statusCounts[item]} />
        ))}
      </div>

      <p className="note-line tx-page-value">
        {valueLabel}: {money(transactionValue)}
      </p>
      {canViewFinance && profitReady && (
        <p className="note-line">
          {profitLabel}: {money(completedProfit)}
        </p>
      )}

      <div className="page-head" style={{ marginTop: 24 }}>
        <h2 className="card-title" style={{ margin: 0 }}>
          المعاملات
        </h2>
      </div>

      {rows.length === 0 ? (
        <div className="card">
          <p className="empty">لا توجد معاملات لهذا العميل بعد.</p>
          <div className="form-actions">
            <button type="button" className="btn btn-primary" onClick={() => setTxOpen(true)}>
              + إضافة معاملة
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="card">
            <div className="report-tabs" role="tablist" aria-label="تصفية معاملات العميل">
              <button
                type="button"
                className={statusFilter === '' ? 'btn btn-primary' : 'btn btn-ghost'}
                onClick={() => setStatusFilter('')}
              >
                الكل
              </button>
              {STATUS_KEYS.map((item) => (
                <button
                  key={item}
                  type="button"
                  className={statusFilter === item ? 'btn btn-primary' : 'btn btn-ghost'}
                  onClick={() => setStatusFilter(item)}
                >
                  {STATUS_LABELS[item]}
                </button>
              ))}
            </div>
            <div className="field">
              <label htmlFor="customer-tx-search">بحث في المعاملات</label>
              <input
                id="customer-tx-search"
                value={serviceQuery}
                placeholder="اسم المعاملة أو الخدمة"
                onChange={(event) => setServiceQuery(event.target.value)}
              />
            </div>
          </div>

          <div style={{ marginTop: 16 }}>
            <TransactionsTable
              rows={visibleRows}
              loading={loading}
              showCustomer={false}
              officeLayout
              emptyLabel={
                filterActive
                  ? 'لا توجد معاملات مطابقة للتصفية المحددة.'
                  : 'لا توجد معاملات'
              }
              onChanged={() => void load()}
            />
          </div>
        </>
      )}

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
          {transactionCount > 0
            ? `سيتم أيضاً حذف ${count(transactionCount)} معاملة مرتبطة بهذا العميل. لا يمكن التراجع عن هذا الإجراء.`
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

function Summary({ label, value }: { label: string; value: number }) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value num">{count(value)}</div>
    </div>
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
