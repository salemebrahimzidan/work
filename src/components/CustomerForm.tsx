import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { errorMessage } from '../lib/format'
import { normalizeMobile } from '../lib/mobile'
import { useAuth } from '../auth/AuthProvider'
import type { Customer } from '../lib/types'

const NATIONALITIES = [
  'سعودي',
  'سوداني',
  'مصري',
  'يمني',
  'سوري',
  'أردني',
  'فلسطيني',
  'باكستاني',
  'هندي',
  'بنغلاديشي',
  'فلبيني',
  'إندونيسي',
  'إثيوبي',
  'تشادي',
  'نيجيري',
]

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
    mobile: customer?.mobile ?? '',
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

    const normalized = normalizeMobile(form.mobile)
    const payload = {
      full_name: form.full_name.trim(),
      mobile: form.mobile.trim(),
      national_id: form.national_id.trim() || null,
      nationality: form.nationality.trim() || null,
      city: form.city.trim() || null,
      district: form.district.trim() || null,
      notes: form.notes.trim() || null,
    }

    try {
      if (!normalized) {
        setError('رقم الجوال غير صحيح')
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
            value={form.mobile}
            onChange={(e) => set('mobile', e.target.value)}
          />
        </div>

        <div className="field">
          <label htmlFor="nationality">الجنسية</label>
          <input
            id="nationality"
            list="nationality-options"
            value={form.nationality}
            onChange={(e) => set('nationality', e.target.value)}
          />
          <datalist id="nationality-options">
            {NATIONALITIES.map((item) => (
              <option key={item} value={item} />
            ))}
          </datalist>
        </div>

        <div className="field">
          <label htmlFor="city">المدينة</label>
          <input
            id="city"
            list="city-options"
            value={form.city}
            onChange={(e) => set('city', e.target.value)}
          />
          <datalist id="city-options">
            {CITIES.map((item) => (
              <option key={item} value={item} />
            ))}
          </datalist>
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
