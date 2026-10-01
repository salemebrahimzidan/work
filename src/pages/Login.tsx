import { useState } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { errorMessage } from '../lib/format'
import { isSupabaseConfigured } from '../lib/supabase'

export default function Login() {
  const { signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError('')
    setBusy(true)
    try {
      await signIn(email.trim(), password)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="login-screen">
      <form className="login-card" onSubmit={handleSubmit}>
        <h1>تسجيل الدخول</h1>
        <p className="page-sub">نظام خاص لإدارة العملاء والأرباح</p>

        {!isSupabaseConfigured && (
          <div className="alert alert-error">
            إعدادات Supabase غير مكتملة. انسخ <code>.env.example</code> إلى <code>.env</code> وأضف
            قيم <code>VITE_SUPABASE_URL</code> و<code>VITE_SUPABASE_ANON_KEY</code>.
          </div>
        )}

        {error && <div className="alert alert-error">{error}</div>}

        <div className="field">
          <label htmlFor="email">البريد الإلكتروني</label>
          <input
            id="email"
            type="email"
            dir="ltr"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <div className="field">
          <label htmlFor="password">كلمة المرور</label>
          <input
            id="password"
            type="password"
            dir="ltr"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        <button type="submit" className="btn btn-primary" disabled={busy || !isSupabaseConfigured}>
          {busy ? 'جارٍ الدخول…' : 'دخول'}
        </button>
      </form>
    </div>
  )
}
