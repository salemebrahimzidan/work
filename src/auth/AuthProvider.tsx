import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import type { Profile } from '../lib/types'

interface AuthValue {
  session: Session | null
  profile: Profile | null
  isAdmin: boolean
  /** حساب معتمد (user أو admin) */
  isMember: boolean
  loading: boolean
  profileLoading: boolean
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [profileLoading, setProfileLoading] = useState(false)

  useEffect(() => {
    let active = true

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return
      setSession(data.session)
      setLoading(false)
    })

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next)
      setLoading(false)
    })

    return () => {
      active = false
      subscription.subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    const userId = session?.user.id
    if (!userId) {
      setProfile(null)
      setProfileLoading(false)
      return
    }
    let active = true
    setProfileLoading(true)
    supabase
      .from('profiles')
      .select('id, full_name, role, created_at')
      .eq('id', userId)
      .maybeSingle()
      .then(({ data }) => {
        if (!active) return
        setProfile((data as Profile | null) ?? null)
        setProfileLoading(false)
      })
    return () => {
      active = false
    }
  }, [session?.user.id])

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
  }, [])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
    setProfile(null)
  }, [])

  const value = useMemo<AuthValue>(
    () => ({
      session,
      profile,
      isAdmin: profile?.role === 'admin',
      isMember: profile?.role === 'admin' || profile?.role === 'user',
      loading,
      profileLoading,
      signIn,
      signOut,
    }),
    [session, profile, loading, profileLoading, signIn, signOut],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
