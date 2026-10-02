import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import type { GroupCount, ServicePrice } from './types'

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
    supabase
      .from('services')
      .select('id, name, transaction_value, commission, manual, sort_order')
      .order('sort_order')
      .then(({ data, error: queryError }) => {
        if (!active) return
        if (queryError) setError(queryError.message)
        else setServices((data ?? []) as ServicePrice[])
        setLoading(false)
      })
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
