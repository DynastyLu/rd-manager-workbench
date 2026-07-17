import React from 'react'

export default function Profile(): React.JSX.Element {
  return (
    <div className="app-page app-page--profile">
      <div className="app-page__inner app-page__inner--narrow">
        <div className="app-page__hero">
          <div>
            <p className="app-page__eyebrow">Player Profile</p>
            <h1 className="app-page__title">个人中心</h1>
            <p className="app-page__subtitle">查看你的账号资料和登录状态。</p>
          </div>
        </div>
        <div className="stadium-placeholder">
          <div>
            <span className="stadium-placeholder__icon">⚽</span>
            <p className="stadium-placeholder__title">个人资料待完善</p>
            <p className="stadium-placeholder__text">账号信息会在这里集中展示。</p>
          </div>
        </div>
      </div>
    </div>
  )
}
