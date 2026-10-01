import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { errorMessage } from '../lib/format'
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
  const [busy, setBusy] = useState(false)

  function set(key: keyof typeof form, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError('')
    setBusy(true)

    const payload = {
      full_name: form.full_name.trim(),
      mobile: form.mobile.trim(),
      national_id: form.national_id.trim() || null,
      nationality: form.nationality.trim(),
      city: form.city.trim(),
      district: form.district.trim() || null,
      notes: form.notes.trim() || null,
    }

    const { error: saveError } = customer
      ? await supabase.from('customers').update(payload).eq('id', customer.id)
      : await supabase.from('customers').insert({ ...payload, created_by: session?.user.id })

    setBusy(false)
    if (saveError) {
      setError(errorMessage(saveError))
      return
    }
    onSaved()
  }

  return (
    <form onSubmit={handleSubmit}>
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
          <label htmlFor="nationality">الجنسية *</label>
          <input
            id="nationality"
            required
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
          <label htmlFor="city">المدينة *</label>
          <input
            id="city"
            required
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
