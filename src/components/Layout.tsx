import { Fragment } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { useCompany } from '../auth/CompanyProvider'
import { serviceCategories, serviceCategoryLabel, serviceCategoryPath } from '../lib/types'

const links = [
  { to: '/', label: 'لوحة التحكم', admin: true },
  { to: '/customers', label: 'العملاء', admin: false },
  { to: '/transactions?status=pending', label: 'قيد الانتظار', admin: false },
  { to: '/transactions?status=in_progress', label: 'قيد التنفيذ', admin: false },
  { to: '/transactions?status=cancelled', label: 'ملغاة', admin: false },
  { to: '/transactions?status=completed', label: 'مكتملة', admin: false },
  ...serviceCategories.map((category) => ({
    to: serviceCategoryPath[category],
    label: serviceCategoryLabel[category],
    admin: true,
  })),
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
