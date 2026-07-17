import ArchiveIcon from 'lucide-react/dist/esm/icons/archive.js'
import CheckIcon from 'lucide-react/dist/esm/icons/check.js'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

interface ModulePlaceholderPageProps {
  archiveCode: string
  title: string
  description: string
  scopes: string[]
}

export function ModulePlaceholderPage({
  archiveCode,
  title,
  description,
  scopes,
}: ModulePlaceholderPageProps) {
  return (
    <div className="page-stack">
      <section className="page-intro page-intro--compact">
        <div>
          <p className="archive-kicker">{archiveCode}</p>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
        <Badge variant="outline">业务模块待开发</Badge>
      </section>

      <Card className="placeholder-card">
        <CardHeader>
          <div className="module-icon" aria-hidden="true">
            <ArchiveIcon />
          </div>
          <CardTitle>已纳入产品范围</CardTitle>
          <CardDescription>
            当前版本先验证桌面、后端和数据库骨架；这里不会展示虚构业务数据。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="scope-list">
            {scopes.map((scope) => (
              <li key={scope}>
                <CheckIcon aria-hidden="true" />
                <span>{scope}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  )
}
