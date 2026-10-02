import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { errorMessage } from '../lib/format'
import { SAUDI_MOBILE_PATTERN, normalizeMobile, saudiMobile, saudiMobileInput } from '../lib/mobile'
import { useAuth } from '../auth/AuthProvider'
import type { Customer } from '../lib/types'
import { ComboField } from './SelectField'
import { ALL_NATIONALITIES } from '../data/nationalities'

const CITIES = [
  'جدة',
  'الرياض',
  'مكة',
  'المدينة المنورة',
  'الدمام',
  'الخبر',
  'الطائف',
  'بريدة',
  'تبوك',
  'أبها',
  'حائل',
  'جيزان',
  'نجران',
]

interface Props {
  customer?: Customer | null
  onSaved: () => void
  onCancel: () => void
}

export default function CustomerForm({ customer, onSaved, onCancel }: Props) {
  const { session } = useAuth()
  const [form, setForm] = useState({
    full_name: customer?.full_name ?? '',
    mobile: saudiMobile(customer?.mobile ?? '') ?? '',
    national_id: customer?.national_id ?? '',
    nationality: customer?.nationality ?? '',
    city: customer?.city ?? '',
    district: customer?.district ?? '',
    notes: customer?.notes ?? '',
  })
  const [error, setError] = useState('')
  const [existingId, setExistingId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  function set(key: keyof typeof form, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  async function findExisting(normalized: string): Promise<string | null> {
    let query = supabase
      .from('customers')
      .select('id')
      .eq('mobile_normalized', normalized)
      .order('created_at', { ascending: true })
      .limit(1)

    if (customer) query = query.neq('id', customer.id)

    const { data, error: lookupError } = await query
    if (lookupError) throw lookupError
    return data?.[0]?.id ?? null
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError('')
    setExistingId(null)
    setBusy(true)

    const localMobile = saudiMobile(form.mobile)
    const normalized = localMobile ? normalizeMobile(localMobile) : ''
    const payload = {
      full_name: form.full_name.trim(),
      mobile: localMobile ?? '',
      national_id: form.national_id.trim() || null,
      nationality: form.nationality.trim() || null,
      city: form.city.trim() || null,
      district: form.district.trim() || null,
      notes: form.notes.trim() || null,
    }

    try {
      if (!localMobile) {
        setError('أدخل رقم جوال سعودي، مثل 0551234567')
        return
      }

      const alreadyId = await findExisting(normalized)
      if (alreadyId) {
        setExistingId(alreadyId)
        return
      }

      const { error: saveError } = customer
        ? await supabase.from('customers').update(payload).eq('id', customer.id)
        : await supabase.from('customers').insert({ ...payload, created_by: session?.user.id })

      if (saveError) {
        if (/مسجل مسبق/.test(saveError.message)) {
          const racedId = await findExisting(normalized)
          if (racedId) {
            setExistingId(racedId)
            return
          }
        }
        setError(errorMessage(saveError))
        return
      }
      onSaved()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      {existingId && (
        <div className="alert alert-error">
          <div>هذا العميل مسجل مسبقًا</div>
          <Link to={`/customers/${existingId}`} className="btn btn-sm" style={{ marginTop: 8 }}>
            فتح بيانات العميل
          </Link>
        </div>
      )}

      {error && <div className="alert alert-error">{error}</div>}

      <div className="form-grid">
        <div className="field">
          <label htmlFor="full_name">الاسم الكامل *</label>
          <input
            id="full_name"
            required
            value={form.full_name}
            onChange={(e) => set('full_name', e.target.value)}
          />
        </div>

        <div className="field">
          <label htmlFor="mobile">رقم الجوال *</label>
          <input
            id="mobile"
            required
            dir="ltr"
            inputMode="tel"
            autoComplete="tel"
            placeholder="05xxxxxxxx"
            pattern={SAUDI_MOBILE_PATTERN}
            title="رقم جوال سعودي يبدأ بـ 05، مثل 0551234567"
            value={form.mobile}
            onChange={(e) => set('mobile', saudiMobileInput(e.target.value))}
          />
        </div>

        <div className="field">
          <label htmlFor="nationality">الجنسية</label>
          <ComboField
            id="nationality"
            value={form.nationality}
            onChange={(value) => set('nationality', value)}
            options={ALL_NATIONALITIES}
          />
        </div>

        <div className="field">
          <label htmlFor="city">المدينة</label>
          <ComboField
            id="city"
            value={form.city}
            onChange={(value) => set('city', value)}
            options={CITIES}
          />
        </div>

        <div className="field">
          <label htmlFor="national_id">رقم الهوية / الإقامة (اختياري)</label>
          <input
            id="national_id"
            dir="ltr"
            inputMode="numeric"
            value={form.national_id}
            onChange={(e) => set('national_id', e.target.value)}
          />
        </div>

        <div className="field">
          <label htmlFor="district">الحي / المنطقة (اختياري)</label>
          <input
            id="district"
            value={form.district}
            onChange={(e) => set('district', e.target.value)}
          />
        </div>

        <div className="field full">
          <label htmlFor="notes">ملاحظات (اختياري)</label>
          <textarea id="notes" value={form.notes} onChange={(e) => set('notes', e.target.value)} />
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
