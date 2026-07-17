import { useRef, useEffect, useState, useCallback } from 'react'
import * as RRD from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import TabItem from '@/components/TabBar/TabItem'
import './TabBar.less'

const STORAGE_KEY = 'tabbar_state'

interface Tab {
  path: string
  title: string
}

interface TabBarProps {
  routes?: Tab[]
}

function loadTabs(initialPath: string, routes: Tab[]): Tab[] {
  const routeByPath = new Map(routes.map((route) => [route.path, route]))
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      const { tabs } = JSON.parse(saved) as { tabs: Tab[] }
      if (Array.isArray(tabs)) {
        const validTabs = tabs.flatMap((tab) => {
          const route = routeByPath.get(tab.path)
          return route ? [{ path: route.path, title: route.title }] : []
        })
        if (validTabs.length > 0) return validTabs
      }
    }
  } catch {
    // ignore corrupted storage
  }
  return [{ path: initialPath, title: initialPath }]
}

function useNavigateCompat() {
  return RRD.useNavigate()
}

/**
 * TabBar 自管理组件
 *
 * 无需外部 Context 或 Provider，内部管理 tab 状态并持久化到 localStorage。
 * 兼容 React Router v5.x 和 v6.x。
 *
 * Props:
 *   routes  {Array<{path, title}>}  路由配置，用于查找 tab 标题
 */
export default function TabBar({ routes = [] }: TabBarProps) {
  const location = RRD.useLocation()
  const navigate = useNavigateCompat()

  const [tabs, setTabs] = useState<Tab[]>(() => loadTabs(location.pathname, routes))
  const [activeTab, setActiveTab] = useState<string>(location.pathname)

  const listRef = useRef<HTMLDivElement>(null)
  const [showArrows, setShowArrows] = useState<boolean>(false)

  // 持久化 tabs
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ tabs }))
  }, [tabs])

  // 路由变化时同步 tab（自动添加或更新标题）
  useEffect(() => {
    const route = routes.find((r) => r.path === location.pathname)
    const title = route?.title ?? location.pathname
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTabs((prev) => {
      const idx = prev.findIndex((t) => t.path === location.pathname)
      if (idx !== -1) {
        const existing = prev[idx]!
        if (existing.title === title) return prev
        const updated = [...prev]
        updated[idx] = { ...existing, title }
        return updated
      }
      return [...prev, { path: location.pathname, title }]
    })
    setActiveTab(location.pathname)
  }, [location.pathname, routes])

  // ResizeObserver 监听溢出
  useEffect(() => {
    const el = listRef.current
    if (!el) return
    const check = () => setShowArrows(el.scrollWidth > el.clientWidth)
    check()
    const ro = new ResizeObserver(check)
    ro.observe(el)
    return () => ro.disconnect()
  }, [tabs])

  // 路由切换时将激活 tab 滚动到可见区域
  useEffect(() => {
    const el = listRef.current
    if (!el) return
    requestAnimationFrame(() => {
      const activeEl = el.querySelector(`[data-path="${activeTab}"]`)
      activeEl?.scrollIntoView?.({ inline: 'nearest', block: 'nearest' })
    })
  }, [activeTab])

  const handleTabClick = useCallback(
    (path: string) => {
      setActiveTab(path)
      void navigate(path)
    },
    [navigate]
  )

  const handleTabClose = useCallback(
    (path: string) => {
      if (tabs.length <= 1) return
      const idx = tabs.findIndex((t) => t.path === path)
      const remaining = tabs.filter((t) => t.path !== path)
      setTabs(remaining)
      if (path === activeTab) {
        const target = remaining[Math.min(idx, remaining.length - 1)]!
        setActiveTab(target.path)
        void navigate(target.path)
      }
    },
    [tabs, activeTab, navigate]
  )

  const scroll = (dir: number) => {
    if (listRef.current) listRef.current.scrollLeft += dir * 200
  }

  return (
    <div className="tab-bar">
      <button
        className="tab-bar__arrow tab-bar__arrow--left"
        aria-label="向左滚动"
        style={{ visibility: showArrows ? 'visible' : 'hidden' }}
        onClick={() => scroll(-1)}
      >
        ‹
      </button>

      <div className="tab-bar__list" ref={listRef}>
        <AnimatePresence initial={false}>
          {tabs.map((tab) => (
            <motion.div
              key={tab.path}
              className="tab-item-wrapper"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
            >
              {tab.path === activeTab && (
                <motion.div
                  layoutId="tab-indicator"
                  className="tab-active-indicator"
                  transition={{ type: 'spring', stiffness: 500, damping: 40 }}
                />
              )}
              <TabItem
                path={tab.path}
                title={tab.title}
                active={tab.path === activeTab}
                isLast={tabs.length === 1}
                onClick={handleTabClick}
                onClose={handleTabClose}
              />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <button
        className="tab-bar__arrow tab-bar__arrow--right"
        aria-label="向右滚动"
        style={{ visibility: showArrows ? 'visible' : 'hidden' }}
        onClick={() => scroll(1)}
      >
        ›
      </button>
    </div>
  )
}
