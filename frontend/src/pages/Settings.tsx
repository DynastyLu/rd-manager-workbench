import React from 'react'

export default function Settings(): React.JSX.Element {
  return (
    <div className="app-page app-page--settings">
      <div className="app-page__inner app-page__inner--narrow">
        <div className="app-page__hero">
          <div>
            <p className="app-page__eyebrow">Tactics Board</p>
            <h1 className="app-page__title">设置</h1>
            <p className="app-page__subtitle">主题和偏好设置会在这里整理。</p>
          </div>
        </div>
        <div className="stadium-placeholder">
          <div>
            <span className="stadium-placeholder__icon">🎯</span>
            <p className="stadium-placeholder__title">设置项待接入</p>
            <p className="stadium-placeholder__text">顶部换肤菜单已经可以切换应用皮肤。</p>
          </div>
        </div>
      </div>
    </div>
  )
}
