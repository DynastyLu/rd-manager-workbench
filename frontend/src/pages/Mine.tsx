import React from 'react'

export default function Mine(): React.JSX.Element {
  return (
    <div className="app-page app-page--mine">
      <div className="app-page__inner app-page__inner--narrow">
        <div className="app-page__hero">
          <div>
            <p className="app-page__eyebrow">My Locker</p>
            <h1 className="app-page__title">我的</h1>
            <p className="app-page__subtitle">你的工具使用概览会集中在这里。</p>
          </div>
        </div>
        <div className="stadium-placeholder">
          <div>
            <span className="stadium-placeholder__icon">🥇</span>
            <p className="stadium-placeholder__title">暂无个人数据</p>
            <p className="stadium-placeholder__text">开始使用工具后，这里会展示你的记录。</p>
          </div>
        </div>
      </div>
    </div>
  )
}
