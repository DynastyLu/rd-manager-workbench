import React from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/auth'
import { routeCategories } from '@/router/routes'
import { motion } from 'framer-motion'
import { listVariants, itemVariants } from '@/lib/motion'

interface RouteItem {
  path: string
  title: string
  icon: string
  requireAdmin?: boolean
}

interface RouteCategory {
  key: string
  title: string
  icon: string
  routes: RouteItem[]
}

export default function Home(): React.JSX.Element {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)

  const categories = (routeCategories as RouteCategory[])
    .map((cat) => ({
      ...cat,
      routes: cat.routes.filter((r) => !r.requireAdmin || user?.role === 'admin'),
    }))
    .filter((cat) => cat.routes.length > 0)
  const toolCount = categories.reduce(
    (sum, cat) => sum + cat.routes.filter((r) => r.path !== '/').length,
    0
  )

  return (
    <div className="app-page app-page--home">
      <div className="app-page__inner">
        <div className="app-page__hero">
          <div>
            <p className="app-page__eyebrow">World Cup Treasure</p>
            <h1 className="app-page__title">百宝箱开球台</h1>
            <p className="app-page__subtitle">
              选择一个工具上场，文档识别、形象生成和管理入口都在这里。
            </p>
          </div>
          <div className="app-page__meta" aria-label="工作台统计">
            <span className="app-page__chip">{toolCount} 个工具</span>
            <span className="app-page__chip">{categories.length} 个分区</span>
            <span className="app-page__chip">
              {user?.role === 'admin' ? '管理员阵容' : '普通用户阵容'}
            </span>
          </div>
        </div>

        {categories.map((cat) => (
          <section key={cat.key} className="app-section">
            <div className="app-section__header">
              <span className="app-section__icon">{cat.icon}</span>
              <span className="app-section__title">{cat.title}</span>
              <div className="app-section__line" />
            </div>
            <motion.div
              className="tool-grid"
              variants={listVariants}
              initial="initial"
              animate="animate"
            >
              {cat.routes
                .filter((r) => r.path !== '/')
                .map((r, index) => (
                  <motion.div
                    key={r.path}
                    variants={itemVariants}
                    whileHover={{ scale: 1.02 }}
                    style={{ transformOrigin: 'center' }}
                  >
                    <button
                      className="tool-tile"
                      onClick={() => {
                        void navigate(r.path)
                      }}
                    >
                      <span className="tool-tile__number">
                        STARTER {String(index + 1).padStart(2, '0')}
                      </span>
                      <span className="tool-tile__row">
                        <span className="tool-tile__icon">{r.icon}</span>
                        <span className="tool-tile__title">{r.title}</span>
                        <span className="tool-tile__arrow">›</span>
                      </span>
                    </button>
                  </motion.div>
                ))}
            </motion.div>
          </section>
        ))}
      </div>
    </div>
  )
}
