import type { ReactNode } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './auth/AuthProvider'
import { CompanyProvider, useCompany } from './auth/CompanyProvider'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Customers from './pages/Customers'
import CustomerDetails from './pages/CustomerDetails'
import Transactions from './pages/Transactions'
import TransactionDetails from './pages/TransactionDetails'
import Profits from './pages/Profits'
import Services from './pages/Services'
import Reports from './pages/Reports'

function AdminOnly({ children }: { children: ReactNode }) {
  const { isAdmin } = useAuth()
  if (!isAdmin) return <Navigate to="/customers" replace />
  return children
}

function FinanceOnly({ children }: { children: ReactNode }) {
  const { canViewFinance, loading } = useCompany()
  if (loading) return <div className="empty">جارٍ التحميل…</div>
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
    return <div className="center-screen">جارٍ التحميل…</div>
  }

  // التطبيق خاص: لا يمكن عرض أي صفحة بدون تسجيل دخول
  if (!session) {
    return <Login />
  }

  if (profileLoading) {
    return <div className="center-screen">جارٍ التحميل…</div>
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
          <Route
            path="/services"
            element={
              <AdminOnly>
                <Services category="sdad" />
              </AdminOnly>
            }
          />
          <Route
            path="/taqeeb"
            element={
              <AdminOnly>
                <Services category="taqeeb" />
              </AdminOnly>
            }
          />
          <Route
            path="/fawateer"
            element={
              <AdminOnly>
                <Services category="fawateer" />
              </AdminOnly>
            }
          />
          <Route path="/reports" element={<Reports />} />
          <Route path="*" element={<DefaultRedirect />} />
        </Route>
        </Routes>
      </BrowserRouter>
    </CompanyProvider>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <AuthenticatedApp />
    </AuthProvider>
  )
}
