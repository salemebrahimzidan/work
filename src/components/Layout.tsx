import { useEffect, useMemo, useRef, useState } from 'react'
import {
  BadgeDollarSign,
  Ban,
  Briefcase,
  ChartColumn,
  CheckCircle2,
  ChevronDown,
  Clock,
  GraduationCap,
  LayoutDashboard,
  LogOut,
  Mail,
  Menu,
  Plane,
  PlayCircle,
  ShieldCheck,
  Users,
  Wallet,
  X,
  type LucideIcon,
} from 'lucide-react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { useCompany } from '../auth/CompanyProvider'
import PageSearch, { type SearchPage } from './PageSearch'
import Modal from './Modal'
import AssistantPanel from './AssistantPanel'
import {
  billerCategories,
  billerCategoryLabel,
  categoriesForNav,
  serviceCategoryLabel,
  serviceCategoryPath,
  type ServiceCategory,
} from '../lib/types'

const links: { to: string; label: string; admin: boolean; icon: LucideIcon }[] = [
  { to: '/', label: 'لوحة التحكم', admin: true, icon: LayoutDashboard },
  { to: '/customers', label: 'العملاء', admin: false, icon: Users },
  { to: '/transactions?status=pending', label: 'قيد الانتظار', admin: false, icon: Clock },
  { to: '/transactions?status=in_progress', label: 'قيد التنفيذ', admin: false, icon: PlayCircle },
  { to: '/transactions?status=cancelled', label: 'ملغاة', admin: false, icon: Ban },
  { to: '/transactions?status=completed', label: 'مكتملة', admin: false, icon: CheckCircle2 },
]

const standaloneIcons: Partial<Record<ServiceCategory, LucideIcon>> = {
  tadhakir: Plane,
  taqdeem: GraduationCap,
}

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
  category,
  to: serviceCategoryPath[category],
  label: serviceCategoryLabel[category],
}))

export default function Layout() {
  const { session, profile, isAdmin, signOut } = useAuth()
  const { canViewReports, canViewFinance } = useCompany()
  const { pathname, search } = useLocation()
  const statusParam = new URLSearchParams(search).get('status')
  const [navOpen, setNavOpen] = useState(false)
  const [logoutOpen, setLogoutOpen] = useState(false)
  const [signingOut, setSigningOut] = useState(false)

  useEffect(() => {
    setNavOpen(false)
  }, [pathname, search])

  // Same pages, and same visibility rules, as the sidebar below.
  const searchPages = useMemo<SearchPage[]>(() => {
    const pages: SearchPage[] = links
      .filter((link) => !link.admin || isAdmin)
      .map((link) => ({ to: link.to, label: link.label, icon: link.icon }))
    if (isAdmin) {
      for (const item of paymentLinks) {
        if (item.children) {
          for (const child of item.children) pages.push({ to: child.to, label: child.label, group: item.label, icon: Wallet })
        } else {
          pages.push({ to: item.to, label: item.label, group: 'سداد', icon: Wallet })
        }
      }
      for (const item of serviceLinks) pages.push({ to: item.to, label: item.label, group: 'خدمات', icon: Briefcase })
      for (const item of ticketLinks) {
        pages.push({ to: item.to, label: item.label, icon: standaloneIcons[item.category] ?? Briefcase })
      }
    }
    if (canViewReports) pages.push({ to: '/reports', label: 'التقارير', icon: ChartColumn })
    if (canViewFinance) pages.push({ to: '/profits', label: 'الأرباح', icon: BadgeDollarSign })
    return pages
  }, [isAdmin, canViewReports, canViewFinance])

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
      <aside className={navOpen ? 'sidebar is-open' : 'sidebar'}>
        <div className="sidebar-top">
          <div className="brand">
            <img className="brand-mark" src="/logo.svg" alt="" />
            <span className="brand-name">الايمان روح الذهبية</span>
          </div>
          <button
            type="button"
            className="nav-toggle"
            aria-expanded={navOpen}
            aria-controls="app-nav"
            aria-label={navOpen ? 'إغلاق القائمة' : 'فتح القائمة'}
            onClick={() => setNavOpen((open) => !open)}
          >
            {navOpen ? <X size={22} strokeWidth={2} /> : <Menu size={22} strokeWidth={2} />}
          </button>
        </div>

        <nav
          id="app-nav"
          className="nav"
          onClick={(event) => {
            if ((event.target as HTMLElement).closest('a')) setNavOpen(false)
          }}
        >
          {links
            .filter((link) => !link.admin || isAdmin)
            .map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className={linkClass(isMainActive(link.to))}
                aria-current={isMainActive(link.to) ? 'page' : undefined}
                title={link.label}
              >
                <NavLabel icon={link.icon} label={link.label} />
              </Link>
            ))}
          {isAdmin && (
            <>
              <div className="nav-section">الخدمات</div>
              <NavMenu id="nav-payment" label="سداد" icon={Wallet} items={paymentLinks} pathname={pathname} linkClass={linkClass} />
              <NavMenu id="nav-services" label="خدمات" icon={Briefcase} items={serviceLinks} pathname={pathname} linkClass={linkClass} />
              {ticketLinks.map((link) => {
                const Icon = standaloneIcons[link.category] ?? Briefcase
                return (
                  <Link
                    key={link.to}
                    to={link.to}
                    className={linkClass(isPathActive(pathname, link.to))}
                    aria-current={isPathActive(pathname, link.to) ? 'page' : undefined}
                    title={link.label}
                  >
                    <NavLabel icon={Icon} label={link.label} />
                  </Link>
                )
              })}
            </>
          )}
          {(canViewReports || canViewFinance) && <div className="nav-section">المتابعة</div>}
          {canViewReports && (
            <Link
              to="/reports"
              className={linkClass(isMainActive('/reports'))}
              aria-current={isMainActive('/reports') ? 'page' : undefined}
              title="التقارير"
            >
              <NavLabel icon={ChartColumn} label="التقارير" />
            </Link>
          )}
          {canViewFinance && (
            <Link
              to="/profits"
              className={linkClass(isMainActive('/profits'))}
              aria-current={isMainActive('/profits') ? 'page' : undefined}
              title="الأرباح"
            >
              <NavLabel icon={BadgeDollarSign} label="الأرباح" />
            </Link>
          )}
        </nav>

        <UserMenu
          name={profile?.full_name || ''}
          email={session?.user.email || ''}
          role={isAdmin ? 'مشرف' : 'مستخدم'}
          onLogout={() => setLogoutOpen(true)}
        />
      </aside>

      <Modal title="تسجيل الخروج" compact hideHeader open={logoutOpen} onClose={() => setLogoutOpen(false)}>
        <div className="confirm-dialog">
          <p className="confirm-copy">هل تريد تسجيل الخروج؟</p>
          <p className="confirm-detail">ستحتاج إلى تسجيل الدخول مرة أخرى للمتابعة.</p>
          <div className="confirm-actions">
            <button
              type="button"
              className="btn confirm-delete"
              disabled={signingOut}
              onClick={async () => {
                setSigningOut(true)
                try {
                  await signOut()
                } finally {
                  setSigningOut(false)
                  setLogoutOpen(false)
                }
              }}
            >
              {signingOut ? 'جارٍ الخروج…' : 'تسجيل الخروج'}
            </button>
            <button type="button" className="btn confirm-cancel" onClick={() => setLogoutOpen(false)} autoFocus>
              إلغاء
            </button>
          </div>
        </div>
      </Modal>

      <main className="main">
        <PageSearch pages={searchPages} />
        <Outlet />
      </main>

      <AssistantPanel pages={searchPages} />
    </div>
  )
}

