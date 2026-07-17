import { useState, useRef, useEffect } from 'react'
import { useThemeStore, THEME_LABELS } from '@/stores/theme'
import type { Theme } from '@/stores/theme'
import { motion, AnimatePresence } from 'framer-motion'
import './Header.less'

export default function Header() {
  const theme = useThemeStore((s) => s.theme)
  const setTheme = useThemeStore((s) => s.setTheme)

  const [themeMenuOpen, setThemeMenuOpen] = useState(false)

  const themeMenuRef = useRef<HTMLDivElement>(null)

  // Close menus on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (themeMenuRef.current && !themeMenuRef.current.contains(e.target as Node)) {
        setThemeMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const currentTheme = THEME_LABELS[theme]

  return (
    <header className="header">
      {/* Logo & Title */}
      <span className="header__logo">{currentTheme.icon}</span>
      <span className="header__title">
        <span className="header__title-main">研发主管工作台</span>
        <span className="header__title-sub">LOCAL WORKBENCH</span>
      </span>

      <div className="header__spacer" />

      {/* Theme Switcher */}
      <div className="header__theme" ref={themeMenuRef}>
        <button
          className="header__theme-btn"
          onClick={() => setThemeMenuOpen((v) => !v)}
          title="切换主题"
        >
          <span className="header__theme-icon">{currentTheme.icon}</span>
          <span className="header__theme-label">{currentTheme.label}</span>
          <span className="header__caret">▾</span>
        </button>
        <AnimatePresence>
          {themeMenuOpen && (
            <motion.div
              className="header__dropdown header__dropdown--theme"
              initial={{ opacity: 0, scale: 0.95, y: -4 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -4 }}
              transition={{ duration: 0.15, ease: 'easeOut' }}
            >
              {(Object.entries(THEME_LABELS) as [Theme, (typeof THEME_LABELS)[Theme]][]).map(
                ([key, t]) => (
                  <button
                    key={key}
                    className={`header__dropdown-item${key === theme ? ' header__dropdown-item--selected' : ''}`}
                    onClick={() => {
                      setTheme(key)
                      setThemeMenuOpen(false)
                    }}
                  >
                    <span className="header__dropdown-item-icon">{t.icon}</span>
                    <span className="header__dropdown-item-text">
                      <span>{t.label}</span>
                      <span className="header__dropdown-item-desc">{t.desc}</span>
                    </span>
                    {key === theme && <span className="header__dropdown-check">✓</span>}
                  </button>
                )
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </header>
  )
}
