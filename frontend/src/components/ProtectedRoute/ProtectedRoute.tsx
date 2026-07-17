import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuthStore } from '@/stores/auth'
import { ROLES } from '@/constants/roles'

export default function ProtectedRoute({ requireAdmin = false }: { requireAdmin?: boolean }) {
  const user = useAuthStore((s) => s.user)
  const isLoading = useAuthStore((s) => s.isLoading)
  const location = useLocation()

  if (isLoading) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          background: 'linear-gradient(180deg, var(--bg-primary), var(--bg-secondary))',
          color: 'var(--accent-gold)',
          fontFamily: 'var(--font-main, sans-serif)',
          fontSize: 18,
          fontWeight: 800,
          letterSpacing: 2,
        }}
      >
        加载中...
      </div>
    )
  }

  if (!user) {
    const returnUrl = location.pathname + location.search
    const safeReturn = returnUrl.startsWith('/') && !returnUrl.startsWith('//') ? returnUrl : '/'
    return <Navigate to={`/login?returnUrl=${encodeURIComponent(safeReturn)}`} replace />
  }

  if (requireAdmin && user.role !== ROLES.ADMIN) {
    return <Navigate to="/" replace />
  }

  return <Outlet />
}
