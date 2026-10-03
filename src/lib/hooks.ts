import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { asServiceCategory, type GroupCount, type ServicePrice } from './types'

export interface CustomerOption {
  id: string
  full_name: string
  mobile: string
}

/** قائمة مختصرة بالعملاء للاستخدام في القوائم المنسدلة */
export function useCustomerOptions() {
  const [options, setOptions] = useState<CustomerOption[]>([])

  useEffect(() => {
    let active = true
    supabase
      .from('customers')
      .select('id, full_name, mobile')
      .order('full_name')
      .then(({ data }) => {
        if (active) setOptions((data ?? []) as CustomerOption[])
      })
    return () => {
      active = false
    }
  }, [])

  return options
}

/** أسعار الخدمات المسجلة في النظام. */
export function useServicePrices() {
  const [services, setServices] = useState<ServicePrice[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true

    async function load() {
      const columns = 'id, name, transaction_value, manual, sort_order, category, steps'
      const primary = await supabase.from('services').select(columns).order('sort_order')
      // Older databases may not have category (0017) or steps (0018) yet.
      let data: Array<Omit<ServicePrice, 'category' | 'steps' | 'commission'> & { category?: string | null; steps?: string | null }> | null =
        primary.data
      let queryError = primary.error
      if (queryError && /steps|schema cache/i.test(queryError.message)) {
        const withoutSteps = await supabase
          .from('services')
          .select('id, name, transaction_value, manual, sort_order, category')
          .order('sort_order')
        data = withoutSteps.data
        queryError = withoutSteps.error
      }
      if (queryError && /category|schema cache/i.test(queryError.message)) {
        const fallback = await supabase
          .from('services')
          .select('id, name, transaction_value, manual, sort_order')
          .order('sort_order')
        data = fallback.data
        queryError = fallback.error
      }
      if (!active) return
      if (queryError) setError(queryError.message)
      else
        setServices(
          (data ?? []).map((row) => ({
            ...row,
            commission: null,
            category: asServiceCategory(row.category),
            steps: row.steps?.trim() ? row.steps : null,
          })),
        )
      setLoading(false)
    }

    void load()
    return () => {
      active = false
    }
  }, [])

  return { services, loading, error }
}

/** قيم الجنسيات والمدن الموجودة فعلياً، لاستخدامها في التصفية */
export function useFilterValues() {
  const [nationalities, setNationalities] = useState<string[]>([])
  const [cities, setCities] = useState<string[]>([])

  useEffect(() => {
    let active = true
    Promise.all([
      supabase.from('customers_by_nationality').select('label, total'),
      supabase.from('customers_by_city').select('label, total'),
    ]).then(([nat, city]) => {
      if (!active) return
      setNationalities(((nat.data ?? []) as GroupCount[]).map((row) => row.label).sort())
      setCities(((city.data ?? []) as GroupCount[]).map((row) => row.label).sort())
    })
    return () => {
      active = false
    }
  }, [])

  return { nationalities, cities }
}
