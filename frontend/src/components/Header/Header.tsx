import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/auth'
import { useThemeStore, THEME_LABELS } from '@/stores/theme'
import type { Theme } from '@/stores/theme'
import { motion, AnimatePresence } from 'framer-motion'
import './Header.less'

export default function Header() {
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)
  const theme = useThemeStore((s) => s.theme)
  const setTheme = useThemeStore((s) => s.setTheme)
  const navigate = useNavigate()

  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [themeMenuOpen, setThemeMenuOpen] = useState(false)

  const userMenuRef = useRef<HTMLDivElement>(null)
  const themeMenuRef = useRef<HTMLDivElement>(null)

  // Close menus on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false)
      }
      if (themeMenuRef.current && !themeMenuRef.current.contains(e.target as Node)) {
        setThemeMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  async function handleLogout() {
    setUserMenuOpen(false)
    await logout()
    void navigate('/login')
  }

  const currentTheme = THEME_LABELS[theme]

  return (
    <header className="header">
      {/* Logo & Title */}
      <span className="header__logo">{currentTheme.icon}</span>
      <span className="header__title">
        <span className="header__title-main">百宝箱</span>
        <span className="header__title-sub">TREASURE BOX</span>
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

      {/* Admin entry (header-only, admin users) */}
      {user?.role === 'admin' && (
        <button
          className="header__admin-btn"
          onClick={() => {
            void navigate('/admin')
          }}
          title="后台管理"
        >
          <span className="header__admin-icon">▣</span>
          <span>后台管理</span>
        </button>
      )}

      {/* User menu */}
      {user ? (
        <div className="header__user" ref={userMenuRef}>
          <button className="header__user-btn" onClick={() => setUserMenuOpen((v) => !v)}>
            <span className="header__user-avatar">{user.username[0]?.toUpperCase()}</span>
            <span className="header__username">{user.username}</span>
            {user.role === 'admin' && <span className="header__admin-tag">ADMIN</span>}
            <span className="header__caret">▾</span>
          </button>
          <AnimatePresence>
            {userMenuOpen && (
              <motion.div
                className="header__dropdown"
                initial={{ opacity: 0, scale: 0.95, y: -4 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: -4 }}
                transition={{ duration: 0.15, ease: 'easeOut' }}
              >
                <div className="header__dropdown-header">
                  <span className="header__dropdown-avatar">{user.username[0]?.toUpperCase()}</span>
                  <div>
                    <div className="header__dropdown-username">{user.username}</div>
                    <div className="header__dropdown-role">
                      {user.role === 'admin' ? '管理员' : '普通用户'}
                    </div>
                  </div>
                </div>
                <div className="header__dropdown-divider" />
                <button
                  className="header__dropdown-item"
                  onClick={() => {
                    setUserMenuOpen(false)
                    void navigate('/profile')
                  }}
                >
                  <span>◎</span> 个人中心
                </button>
                <div className="header__dropdown-divider" />
                <button
                  className="header__dropdown-item header__dropdown-item--danger"
                  onClick={() => {
                    void handleLogout()
                  }}
                >
                  <span>⏻</span> 退出登录
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      ) : (
        <button
          className="header__login-btn"
          onClick={() => {
            void navigate('/login')
          }}
        >
          <span>▶</span> 登录
        </button>
      )}
    </header>
  )
}
