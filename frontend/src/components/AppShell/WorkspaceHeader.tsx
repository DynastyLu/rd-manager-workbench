import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { Link } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import type { RouteDefinition } from '@/router/routes'
import { ROUTES } from '@/constants/routes'
import { THEME_LABELS, type Theme, useThemeStore } from '@/stores/theme'
import { useToastStore } from '@/stores/toast'

interface WorkspaceHeaderProps {
  route?: RouteDefinition
}

export function WorkspaceHeader({ route }: WorkspaceHeaderProps) {
  const theme = useThemeStore((state) => state.theme)
  const setTheme = useThemeStore((state) => state.setTheme)
  const [themeMenuOpen, setThemeMenuOpen] = useState(false)
  const [searchFeedback, setSearchFeedback] = useState('')
  const themeMenuRef = useRef<HTMLDivElement>(null)
  const themeTriggerRef = useRef<HTMLButtonElement>(null)
  const currentTheme = THEME_LABELS[theme]
  const routeTitle = route?.title ?? '工作台'

  useEffect(() => {
    function handleOutsideClick(event: MouseEvent) {
      if (themeMenuRef.current && !themeMenuRef.current.contains(event.target as Node)) {
        setThemeMenuOpen(false)
      }
    }

    document.addEventListener('mousedown', handleOutsideClick)
    return () => document.removeEventListener('mousedown', handleOutsideClick)
  }, [])

  function closeThemeMenu() {
    setThemeMenuOpen(false)
    themeTriggerRef.current?.focus()
  }

  function handleThemeEscape(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault()
      closeThemeMenu()
    }
  }

  function announcePlannedSearch() {
    const message = '本地全局搜索正在规划中。'
    setSearchFeedback(message)
    useToastStore.getState().showInfo(message)
  }

  return (
    <header className="workspace-header">
      <div className="workspace-header__context">
        <span className="workspace-header__identity">研发工作空间</span>
        <span className="workspace-header__status">本地 · 单人</span>
        <div className="workspace-header__route" aria-label={`当前位置：工作空间，${routeTitle}`}>
          <span>工作空间</span>
          <span aria-hidden="true">/</span>
          <strong>{routeTitle}</strong>
        </div>
      </div>

      <div className="workspace-header__actions">
        <button
          type="button"
          className="workspace-header__search"
          onClick={announcePlannedSearch}
          aria-describedby="planned-search-feedback"
        >
          <span aria-hidden="true">⌕</span>
          <span className="workspace-header__search-label">搜索本地工作台</span>
          <span className="workspace-header__planned">全局搜索（规划中）</span>
        </button>
        <span id="planned-search-feedback" className="workspace-header__sr-feedback" role="status">
          {searchFeedback}
        </span>
        <div className="workspace-header__create" aria-label="快速新建">
          <span className="workspace-header__create-label">新建</span>
          <Link to={ROUTES.PROJECT_SPACES}>项目</Link>
          <Link to={ROUTES.MY_WORK}>任务</Link>
        </div>
        <div className="workspace-header__theme" ref={themeMenuRef}>
          <button
            ref={themeTriggerRef}
            type="button"
            className="workspace-header__theme-trigger"
            onClick={() => setThemeMenuOpen((open) => !open)}
            title="切换主题"
            aria-label="切换主题"
            aria-haspopup="menu"
            aria-controls="workspace-theme-menu"
            aria-expanded={themeMenuOpen}
            onKeyDown={handleThemeEscape}
          >
            <span aria-hidden="true">{currentTheme.icon}</span>
            <span className="workspace-header__theme-label">{currentTheme.label}</span>
          </button>
          <AnimatePresence>
            {themeMenuOpen && (
              <motion.div
                id="workspace-theme-menu"
                role="menu"
                className="workspace-header__theme-menu"
                onKeyDown={handleThemeEscape}
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.12, ease: 'easeOut' }}
              >
                {(Object.entries(THEME_LABELS) as [Theme, (typeof THEME_LABELS)[Theme]][]).map(
                  ([key, option]) => (
                    <button
                      key={key}
                      type="button"
                      role="menuitemradio"
                      aria-checked={key === theme}
                      className="workspace-header__theme-option"
                      onClick={() => {
                        setTheme(key)
                        closeThemeMenu()
                      }}
                    >
                      <span aria-hidden="true">{option.icon}</span>
                      <span>{option.label}</span>
                    </button>
                  )
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </header>
  )
}
