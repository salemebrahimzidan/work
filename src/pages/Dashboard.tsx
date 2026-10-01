import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { count, errorMessage, money } from '../lib/format'
import type { DashboardStats, GroupCount } from '../lib/types'

export default function Dashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [byNationality, setByNationality] = useState<GroupCount[]>([])
  const [byCity, setByCity] = useState<GroupCount[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    const [statsRes, natRes, cityRes] = await Promise.all([
      supabase.rpc('dashboard_stats'),
      supabase.from('customers_by_nationality').select('label, total'),
      supabase.from('customers_by_city').select('label, total'),
    ])

    const failure = statsRes.error || natRes.error || cityRes.error
    if (failure) {
      setError(errorMessage(failure))
    } else {
      setStats(statsRes.data as DashboardStats)
      setByNationality((natRes.data ?? []) as GroupCount[])
      setByCity((cityRes.data ?? []) as GroupCount[])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <>
      <div className="page-head">
        <div>
          <h1>الرئيسية</h1>
          <p className="page-sub">ملخص العملاء والمعاملات والأرباح</p>
        </div>
        <button type="button" className="btn" onClick={() => void load()} disabled={loading}>
          تحديث
        </button>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="stat-grid">
        <Stat label="إجمالي العملاء" value={count(stats?.total_customers)} />
        <Stat label="عملاء اليوم" value={count(stats?.customers_today)} />
        <Stat label="عدد المعاملات" value={count(stats?.total_transactions)} />
        <Stat label="معاملات اليوم" value={count(stats?.transactions_today)} />
        <Stat label="إجمالي الأرباح" value={money(stats?.total_profit)} accent />
        <Stat label="أرباح اليوم" value={money(stats?.profit_today)} accent />
        <Stat label="أرباح هذا الشهر" value={money(stats?.profit_month)} accent />
      </div>

      <div className="two-col">
        <GroupCard title="العملاء حسب الجنسية" rows={byNationality} loading={loading} />
        <GroupCard title="العملاء حسب المدينة" rows={byCity} loading={loading} />
      </div>
    </>
  )
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={accent ? 'stat accent' : 'stat'}>
      <div className="stat-label">{label}</div>
      <div className="stat-value num">{value}</div>
    </div>
  )
}

function GroupCard({
  title,
  rows,
  loading,
}: {
  title: string
  rows: GroupCount[]
  loading: boolean
}) {
  return (
    <div className="card">
      <h2 className="card-title">{title}</h2>
      {loading && rows.length === 0 && <p className="muted">جارٍ التحميل…</p>}
      {!loading && rows.length === 0 && <p className="muted">لا توجد بيانات بعد</p>}
      <ul className="list-plain">
        {rows.map((row) => (
          <li key={row.label}>
            <span>{row.label}</span>
            <span className="num strong">{count(row.total)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