/** Sidebar account box: avatar button (opens a card with name, email, role) and a logout button. */
function UserMenu({
  name,
  email,
  role,
  onLogout,
}: {
  name: string
  email: string
  role: string
  onLogout: () => void
}) {
  const [open, setOpen] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)
  const initial = (name || email || '؟').trim().charAt(0).toUpperCase()

  useEffect(() => {
    if (!open) return
    function onPointer(event: MouseEvent) {
      if (!boxRef.current?.contains(event.target as Node)) setOpen(false)
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="user-box" ref={boxRef}>
      <button
        type="button"
        className="user-avatar"
        aria-label="عرض بيانات الحساب"
        title="عرض بيانات الحساب"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((current) => !current)}
      >
        {initial}
      </button>
      <button
        type="button"
        className="user-logout"
        onClick={onLogout}
        aria-label="تسجيل الخروج"
        title="تسجيل الخروج"
      >
        <LogOut size={17} aria-hidden="true" />
      </button>

      {open && (
        <div className="user-card" role="dialog" aria-label="بيانات الحساب">
          <div className="user-card-band" aria-hidden="true" />
          <span className="user-card-avatar" aria-hidden="true">
            {initial}
          </span>
          {!email && <strong className="user-card-name">{name}</strong>}
          <span className="user-card-role">
            <ShieldCheck size={13} aria-hidden="true" />
            {role}
          </span>
          {email && (
            <div className="user-card-row">
              <Mail size={15} aria-hidden="true" />
              <span className="user-card-email" dir="ltr">
                {email}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

interface NavItem {
  to: string
  label: string
  children?: { to: string; label: string }[]
}

function NavLabel({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  return (
    <>
      <Icon className="nav-icon" size={20} strokeWidth={2} aria-hidden="true" />
      <span className="nav-text">{label}</span>
    </>
  )
}

function NavMenu({
  id,
  label,
  icon,
  items,
  pathname,
  linkClass,
}: {
  id: string
  label: string
  icon: LucideIcon
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
        title={label}
        onClick={() => setOpen((current) => !current)}
      >
        <NavLabel icon={icon} label={label} />
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
