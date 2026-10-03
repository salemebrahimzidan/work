import { Fragment } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { useCompany } from '../auth/CompanyProvider'
import NotificationBell from './NotificationBell'

const links = [
  { to: '/', label: 'لوحة التحكم', admin: true },
  { to: '/customers', label: 'العملاء', admin: false },
  { to: '/transactions?status=pending', label: 'قيد الانتظار', admin: false },
  { to: '/transactions?status=in_progress', label: 'قيد التنفيذ', admin: false },
  { to: '/transactions?status=cancelled', label: 'ملغاة', admin: false },
  { to: '/transactions?status=completed', label: 'مكتملة', admin: false },
  { to: '/services', label: 'سداد مدفوعات حكومية', admin: true },
  { to: '/taqeeb', label: 'خدمات وزاره التجاره', admin: true },
  { to: '/fawateer', label: 'سداد فواتير', admin: true },
]

export default function Layout() {
  const { session, profile, isAdmin, signOut } = useAuth()
  const { canViewReports, canViewFinance } = useCompany()
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
        <div className="sidebar-top">
          <div className="brand">
            <span className="brand-mark">ع</span>
            <span>إدارة العملاء</span>
          </div>
          <NotificationBell />
        </div>

        <nav className="nav">
          {links
            .filter((link) => !link.admin || isAdmin)
            .map((link) => (
              <Fragment key={link.to}>
                <Link
                  to={link.to}
                  className={linkClass(isMainActive(link.to))}
                  aria-current={isMainActive(link.to) ? 'page' : undefined}
                >
                  {link.label}
                </Link>
                {canViewFinance && link.to === '/transactions?status=completed' && (
                  <Link
                    to="/profits"
                    className={linkClass(isMainActive('/profits'))}
                    aria-current={isMainActive('/profits') ? 'page' : undefined}
                  >
                    الأرباح
                  </Link>
                )}
              </Fragment>
            ))}
          <span className="nav-label">الشركة</span>
          <Link
            to="/company"
            className={linkClass(isMainActive('/company'))}
            aria-current={isMainActive('/company') ? 'page' : undefined}
          >
            إعدادات الشركة
          </Link>
          <Link
            to="/branches"
            className={linkClass(isMainActive('/branches'))}
            aria-current={isMainActive('/branches') ? 'page' : undefined}
          >
            الفروع
          </Link>
          <Link
            to="/employees"
            className={linkClass(isMainActive('/employees'))}
            aria-current={isMainActive('/employees') ? 'page' : undefined}
          >
            الموظفين
          </Link>
          <Link
            to="/tasks"
            className={linkClass(isMainActive('/tasks'))}
            aria-current={isMainActive('/tasks') ? 'page' : undefined}
          >
            المهام
          </Link>
          {canViewReports && (
            <Link
              to="/reports"
              className={linkClass(isMainActive('/reports'))}
              aria-current={isMainActive('/reports') ? 'page' : undefined}
            >
              التقارير
            </Link>
          )}
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
