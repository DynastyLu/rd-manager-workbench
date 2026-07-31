import { NavLink, Routes, Route, useLocation } from 'react-router-dom'
import { ROUTES } from '@/constants/routes'
import OwnershipMigrationPage from './OwnershipMigrationPage'
import PermissionsPage from './PermissionsPage'
import RolesPage from './RolesPage'
import SecurityAuditsPage from './SecurityAuditsPage'
import UsersPage from './UsersPage'
import './AdminPages.less'

const adminTabs = [
  { key: 'users', label: '用户账号', path: ROUTES.ADMIN_USERS },
  { key: 'roles', label: '角色权限', path: ROUTES.ADMIN_ROLES },
  { key: 'permissions', label: '权限目录', path: ROUTES.ADMIN_PERMISSIONS },
  { key: 'audits', label: '安全审计', path: ROUTES.ADMIN_AUDITS },
  { key: 'ownership', label: '归属迁移', path: ROUTES.ADMIN_OWNERSHIP_MIGRATION },
]

function isActive(path: string, pathname: string): boolean {
  return pathname === path || pathname.startsWith(`${path}/`)
}

export default function AdminLayout() {
  const { pathname } = useLocation()

  return (
    <div className="admin-layout app-page">
      <div className="admin-layout__inner app-page__inner">
        <header className="admin-layout__header">
          <div>
            <h1 className="app-page__title">系统管理</h1>
            <p className="app-page__subtitle">管理用户账号、角色、权限、安全审计及数据归属</p>
          </div>
        </header>

        <nav className="admin-layout__tabs" aria-label="系统管理子导航">
          {adminTabs.map((tab) => {
            const active = isActive(tab.path, pathname)
            return (
              <NavLink
                key={tab.key}
                to={tab.path}
                className={`admin-layout__tab${active ? ' admin-layout__tab--active' : ''}`}
                aria-current={active ? 'page' : undefined}
              >
                {tab.label}
              </NavLink>
            )
          })}
        </nav>

        <main className="admin-layout__content">
          <Routes>
            <Route path="users" element={<UsersPage />} />
            <Route path="roles" element={<RolesPage />} />
            <Route path="permissions" element={<PermissionsPage />} />
            <Route path="security-audits" element={<SecurityAuditsPage />} />
            <Route path="ownership-migration" element={<OwnershipMigrationPage />} />
          </Routes>
        </main>
      </div>
    </div>
  )
}
