import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '@/stores/auth'
import { routeCategories } from '@/router/routes'
import './Sidebar.less'

export default function Sidebar() {
  const navigate = useNavigate()
  const location = useLocation()
  const user = useAuthStore((s) => s.user)

  // All categories open by default
  const [openCats, setOpenCats] = useState<Record<string, boolean>>(() =>
    routeCategories.reduce<Record<string, boolean>>((acc, c) => ({ ...acc, [c.key]: true }), {})
  )

  function toggleCat(key: string) {
    setOpenCats((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  return (
    <aside className="sidebar">
      <div className="sidebar__inner">
        {routeCategories.map((cat) => {
          const visibleRoutes = cat.routes.filter((r) => !r.requireAdmin || user?.role === 'admin')
          if (visibleRoutes.length === 0) return null
          const isOpen = openCats[cat.key]

          return (
            <div key={cat.key} className="sidebar__category">
              {/* Category header */}
              <button
                className="sidebar__cat-header"
                onClick={() => toggleCat(cat.key)}
                aria-expanded={isOpen}
              >
                <span className="sidebar__cat-icon">{cat.icon}</span>
                <span className="sidebar__cat-title">{cat.title}</span>
                <span className={`sidebar__cat-arrow${isOpen ? ' sidebar__cat-arrow--open' : ''}`}>
                  ›
                </span>
              </button>

              {/* Route items */}
              {isOpen && (
                <div className="sidebar__items">
                  {visibleRoutes.map((r) => {
                    const isActive = location.pathname === r.path
                    return (
                      <div
                        key={r.path}
                        className={`sidebar__item${isActive ? ' sidebar__item--active' : ''}`}
                        onClick={() => {
                          void navigate(r.path)
                        }}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') void navigate(r.path)
                        }}
                      >
                        <span className="sidebar__item-track" />
                        <span className="sidebar__item-icon">{r.icon}</span>
                        <span className="sidebar__item-title">{r.title}</span>
                        {isActive && <span className="sidebar__item-dot" />}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </aside>
  )
}
