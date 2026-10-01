import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './auth/AuthProvider'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Customers from './pages/Customers'
import CustomerDetails from './pages/CustomerDetails'
import Transactions from './pages/Transactions'
import Profits from './pages/Profits'

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
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/customers" element={<Customers />} />
          <Route path="/customers/:id" element={<CustomerDetails />} />
          <Route path="/transactions" element={<Transactions />} />
          <Route path="/profits" element={<Profits />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <AuthenticatedApp />
    </AuthProvider>
  )
}
