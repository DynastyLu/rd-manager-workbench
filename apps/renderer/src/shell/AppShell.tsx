import { Outlet } from 'react-router-dom'

import { AppHeader } from './AppHeader'
import { AppSidebar } from './AppSidebar'

export function AppShell() {
  return (
    <div className="app-frame">
      <AppSidebar />
      <div className="app-workspace">
        <AppHeader />
        <main id="main-content" className="app-content" tabIndex={-1}>
          <Outlet />
        </main>
      </div>
    </div>
  )
}
