import { useState } from 'react'
import { ChartColumn, Eye, EyeOff, Gem, Lock, Mail, Settings, Shield, ShieldCheck, Users, Zap } from 'lucide-react'
import { useAuth } from '../auth/AuthProvider'
import { errorMessage } from '../lib/format'
import { isSupabaseConfigured } from '../lib/supabase'

const features = [
  { icon: Users, title: 'إدارة العملاء', text: 'تنظيم بيانات عملائك بسهولة' },
  { icon: ChartColumn, title: 'تقارير الأرباح', text: 'إحصائيات دقيقة وشاملة' },
  { icon: ShieldCheck, title: 'صلاحيات متعددة', text: 'أمان وتحكم كامل في النظام' },
  { icon: Settings, title: 'إدارة الخدمات', text: 'متابعة جميع العمليات' },
]

const values = [
  { icon: Gem, label: 'الجودة' },
  { icon: Zap, label: 'الإنجاز' },
  { icon: Shield, label: 'الثقة' },
]

export default function Login() {
  const { signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [remember, setRemember] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError('')
    setNotice('')
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
      <main className="login-main">
        <form className="login-card" onSubmit={handleSubmit}>
          <div className="login-card-brand">
            <span className="login-mark" aria-hidden="true">
              ا
            </span>
            <p className="login-card-name">
              الايمان <span>روح الذهبية</span>
            </p>
            <p className="login-card-note">نظام خاص لإدارة العملاء والأرباح</p>
          </div>

          <h1>مرحباً بعودتك</h1>
          <p className="login-note">أدخل البريد الإلكتروني وكلمة المرور للمتابعة إلى النظام</p>

          {!isSupabaseConfigured && (
            <div className="alert alert-error">
              إعدادات Supabase غير مكتملة. انسخ <code>.env.example</code> إلى <code>.env</code> وأضف
              قيم <code>VITE_SUPABASE_URL</code> و<code>VITE_SUPABASE_ANON_KEY</code>.
            </div>
          )}

          {error && <div className="alert alert-error">{error}</div>}
          {notice && <div className="alert alert-info">{notice}</div>}

          <div className="field">
            <label htmlFor="email">البريد الإلكتروني</label>
            <div className="login-input">
              <Mail size={18} aria-hidden="true" />
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
          </div>

          <div className="field">
            <label htmlFor="password">كلمة المرور</label>
            <div className="login-input">
              <Lock size={18} aria-hidden="true" />
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                dir="ltr"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                type="button"
                className="login-eye"
                aria-label={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                onClick={() => setShowPassword((current) => !current)}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <div className="login-row">
            <label className="login-remember">
              <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
              تذكرني
            </label>
            <button
              type="button"
              className="login-forgot"
              onClick={() => setNotice('لإعادة تعيين كلمة المرور، تواصل مع مشرف النظام.')}
            >
              نسيت كلمة المرور؟
            </button>
          </div>

          <button type="submit" className="btn login-submit" disabled={busy || !isSupabaseConfigured}>
            {busy ? 'جارٍ الدخول…' : 'دخول'}
          </button>
        </form>
      </main>

      <aside className="login-hero">
        <div className="login-hero-body">
          <span className="login-mark login-mark-gold" aria-hidden="true">
            ا
          </span>
          <h2>
            الايمان <span>روح الذهبية</span>
          </h2>
          <p className="login-hero-note">نظام خاص لإدارة العملاء والأرباح</p>
          <p className="login-hero-lead">
            إدارة أفضل .. بيانات أكثر دقة .. تقارير تساعدك على تطوير أعمالك ونمو شركتك.
          </p>
          <ul className="login-features">
            {features.map((item) => (
              <li key={item.title}>
                <span className="login-feature-icon" aria-hidden="true">
                  <item.icon size={18} />
                </span>
                <strong>{item.title}</strong>
                <span>{item.text}</span>
              </li>
            ))}
          </ul>
        </div>
        <ul className="login-values">
          {values.map((item) => (
            <li key={item.label}>
              <item.icon size={14} aria-hidden="true" />
              {item.label}
            </li>
          ))}
        </ul>
      </aside>
    </div>
  )
}
