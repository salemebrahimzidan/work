import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { count, errorMessage, money } from '../lib/format'
import { useFilterValues } from '../lib/hooks'
import { useAuth } from '../auth/AuthProvider'
import type { TransactionDetail } from '../lib/types'
import Modal from '../components/Modal'
import TransactionForm from '../components/TransactionForm'
import CorrectionForm from '../components/CorrectionForm'
import TransactionsTable from '../components/TransactionsTable'

export default function Transactions() {
  const { isAdmin } = useAuth()
  const { nationalities, cities } = useFilterValues()
  const [rows, setRows] = useState<TransactionDetail[]>([])
  const [search, setSearch] = useState('')
  const [nationality, setNationality] = useState('')
  const [city, setCity] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [addOpen, setAddOpen] = useState(false)
  const [correcting, setCorrecting] = useState<TransactionDetail | null>(null)

  const load = useCallback(async () => {
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
    if (nationality) query = query.eq('nationality', nationality)
    if (city) query = query.eq('city', city)

    const { data, error: queryError } = await query
    if (queryError) setError(errorMessage(queryError))
    else setRows((data ?? []) as TransactionDetail[])
    setLoading(false)
  }, [search, nationality, city])

  useEffect(() => {
    const timer = setTimeout(() => void load(), 250)
    return () => clearTimeout(timer)
  }, [load])

  const total = rows.reduce((sum, row) => sum + Number(row.effective_profit), 0)

  return (
    <>
      <div className="page-head">
        <div>
          <h1>المعاملات</h1>
          <p className="page-sub">
            {count(rows.length)} معاملة — إجمالي الربح في النتائج: {money(total)}
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
            <label htmlFor="tx-nationality">الجنسية</label>
            <select
              id="tx-nationality"
              value={nationality}
              onChange={(e) => setNationality(e.target.value)}
            >
              <option value="">كل الجنسيات</option>
              {nationalities.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="tx-city">المدينة</label>
            <select id="tx-city" value={city} onChange={(e) => setCity(e.target.value)}>
              <option value="">كل المدن</option>
              {cities.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label>&nbsp;</label>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                setSearch('')
                setNationality('')
                setCity('')
              }}
            >
              مسح التصفية
            </button>
          </div>
        </div>
      </div>

      {error && <div className="alert alert-error" style={{ marginTop: 16 }}>{error}</div>}

      <div style={{ marginTop: 16 }}>
        <TransactionsTable
          rows={rows}
          loading={loading}
          canCorrect={isAdmin}
          onCorrect={setCorrecting}
        />
      </div>

      {!isAdmin && (
        <p className="note-line" style={{ marginTop: 10 }}>
          الأرباح المحفوظة مقفلة ولا يمكن تعديلها أو حذفها. تصحيح الأرباح متاح للمشرف فقط.
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
