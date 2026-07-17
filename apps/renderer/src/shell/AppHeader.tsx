import HardDriveIcon from 'lucide-react/dist/esm/icons/hard-drive.js'
import { Link, useLocation } from 'react-router-dom'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

const ROUTE_TITLES: Record<string, string> = {
  '/': '总览',
  '/projects': '项目与任务',
  '/varieties': '品种申报',
  '/risks': '风险与决策',
  '/partners': '合作方与会议',
  '/intelligence': '行业情报',
  '/reports': '报表与提醒',
  '/settings': '设置',
}

export function AppHeader() {
  const { pathname } = useLocation()
  const title = ROUTE_TITLES[pathname] ?? '未收录页面'

  return (
    <header className="app-header">
      <div className="header-context">
        <span className="header-index">RD / DESK</span>
        <span aria-hidden="true">·</span>
        <strong>{title}</strong>
      </div>
      <div className="header-actions">
        <Badge variant="outline">本地单机</Badge>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="outline" size="icon-sm" asChild>
              <Link to="/settings" aria-label="打开系统诊断">
                <HardDriveIcon data-icon="inline-start" />
              </Link>
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">打开系统诊断</TooltipContent>
        </Tooltip>
      </div>
    </header>
  )
}
