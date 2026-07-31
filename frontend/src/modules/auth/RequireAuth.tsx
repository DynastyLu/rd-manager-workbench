import { Navigate, Outlet, useLocation } from 'react-router-dom'

import { ROUTES } from '@/constants/routes'
import { useAuthStore } from '@/modules/auth/store'

interface RequireAuthProps {
  permission?: string
}

export function RequireAuth({ permission }: RequireAuthProps) {
  const location = useLocation()
  const status = useAuthStore((state) => state.status)
  const user = useAuthStore((state) => state.user)

  if (status === 'BOOTSTRAPPING') {
    return (
      <div
        className="auth-route-loading"
        aria-busy="true"
        aria-label="正在检查登录状态"
      />
    )
  }

  if (status !== 'AUTHENTICATED' || !user) {
    return (
      <Navigate
        replace
        to={ROUTES.LOGIN}
        state={{ from: `${location.pathname}${location.search}${location.hash}` }}
      />
    )
  }

  if (user.mustChangePassword && location.pathname !== ROUTES.CHANGE_PASSWORD) {
    return <Navigate replace to={ROUTES.CHANGE_PASSWORD} />
  }

  if (
    permission &&
    !user.roleCodes.includes('SUPER_ADMIN') &&
    !user.permissions.some((grant) => grant.code === permission)
  ) {
    return <Navigate replace to={ROUTES.FORBIDDEN} />
  }

  return <Outlet />
}

