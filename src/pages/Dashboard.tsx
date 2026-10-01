import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Modal from '../components/Modal'
import { supabase } from '../lib/supabase'
import { count, errorMessage, money } from '../lib/format'
import { normalizeMobile } from '../lib/mobile'
import type { DashboardStats, GroupCount } from '../lib/types'

interface OtherCustomer {
  id: string
  full_name: string
  mobile: string
  city: string | null
  nationality: string | null
}

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

      <div className="kpi-board">
        <SummaryCard
          title="العملاء"
          caption="إجمالي العملاء"
          value={count(stats?.total_customers)}
          items={[{ label: 'اليوم', value: count(stats?.customers_today) }]}
        />
        <SummaryCard
          title="المعاملات"
          caption="عدد المعاملات"
          value={count(stats?.total_transactions)}
          items={[{ label: 'اليوم', value: count(stats?.transactions_today) }]}
        />
        <SummaryCard
          title="الأرباح"
          caption="إجمالي الأرباح"
          value={money(stats?.total_profit)}
          money
          items={[
            { label: 'اليوم', value: money(stats?.profit_today) },
            { label: 'هذا الشهر', value: money(stats?.profit_month) },
          ]}
        />
      </div>

      <div className="two-col">
        <ShareCard title="العملاء حسب الجنسية" rows={byNationality} loading={loading} field="nationality" />
        <ShareCard title="العملاء حسب المدينة" rows={byCity} loading={loading} field="city" />
      </div>
    </>
  )
}

