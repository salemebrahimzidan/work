import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'

const links = [
  { to: '/', label: 'الرئيسية', admin: true },
  { to: '/customers', label: 'العملاء', admin: false },
  { to: '/transactions', label: 'المعاملات', admin: false },
  { to: '/profits', label: 'الأرباح', admin: true },
]

export default function Layout() {
  const { session, profile, isAdmin, signOut } = useAuth()

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
      </aside>

      <main className="main">
        <Outlet />
      </main>
    </div>
  )
}
