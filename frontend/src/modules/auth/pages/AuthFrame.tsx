import type { ReactNode } from 'react'
import { IconLock, IconUserGroup } from '@douyinfe/semi-icons'

import './LoginPage.less'

interface AuthFrameProps {
  eyebrow: string
  title: string
  description: string
  children: ReactNode
}

export function AuthFrame({
  children,
  description,
  eyebrow,
  title,
}: AuthFrameProps) {
  return (
    <main className="auth-page">
      <section className="auth-page__story" aria-label="研发工作台介绍">
        <div className="auth-page__brand">
          <span className="auth-page__mark">RD</span>
          <span>研发工作空间</span>
        </div>
        <div className="auth-page__story-content">
          <span className="auth-page__eyebrow">LOCAL ENTERPRISE WORKSPACE</span>
          <h1>把项目、知识和团队进展放在同一个工作空间。</h1>
          <p>本地数据优先，权限清晰可控，让每一次计划、协作和复盘都有迹可循。</p>
          <div className="auth-page__trust">
            <span><IconLock /> 本地安全存储</span>
            <span><IconUserGroup /> 企业级角色权限</span>
          </div>
        </div>
      </section>
      <section className="auth-page__panel">
        <div className="auth-card">
          <span className="auth-card__eyebrow">{eyebrow}</span>
          <h2>{title}</h2>
          <p className="auth-card__description">{description}</p>
          {children}
        </div>
        <p className="auth-page__footer">研发工作空间 · 本地单人版</p>
      </section>
    </main>
  )
}

