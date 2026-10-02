import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { count, errorMessage, money } from '../lib/format'
import { useAuth } from '../auth/AuthProvider'
import type { TransactionDetail } from '../lib/types'
import Modal from '../components/Modal'
import TransactionForm from '../components/TransactionForm'
import TransactionsTable from '../components/TransactionsTable'
import SelectField from '../components/SelectField'

export default function Transactions() {
  const { isAdmin } = useAuth()
  const [rows, setRows] = useState<TransactionDetail[]>([])
  const [search, setSearch] = useState('')
  const [params, setParams] = useSearchParams()
  const status = params.get('status') ?? ''

  function setStatus(next: string) {
    const nextParams = new URLSearchParams(params)
    if (next) nextParams.set('status', next)
    else nextParams.delete('status')
    setParams(nextParams, { replace: true })
  }
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [addOpen, setAddOpen] = useState(false)
  const requestId = useRef(0)

  const load = useCallback(async () => {
    const id = ++requestId.current
    setLoading(true)
    setError('')

    let query = supabase
      .from('transaction_details')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(500)

    const term = search.trim()
    if (term) {
      const safe = term.replace(/[%,()]/g, ' ')
      query = query.or(`customer_name.ilike.%${safe}%,service_name.ilike.%${safe}%`)
    }
    if (status) query = query.eq('status', status)

    const { data, error: queryError } = await query
    if (id !== requestId.current) return
    if (queryError) setError(errorMessage(queryError))
    else setRows((data ?? []) as TransactionDetail[])
    setLoading(false)
  }, [search, status])

  useEffect(() => {
    const timer = setTimeout(() => void load(), 250)
    return () => clearTimeout(timer)
  }, [load])

  const total = rows.reduce((sum, row) => sum + Number(row.original_profit), 0)

  return (
    <>
      <div className="page-head">
        <div>
          <h1>المعاملات</h1>
          <p className="page-sub">
            {count(rows.length)} معاملة
            {isAdmin && <> — إجمالي عمولة المكتب في النتائج: {money(total)}</>}
          </p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => setAddOpen(true)}>
          إضافة معاملة
        </button>
      </div>

      <div className="card">
        <div className="filters">
          <div className="field">
            <label htmlFor="tx-search">بحث (العميل أو المعاملة)</label>
            <input
              id="tx-search"
              value={search}
              placeholder="اكتب للبحث…"
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="field">
            <label htmlFor="tx-status">الحالة</label>
            <SelectField
              id="tx-status"
              value={status}
              onChange={setStatus}
              options={[
                { value: '', label: 'كل الحالات' },
                { value: 'pending', label: 'قيد الانتظار' },
                { value: 'in_progress', label: 'قيد التنفيذ' },
                { value: 'cancelled', label: 'ملغاة' },
                { value: 'completed', label: 'مكتملة' },
              ]}
            />
          </div>

          <div className="field">
            <label>&nbsp;</label>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                setSearch('')
                setStatus('')
              }}
            >
              مسح التصفية
            </button>
          </div>
        </div>
      </div>

      {error && <div className="alert alert-error" style={{ marginTop: 16 }}>{error}</div>}

      <div style={{ marginTop: 16 }}>
        <TransactionsTable rows={rows} loading={loading} onChanged={() => void load()} />
      </div>

      {!isAdmin && (
        <p className="note-line" style={{ marginTop: 10 }}>
          الأرباح المحفوظة مقفلة ولا يمكن تعديلها أو حذفها.
        </p>
      )}

      <Modal title="إضافة معاملة" open={addOpen} onClose={() => setAddOpen(false)}>
        <TransactionForm
          onCancel={() => setAddOpen(false)}
          onSaved={() => {
            setAddOpen(false)
            void load()
          }}
        />
      </Modal>
    </>
  )
}
