import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import { routeCategories } from '@/router/routes'
import './Sidebar.less'

export default function Sidebar() {
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
                  {cat.routes.map((r) => {
                    return (
                      <NavLink
                        key={r.path}
                        className={({ isActive }) =>
                          `sidebar__item${isActive ? ' sidebar__item--active' : ''}`
                        }
                        to={r.path}
                      >
                        {({ isActive }) => (
                          <>
                            <span className="sidebar__item-track" />
                            <span className="sidebar__item-icon">{r.icon}</span>
                            <span className="sidebar__item-title">{r.title}</span>
                            {isActive && <span className="sidebar__item-dot" />}
                          </>
                        )}
                      </NavLink>
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
