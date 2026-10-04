import type { ReactNode } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './auth/AuthProvider'
import { CompanyProvider, useCompany } from './auth/CompanyProvider'
import Layout from './components/Layout'
import { SkeletonTable } from './components/LoadingSkeleton'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Customers from './pages/Customers'
import CustomerDetails from './pages/CustomerDetails'
import Transactions from './pages/Transactions'
import TransactionDetails from './pages/TransactionDetails'
import Profits from './pages/Profits'
import Services from './pages/Services'
import Reports from './pages/Reports'
import { serviceCategories, serviceCategoryPath } from './lib/types'

function AdminOnly({ children }: { children: ReactNode }) {
  const { isAdmin } = useAuth()
  if (!isAdmin) return <Navigate to="/customers" replace />
  return children
}

function FinanceOnly({ children }: { children: ReactNode }) {
  const { canViewFinance, loading } = useCompany()
  if (loading) return <SkeletonTable headers={['العميل', 'المعاملة', 'قيمة المعاملة', 'الحالة', 'التاريخ']} />
  if (!canViewFinance) return <Navigate to="/customers" replace />
  return children
}

function DefaultRedirect() {
  const { isAdmin } = useAuth()
  return <Navigate to={isAdmin ? '/' : '/customers'} replace />
}

function AuthenticatedApp() {
  const { session, loading, profileLoading, isMember, signOut } = useAuth()

  if (loading) {
    return <BootScreen />
  }

  // التطبيق خاص: لا يمكن عرض أي صفحة بدون تسجيل دخول
  if (!session) {
    return <Login />
  }

  if (profileLoading) {
    return <BootScreen />
  }

  // الحسابات الجديدة تبقى بدون أي صلاحية وصول حتى يعتمدها المشرف
  if (!isMember) {
    return (
      <div className="center-screen">
        <div className="card" style={{ maxWidth: 420 }}>
          <h2 className="card-title">الحساب غير معتمد</h2>
          <p>هذا الحساب لا يملك صلاحية الوصول. يجب أن يعتمده المشرف أولاً.</p>
          <button type="button" className="btn btn-ghost" onClick={() => void signOut()}>
            خروج
          </button>
        </div>
      </div>
    )
  }

  return (
    <CompanyProvider userId={session.user.id}>
      <BrowserRouter>
        <Routes>
        <Route element={<Layout />}>
          <Route
            path="/"
            element={
              <AdminOnly>
                <Dashboard />
              </AdminOnly>
            }
          />
          <Route path="/customers" element={<Customers />} />
          <Route path="/customers/:id" element={<CustomerDetails />} />
          <Route path="/transactions" element={<Transactions />} />
          <Route path="/transactions/:id" element={<TransactionDetails />} />
          <Route
            path="/profits"
            element={
              <FinanceOnly>
                <Profits />
              </FinanceOnly>
            }
          />
          <Route path="/fawateer" element={<Navigate to="/fawateer/communications" replace />} />
          <Route
            path="/fawateer/:biller"
            element={
              <AdminOnly>
                <Services category="fawateer" />
              </AdminOnly>
            }
          />
          {serviceCategories
            .filter((category) => category !== 'fawateer')
            .map((category) => (
            <Route
              key={category}
              path={serviceCategoryPath[category]}
              element={
                <AdminOnly>
                  <Services category={category} />
                </AdminOnly>
              }
            />
          ))}
          <Route path="/reports" element={<Reports />} />
          <Route path="*" element={<DefaultRedirect />} />
        </Route>
        </Routes>
      </BrowserRouter>
    </CompanyProvider>
  )
}

function BootScreen() {
  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <img className="brand-mark" src="/logo.svg" alt="" />
          <span className="brand-name">الايمان روح الذهبية</span>
        </div>
      </aside>
      <main className="main">
        <SkeletonTable headers={['', '', '', '']} />
      </main>
    </div>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <AuthenticatedApp />
    </AuthProvider>
  )
}
