import { useEffect, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { useCompany } from '../auth/CompanyProvider'
import { billerCategories, billerCategoryLabel, categoriesForNav, serviceCategoryLabel, serviceCategoryPath } from '../lib/types'

const links = [
  { to: '/', label: 'لوحة التحكم', admin: true },
  { to: '/customers', label: 'العملاء', admin: false },
  { to: '/transactions?status=pending', label: 'قيد الانتظار', admin: false },
  { to: '/transactions?status=in_progress', label: 'قيد التنفيذ', admin: false },
  { to: '/transactions?status=cancelled', label: 'ملغاة', admin: false },
  { to: '/transactions?status=completed', label: 'مكتملة', admin: false },
]

const paymentLinks: NavItem[] = [
  { to: serviceCategoryPath.sdad, label: serviceCategoryLabel.sdad },
  {
    to: serviceCategoryPath.fawateer,
    label: serviceCategoryLabel.fawateer,
    children: billerCategories.map((key) => ({
      to: `${serviceCategoryPath.fawateer}/${key}`,
      label: billerCategoryLabel[key],
    })),
  },
]

const serviceLinks = categoriesForNav('services').map((category) => ({
  to: serviceCategoryPath[category],
  label: serviceCategoryLabel[category].replace(/^خدمات\s+/, ''),
}))

const ticketLinks = categoriesForNav('tickets').map((category) => ({
  to: serviceCategoryPath[category],
  label: serviceCategoryLabel[category],
}))

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
    return isPathActive(pathname, to)
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
              <Link
                key={link.to}
                to={link.to}
                className={linkClass(isMainActive(link.to))}
                aria-current={isMainActive(link.to) ? 'page' : undefined}
              >
                {link.label}
              </Link>
            ))}
          {isAdmin && (
            <>
              <NavMenu id="nav-payment" label="سداد" items={paymentLinks} pathname={pathname} linkClass={linkClass} />
              <NavMenu id="nav-services" label="خدمات" items={serviceLinks} pathname={pathname} linkClass={linkClass} />
              {ticketLinks.map((link) => (
                <Link
                  key={link.to}
                  to={link.to}
                  className={linkClass(isPathActive(pathname, link.to))}
                  aria-current={isPathActive(pathname, link.to) ? 'page' : undefined}
                >
                  {link.label}
                </Link>
              ))}
            </>
          )}
          {canViewReports && (
            <Link
              to="/reports"
              className={linkClass(isMainActive('/reports'))}
              aria-current={isMainActive('/reports') ? 'page' : undefined}
            >
              التقارير
            </Link>
          )}
          {canViewFinance && (
            <Link
              to="/profits"
              className={linkClass(isMainActive('/profits'))}
              aria-current={isMainActive('/profits') ? 'page' : undefined}
            >
              الأرباح
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

interface NavItem {
  to: string
  label: string
  children?: { to: string; label: string }[]
}

function NavMenu({
  id,
  label,
  items,
  pathname,
  linkClass,
}: {
  id: string
  label: string
  items: NavItem[]
  pathname: string
  linkClass: (active: boolean) => string
}) {
  const active = items.some((link) => isPathActive(pathname, link.to))
  const [open, setOpen] = useState(active)

  useEffect(() => {
    if (active) setOpen(true)
  }, [active])

  return (
    <div className={open ? 'nav-menu is-open' : 'nav-menu'}>
      <button
        type="button"
        className={linkClass(active && !open)}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((current) => !current)}
      >
        {label}
        <ChevronDown className="nav-caret" size={16} strokeWidth={2} aria-hidden="true" />
      </button>
      {open && (
        <div className="nav-menu-items" id={id}>
          {items.map((link) =>
            link.children ? (
              <NestedNav key={link.to} item={link} pathname={pathname} linkClass={linkClass} />
            ) : (
              <LeafLink key={link.to} item={link} pathname={pathname} linkClass={linkClass} />
            ),
          )}
        </div>
      )}
    </div>
  )
}

function LeafLink({
  item,
  pathname,
  linkClass,
}: {
  item: NavItem
  pathname: string
  linkClass: (active: boolean) => string
}) {
  const current = isPathActive(pathname, item.to)
  return (
    <Link to={item.to} className={`${linkClass(current)} nav-sub`} aria-current={current ? 'page' : undefined}>
      {item.label}
    </Link>
  )
}

function NestedNav({
  item,
  pathname,
  linkClass,
}: {
  item: NavItem
  pathname: string
  linkClass: (active: boolean) => string
}) {
  const children = item.children ?? []
  const childActive = children.some((child) => pathname === child.to)
  const [open, setOpen] = useState(childActive)

  useEffect(() => {
    if (childActive) setOpen(true)
  }, [childActive])

  return (
    <div className={open ? 'nav-menu is-open' : 'nav-menu'}>
      <button
        type="button"
        className={`${linkClass(childActive && !open)} nav-sub`}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        {item.label}
        <ChevronDown className="nav-caret" size={16} strokeWidth={2} aria-hidden="true" />
      </button>
      {open && (
        <div className="nav-menu-items">
          {children.map((child) => {
            const current = pathname === child.to
            return (
              <Link
                key={child.to}
                to={child.to}
                className={`${linkClass(current)} nav-sub nav-sub-2`}
                aria-current={current ? 'page' : undefined}
              >
                {child.label}
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}

function isPathActive(pathname: string, to: string) {
  return pathname === to || pathname.startsWith(`${to}/`)
}
