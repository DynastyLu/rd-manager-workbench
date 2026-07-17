import React from 'react'
import { useNavigate } from 'react-router-dom'

export default function Admin(): React.JSX.Element {
  const navigate = useNavigate()
  return (
    <div className="app-page app-page--admin">
      <div className="app-page__inner">
        <div className="app-page__hero">
          <div>
            <p className="app-page__eyebrow">Manager Area</p>
            <h1 className="app-page__title">后台管理</h1>
            <p className="app-page__subtitle">查看管理入口，维护账号和权限。</p>
          </div>
        </div>

        <button
          className="tool-tile"
          style={{ maxWidth: 260 }}
          onClick={() => {
            void navigate('/admin/users')
          }}
        >
          <span className="tool-tile__number">BENCH 01</span>
          <span className="tool-tile__row">
            <span className="tool-tile__icon">◈</span>
            <span className="tool-tile__title">用户管理</span>
            <span className="tool-tile__arrow">›</span>
          </span>
        </button>
      </div>
    </div>
  )
}
