import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { isConfigured, supabase } from './lib/supabase'
import type { Profile } from './lib/types'

type AuthValue = {
  configured: boolean
  loading: boolean
  session: Session | null
  profile: Profile | null
  profileError: string | null
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [profileError, setProfileError] = useState<string | null>(null)
  const [loading, setLoading] = useState(isConfigured)

  useEffect(() => {
    if (!isConfigured) return
    let alive = true
    supabase.auth.getSession().then(({ data }) => {
      if (!alive) return
      setSession(data.session)
      if (!data.session) setLoading(false)
    })
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next)
      if (!next) {
        setProfile(null)
        setProfileError(null)
        setLoading(false)
      }
    })
    return () => {
      alive = false
      data.subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!session) return
    let alive = true
    supabase
      .from('profiles')
      .select('id, full_name, role')
      .eq('id', session.user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!alive) return
        if (error) {
          setProfile(null)
          setProfileError(error.message)
        } else {
          setProfile((data as Profile | null) ?? null)
          setProfileError(null)
        }
        setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [session])

  const value = useMemo<AuthValue>(
    () => ({
      configured: isConfigured,
      loading,
      session,
      profile,
      profileError,
      async signIn(email: string, password: string) {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        })
        if (error) throw new Error('Неверная почта или пароль')
      },
      async signOut() {
        await supabase.auth.signOut()
      },
    }),
    [loading, session, profile, profileError],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext)
  if (!value) throw new Error('AuthProvider missing')
  return value
}
