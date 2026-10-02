import { Link, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'

const links = [
  { to: '/', label: 'لوحة التحكم', admin: true },
  { to: '/customers', label: 'العملاء', admin: false },
  { to: '/transactions?status=pending', label: 'قيد الانتظار', admin: false },
  { to: '/transactions?status=in_progress', label: 'قيد التنفيذ', admin: false },
  { to: '/transactions?status=cancelled', label: 'ملغاة', admin: false },
  { to: '/transactions?status=completed', label: 'مكتملة', admin: false },
  { to: '/profits', label: 'الأرباح', admin: true },
  { to: '/services', label: 'سداد مدفوعات حكومية', admin: true },
  { to: '/taqeeb', label: 'خدمات وزاره التجاره', admin: true },
  { to: '/fawateer', label: 'سداد فواتير', admin: true },
]

export default function Layout() {
  const { session, profile, isAdmin, signOut } = useAuth()
  const { pathname, search } = useLocation()
  const statusParam = new URLSearchParams(search).get('status')

  function linkClass(active: boolean) {
    return active ? 'nav-link active' : 'nav-link'
  }

  function isMainActive(to: string) {
    if (to === '/') return pathname === '/'
    const query = to.split('?')[1]
    if (query) {
      const wanted = new URLSearchParams(query).get('status')
      return pathname.startsWith('/transactions') && statusParam === wanted
    }
    return pathname === to || pathname.startsWith(`${to}/`)
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">ع</span>
          <span>إدارة العملاء</span>
        </div>

        <nav className="nav">
          {links
            .filter((link) => !link.admin || isAdmin)
            .map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className={linkClass(isMainActive(link.to))}
                aria-current={isMainActive(link.to) ? 'page' : undefined}
              >
                {link.label}
              </Link>
            ))}
        </nav>

        <div className="user-box">
          <span className="user-name">
            {profile?.full_name || session?.user.email}
            {isAdmin && <span className="badge badge-admin">مشرف</span>}
          </span>
          <button type="button" className="btn btn-ghost" onClick={signOut}>
            خروج
          </button>
        </div>
      </aside>

      <main className="main">
        <Outlet />
      </main>
    </div>
  )
}
