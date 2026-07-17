import React from 'react'

export default function History(): React.JSX.Element {
  return (
    <div className="app-page app-page--history">
      <div className="app-page__inner app-page__inner--narrow">
        <div className="app-page__hero">
          <div>
            <p className="app-page__eyebrow">Match Archive</p>
            <h1 className="app-page__title">历史记录</h1>
            <p className="app-page__subtitle">查看最近完成的识别和生成任务。</p>
          </div>
        </div>
        <div className="stadium-placeholder">
          <div>
            <span className="stadium-placeholder__icon">🏆</span>
            <p className="stadium-placeholder__title">暂时没有历史记录</p>
            <p className="stadium-placeholder__text">完成任务后会在这里留下记录。</p>
          </div>
        </div>
      </div>
    </div>
  )
}
