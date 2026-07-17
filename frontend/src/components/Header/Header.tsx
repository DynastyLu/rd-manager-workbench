import { useState, useRef, useEffect, type KeyboardEvent } from 'react'
import { useThemeStore, THEME_LABELS } from '@/stores/theme'
import type { Theme } from '@/stores/theme'
import { motion, AnimatePresence } from 'framer-motion'
import './Header.less'

export default function Header() {
  const theme = useThemeStore((s) => s.theme)
  const setTheme = useThemeStore((s) => s.setTheme)

  const [themeMenuOpen, setThemeMenuOpen] = useState(false)

  const themeMenuRef = useRef<HTMLDivElement>(null)
  const themeTriggerRef = useRef<HTMLButtonElement>(null)

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
          ref={themeTriggerRef}
          className="header__theme-btn"
          onClick={() => setThemeMenuOpen((open) => !open)}
          title="切换主题"
          aria-label="切换主题"
          aria-haspopup="menu"
          aria-controls="theme-menu"
          aria-expanded={themeMenuOpen}
          onKeyDown={handleThemeEscape}
        >
          <span className="header__theme-icon">{currentTheme.icon}</span>
          <span className="header__theme-label">{currentTheme.label}</span>
          <span className="header__caret">▾</span>
        </button>
        <AnimatePresence>
          {themeMenuOpen && (
            <motion.div
              id="theme-menu"
              role="menu"
              onKeyDown={handleThemeEscape}
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
                    role="menuitemradio"
                    aria-checked={key === theme}
                    className={`header__dropdown-item${key === theme ? ' header__dropdown-item--selected' : ''}`}
                    onClick={() => {
                      setTheme(key)
                      closeThemeMenu()
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
