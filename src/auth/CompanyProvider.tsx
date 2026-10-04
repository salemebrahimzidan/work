import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import { errorMessage } from '../lib/format'
import type { CompanyInfo, CompanyRole, CompanyStatus } from '../lib/types'

interface CompanyValue {
  company: CompanyInfo | null
  role: CompanyRole | null
  loading: boolean
  error: string
  /** More than one company is visible and none is selected as active. */
  ambiguous: boolean
  canViewReports: boolean
  canViewFinance: boolean
  reload: () => Promise<void>
}

const CompanyContext = createContext<CompanyValue | null>(null)

function asRole(value: string): CompanyRole | null {
  if (value === 'owner' || value === 'admin' || value === 'manager' || value === 'user') return value
  return null
}

function asStatus(value: string): CompanyStatus | null {
  if (value === 'active' || value === 'suspended') return value
  return null
}

export function CompanyProvider({ userId, children }: { userId: string; children: ReactNode }) {
  const [company, setCompany] = useState<CompanyInfo | null>(null)
  const [role, setRole] = useState<CompanyRole | null>(null)
  const [ambiguous, setAmbiguous] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const reload = useCallback(async () => {
    setLoading(true)
    setError('')

    const [membersRes, activeRes, companiesRes] = await Promise.all([
      supabase.from('company_members').select('company_id, role, status').eq('user_id', userId),
      supabase.from('user_active_company').select('company_id').eq('user_id', userId).maybeSingle(),
      supabase.from('companies').select('id, name, status'),
    ])

    const queryError = membersRes.error || activeRes.error || companiesRes.error
    if (queryError) {
      setCompany(null)
      setRole(null)
      setAmbiguous(false)
      setError(errorMessage(queryError))
      setLoading(false)
      return
    }

    const companies = (companiesRes.data ?? [])
      .map((row) => {
        const status = asStatus(row.status)
        if (!status) return null
        return { id: row.id, name: row.name, status }
      })
      .filter((row): row is CompanyInfo => row !== null)

    const visible = new Map(companies.map((row) => [row.id, row]))
    const activeId = activeRes.data?.company_id
    let chosen = activeId ? visible.get(activeId) ?? null : null
    if (!chosen && companies.length === 1) chosen = companies[0]
    const several = !chosen && companies.length > 1

    const membership = chosen
      ? (membersRes.data ?? []).find((row) => row.company_id === chosen.id && row.status === 'active')
      : null

    setCompany(chosen)
    setRole(membership ? asRole(membership.role) : null)
    setAmbiguous(several)
    setLoading(false)
  }, [userId])

  useEffect(() => {
    void reload()
  }, [reload])

  const value = useMemo<CompanyValue>(
    () => ({
      company,
      role,
      loading,
      error,
      ambiguous,
      canViewReports: role === 'owner' || role === 'admin' || role === 'manager',
      canViewFinance: role === 'owner' || role === 'admin',
      reload,
    }),
    [company, role, loading, error, ambiguous, reload],
  )

  return <CompanyContext.Provider value={value}>{children}</CompanyContext.Provider>
}

export function useCompany(): CompanyValue {
  const ctx = useContext(CompanyContext)
  if (!ctx) throw new Error('useCompany must be used inside CompanyProvider')
  return ctx
}
