import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { count, errorMessage, formatDate, money } from '../lib/format'
import { useFilterValues } from '../lib/hooks'
import type { CustomerSummary } from '../lib/types'
import Modal from '../components/Modal'
import CustomerForm from '../components/CustomerForm'
import SelectField from '../components/SelectField'

export default function Customers() {
  const { nationalities, cities } = useFilterValues()
  const [rows, setRows] = useState<CustomerSummary[]>([])
  const [search, setSearch] = useState('')
  const [nationality, setNationality] = useState('')
  const [city, setCity] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [addOpen, setAddOpen] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')

    let query = supabase.from('customer_summary').select('*').order('created_at', { ascending: false })

    const term = search.trim()
    if (term) {
      const safe = term.replace(/[%,()]/g, ' ')
      query = query.or(`full_name.ilike.%${safe}%,mobile.ilike.%${safe}%`)
    }
    if (nationality) query = query.eq('nationality', nationality)
    if (city) query = query.eq('city', city)

    const { data, error: queryError } = await query
    if (queryError) setError(errorMessage(queryError))
    else setRows((data ?? []) as CustomerSummary[])
    setLoading(false)
  }, [search, nationality, city])

  useEffect(() => {
    const timer = setTimeout(() => void load(), 250)
    return () => clearTimeout(timer)
  }, [load])

  return (
    <>
      <div className="page-head">
        <div>
          <h1>العملاء</h1>
          <p className="page-sub">{count(rows.length)} عميل في النتائج</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => setAddOpen(true)}>
          إضافة عميل
        </button>
      </div>

      <div className="card">
        <div className="filters">
          <div className="field">
            <label htmlFor="search">بحث (الاسم أو الجوال)</label>
            <input
              id="search"
              value={search}
              placeholder="اكتب للبحث…"
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="field">
            <label htmlFor="filter-nationality">الجنسية</label>
            <SelectField
              id="filter-nationality"
              value={nationality}
              onChange={setNationality}
              options={[
                { value: '', label: 'كل الجنسيات' },
                ...nationalities.map((item) => ({ value: item, label: item })),
              ]}
            />
          </div>

          <div className="field">
            <label htmlFor="filter-city">المدينة</label>
            <SelectField
              id="filter-city"
              value={city}
              onChange={setCity}
              options={[
                { value: '', label: 'كل المدن' },
                ...cities.map((item) => ({ value: item, label: item })),
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

      <div className="table-wrap" style={{ marginTop: 16 }}>
        <table>
          <thead>
            <tr>
              <th>الاسم</th>
              <th>الجوال</th>
              <th>الجنسية</th>
              <th>المدينة</th>
              <th>عدد المعاملات</th>
              <th>إجمالي عمولة المكتب</th>
              <th>تاريخ الإضافة</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>
                  <Link to={`/customers/${row.id}`}>{row.full_name}</Link>
                </td>
                <td className="num" dir="ltr">
                  {row.mobile}
                </td>
                <td>{row.nationality || '—'}</td>
                <td>{row.city || '—'}</td>
                <td className="num">{count(row.transactions_count)}</td>
                <td className="num strong">{money(row.total_profit)}</td>
                <td className="num muted">{formatDate(row.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && (
          <div className="empty">{loading ? 'جارٍ التحميل…' : 'لا توجد نتائج'}</div>
        )}
      </div>

      <Modal title="إضافة عميل" open={addOpen} onClose={() => setAddOpen(false)}>
        <CustomerForm
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
