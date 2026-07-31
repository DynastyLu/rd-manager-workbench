import { Button } from '@douyinfe/semi-ui'
import { IconShield } from '@douyinfe/semi-icons'
import { Link } from 'react-router-dom'

import { ROUTES } from '@/constants/routes'
import './LoginPage.less'

export default function ForbiddenPage() {
  return (
    <main className="forbidden-page">
      <div className="forbidden-page__icon"><IconShield /></div>
      <span className="auth-card__eyebrow">PERMISSION REQUIRED</span>
      <h1>无权访问此页面</h1>
      <p>当前账号没有访问此功能所需的权限。如工作需要，请联系管理员调整角色。</p>
      <Button theme="solid" type="primary">
        <Link to={ROUTES.HOME}>返回工作台</Link>
      </Button>
    </main>
  )
}