function SummaryCard({
  title,
  caption,
  value,
  items,
  money: isMoney,
}: {
  title: string
  caption: string
  value: string
  items: { label: string; value: string }[]
  money?: boolean
}) {
  return (
    <section className={isMoney ? 'summary-card summary-card-money' : 'summary-card'}>
      <h2 className="summary-kicker">{title}</h2>
      <div className="summary-value num" dir="ltr">
        {value}
      </div>
      <p className="summary-caption">{caption}</p>
      <dl className="summary-foot">
        {items.map((item) => (
          <div className="summary-mini" key={item.label}>
            <dt className="summary-mini-label">{item.label}</dt>
            <dd className="summary-mini-value num" dir="ltr">
              {item.value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

const CITY_COLORS = ['#0f766e', '#1d8a80', '#3aa89a', '#7dcec4', '#8fd0c6', '#94a3b8']

function splitCities(rows: GroupCount[]): { slices: GroupCount[]; otherRows: GroupCount[] } {
  const sorted = [...rows].sort((a, b) => b.total - a.total || a.label.localeCompare(b.label, 'ar'))
  if (sorted.length <= 5) return { slices: sorted, otherRows: [] }
  const otherRows = sorted.slice(5)
  const rest = otherRows.reduce((sum, row) => sum + row.total, 0)
  return {
    slices: [...sorted.slice(0, 5), { label: 'أخرى', total: rest }],
    otherRows,
  }
}

function percentText(value: number) {
  return `${value.toLocaleString('ar-SA', {
    numberingSystem: 'latn',
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}%`
}

function highlightMatch(text: string, query: string) {
  const needle = query.trim()
  if (!needle) return text
  const index = text.toLocaleLowerCase('en').indexOf(needle.toLocaleLowerCase('en'))
  if (index < 0) return text
  return (
    <>
      {text.slice(0, index)}
      <mark className="search-hit">{text.slice(index, index + needle.length)}</mark>
      {text.slice(index + needle.length)}
    </>
  )
}

function cityCountLabel(total: number) {
  if (total === 1) return 'مدينة واحدة'
  if (total === 2) return 'مدينتان'
  if (total >= 3 && total <= 10) return `${count(total)} مدن`
  return `${count(total)} مدينة`
}

function nationalityCountLabel(total: number) {
  if (total === 1) return 'جنسية واحدة'
  if (total === 2) return 'جنسيتان'
  if (total >= 3 && total <= 10) return `${count(total)} جنسيات`
  return `${count(total)} جنسية`
}

function ShareCard({
  title,
  rows,
  loading,
  field,
}: {
  title: string
  rows: GroupCount[]
  loading: boolean
  field: 'city' | 'nationality'
}) {
  const { slices, otherRows } = splitCities(rows)
  const [otherOpen, setOtherOpen] = useState(false)
  const [otherCustomers, setOtherCustomers] = useState<OtherCustomer[] | null>(null)
  const [otherError, setOtherError] = useState('')
  const [otherLoading, setOtherLoading] = useState(false)
  const [cityQuery, setCityQuery] = useState('')
  const [chipCity, setChipCity] = useState<string | null>(null)
  const [openCity, setOpenCity] = useState<string | null>(null)
  const [openCityQuery, setOpenCityQuery] = useState('')
  const [cityClients, setCityClients] = useState<Record<string, OtherCustomer[]>>({})
  const [cityClientError, setCityClientError] = useState('')
  const total = slices.reduce((sum, row) => sum + row.total, 0)
  const otherSlice = slices.find((row) => row.label === 'أخرى')
  const otherShare = total === 0 || !otherSlice ? 0 : (otherSlice.total / total) * 100
  const query = cityQuery.trim()
  const queryDigits = normalizeMobile(query)
  const queryText = query.toLocaleLowerCase('en')
  const customers = otherCustomers ?? []
  const groupNoun = field === 'city' ? 'المدن' : 'الجنسيات'
  const includedLabel = field === 'city' ? 'المدن المشمولة' : 'الجنسيات المشمولة'
  const groupedCount =
    field === 'city' ? cityCountLabel(otherRows.length) : nationalityCountLabel(otherRows.length)
  const visibleCustomers = customers.filter((customer) => {
    const groupValue = field === 'city' ? customer.city : customer.nationality
    if (chipCity && groupValue !== chipCity) return false
    if (!query) return true
    if (customer.full_name.toLocaleLowerCase('en').includes(queryText)) return true
    return queryDigits.length > 0 && normalizeMobile(customer.mobile).includes(queryDigits)
  })
  let cursor = 0
  const gradient =
    total === 0
      ? '#e7eeec'
      : slices
          .map((row, index) => {
            const start = cursor
            cursor += (row.total / total) * 100
            return `${CITY_COLORS[index]} ${start}% ${cursor}%`
          })
          .join(', ')

  const openSlice = slices.find((row) => row.label === openCity)
  const openShare = total === 0 || !openSlice ? 0 : (openSlice.total / total) * 100
  const openClients = openCity ? cityClients[openCity] : undefined
  const openQuery = openCityQuery.trim()
  const openQueryDigits = normalizeMobile(openQuery)
  const openQueryText = openQuery.toLocaleLowerCase('en')
  const visibleOpenClients = (openClients ?? []).filter((customer) => {
    if (!openQuery) return true
    if (customer.full_name.toLocaleLowerCase('en').includes(openQueryText)) return true
    return openQueryDigits.length > 0 && normalizeMobile(customer.mobile).includes(openQueryDigits)
  })

  async function openCityClients(label: string) {
    setOpenCity(label)
    setCityClientError('')
    if (cityClients[label]) return
    const { data, error: queryError } = await supabase
      .from('customers')
      .select('id, full_name, mobile, city, nationality')
      .eq(field, label)
      .order('full_name')

    if (queryError) {
      setCityClientError(errorMessage(queryError))
      return
    }
    setCityClients((current) => ({ ...current, [label]: (data ?? []) as OtherCustomer[] }))
  }

  async function toggleOther() {
    if (otherOpen) {
      setOtherOpen(false)
      return
    }
    setOtherOpen(true)
    if (otherCustomers || otherRows.length === 0) return

    setOtherLoading(true)
    setOtherError('')
    const { data, error: queryError } = await supabase
      .from('customers')
      .select('id, full_name, mobile, city, nationality')
      .in(
        field,
        otherRows.map((row) => row.label),
      )
      .order('full_name')

    setOtherLoading(false)
    if (queryError) {
      setOtherError(errorMessage(queryError))
      return
    }
    setOtherCustomers((data ?? []) as OtherCustomer[])
  }

  return (
    <div className="card">
      <h2 className="card-title">{title}</h2>
      {loading && rows.length === 0 && <p className="muted">جارٍ التحميل…</p>}
      {!loading && rows.length === 0 && <p className="muted">لا توجد بيانات بعد</p>}
      {slices.length > 0 && (
        <div className="city-chart">
          <div className="donut" style={{ background: `conic-gradient(${gradient})` }}>
            <div className="donut-hole">
              <span className="donut-value num">{count(total)}</span>
              <span className="stat-label">عميل</span>
              <span className="donut-caption num">100%</span>
            </div>
          </div>
          <ul className="city-legend">
            {slices.map((row, index) => {
              const isOther = row.label === 'أخرى'
              const isOpen = isOther ? otherOpen : openCity === row.label
              const share = total === 0 ? 0 : (row.total / total) * 100
              const body = (
                <>
                  <span className="city-row-top">
                    <span className="swatch" style={{ background: CITY_COLORS[index] }} />
                    <span className="legend-name">
                      <span className="legend-label">{row.label}</span>
                    </span>
                    <span className="city-stat">
                      <span className="city-count num">{count(row.total)}</span>
                      <span className="city-pct num">{percentText(share)}</span>
                    </span>
                  </span>
                  <span className="city-track" aria-hidden="true">
                    <span
                      className="city-fill"
                      style={{ width: `${share}%`, background: CITY_COLORS[index] }}
                    />
                  </span>
                </>
              )
              return (
                <li key={row.label} className="city-legend-item">
                  <button
                    type="button"
                    className={isOpen ? 'city-row legend-button open' : 'city-row legend-button'}
                    onClick={() => {
                      if (isOther) void toggleOther()
                      else void openCityClients(row.label)
                    }}
                    aria-haspopup="dialog"
                    aria-expanded={isOpen}
                  >
                    {body}
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      )}
      <Modal
        title={openCity ?? ''}
        open={openCity !== null}
        onClose={() => {
          setOpenCity(null)
          setOpenCityQuery('')
        }}
      >
        {openSlice && (
          <div className="insight">
            <div className="insight-stat">
              <span className="insight-pct num" dir="ltr">
                {percentText(openShare)}
              </span>
              <div>
                <div className="insight-figure-row">
                  <span className="insight-figure num">{count(openSlice.total)}</span>
                  <span className="stat-label">عميل</span>
                </div>
              </div>
            </div>
            <input
              className="insight-search"
              value={openCityQuery}
              onChange={(event) => setOpenCityQuery(event.target.value)}
              placeholder="بحث بالاسم أو الجوال"
              aria-label="بحث باسم العميل أو رقم الجوال"
            />
            <section className="insight-block">
              <div className="insight-section-head">
                <span>{openQuery ? 'النتائج' : 'العملاء'}</span>
                <span className="num insight-count">
                  {count(openClients ? visibleOpenClients.length : 0)}
                </span>
              </div>
              {!openClients && !cityClientError && <p className="muted">جارٍ التحميل…</p>}
              {cityClientError && <div className="alert alert-error">{cityClientError}</div>}
              {openClients && !openQuery && openClients.length === 0 && (
                <p className="muted">لا يوجد عملاء</p>
              )}
              {openClients && openQuery && visibleOpenClients.length === 0 && (
                <p className="muted">لا توجد نتائج</p>
              )}
              {visibleOpenClients.length > 0 && (
                <ul className="other-list">
                  {visibleOpenClients.map((customer) => (
                    <li key={customer.id}>
                      <Link
                        className={openQuery ? 'other-client search-result' : 'other-client'}
                        to={`/customers/${customer.id}`}
                      >
                        <span className="other-client-name">
                          {highlightMatch(customer.full_name, openQueryText)}
                        </span>
                        <span className="other-phone num" dir="ltr">
                          {highlightMatch(customer.mobile, openQueryDigits)}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}
      </Modal>
      <Modal
        title="تفاصيل أخرى"
        subtitle={
          otherSlice ? (
            <span className="num">
              {percentText(otherShare)} • {groupedCount}
            </span>
          ) : undefined
        }
        extra={<span className="grouped-badge">مجمّعة</span>}
        open={otherOpen}
        onClose={() => {
          setOtherOpen(false)
          setCityQuery('')
          setChipCity(null)
        }}
      >
        {otherSlice && (
          <div className="insight">
            <div className="insight-stat">
              <span className="insight-pct num" dir="ltr">
                {percentText(otherShare)}
              </span>
              <div>
                <div className="insight-figure-row">
                  <span className="insight-figure num">{count(otherSlice.total)}</span>
                  <span className="stat-label">عميل</span>
                </div>
                <p className="insight-note">
                  تمثل هذه {groupNoun} <span dir="ltr">{percentText(otherShare)}</span> من العملاء.
                </p>
              </div>
            </div>

            <input
              className="insight-search"
              value={cityQuery}
              onChange={(event) => setCityQuery(event.target.value)}
              placeholder="بحث بالاسم أو الجوال"
              aria-label="بحث باسم العميل أو رقم الجوال"
            />
            {query && !otherLoading && visibleCustomers.length === 0 && (
              <p className="muted">لا توجد نتائج</p>
            )}

            {!query && (
              <section className="insight-block">
                <div className="insight-section-head">
                  <span>{includedLabel}</span>
                  <span className="num insight-count">{count(otherRows.length)}</span>
                </div>
                {otherRows.length > 0 && (
                  <div className="city-chips">
                    {otherRows.map((city) => (
                      <button
                        type="button"
                        className={chipCity === city.label ? 'city-chip active' : 'city-chip'}
                        key={city.label}
                        aria-pressed={chipCity === city.label}
                        onClick={() =>
                          setChipCity((current) => (current === city.label ? null : city.label))
                        }
                      >
                        <span>{city.label}</span>
                        <span className="num">{count(city.total)}</span>
                      </button>
                    ))}
                  </div>
                )}
              </section>
            )}

            {(visibleCustomers.length > 0 || otherLoading || otherError || !query) && (
              <section className="insight-block">
                <div className="insight-section-head">
                  <span>{query ? 'النتائج' : chipCity ? `عملاء ${chipCity}` : 'العملاء'}</span>
                  <span className="num insight-count">{count(visibleCustomers.length)}</span>
                </div>
                {otherLoading && <p className="muted">جارٍ التحميل…</p>}
                {otherError && <div className="alert alert-error">{otherError}</div>}
                {visibleCustomers.length > 0 && (
                  <ul className="other-list">
                    {visibleCustomers.map((customer) => (
                      <li key={customer.id}>
                        <Link className={query ? 'other-client search-result' : 'other-client'} to={`/customers/${customer.id}`}>
                          <span className="other-client-main">
                            <span className="other-client-name">{highlightMatch(customer.full_name, queryText)}</span>
                            <span className="other-city">
                              {(field === 'city' ? customer.city : customer.nationality) || '—'}
                            </span>
                          </span>
                          <span className="other-phone num" dir="ltr">
                            {highlightMatch(customer.mobile, queryDigits)}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}

