import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'

const links = [
  { to: '/', label: 'الرئيسية' },
  { to: '/customers', label: 'العملاء' },
  { to: '/transactions', label: 'المعاملات' },
  { to: '/profits', label: 'الأرباح' },
]

export default function Layout() {
  const { session, profile, isAdmin, signOut } = useAuth()

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand">
            <span className="brand-mark">ع</span>
            <span>إدارة العملاء</span>
          </div>

          <nav className="nav">
            {links.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.to === '/'}
                className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}
              >
                {link.label}
              </NavLink>
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
        </div>
      </header>

      <main className="main">
        <Outlet />
      </main>
    </div>
  )
}
