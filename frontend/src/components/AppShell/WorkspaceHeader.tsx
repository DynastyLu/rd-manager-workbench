import { Badge, Button, Dropdown, Popover } from '@douyinfe/semi-ui'
import {
  IconBellStroked,
  IconChevronDown,
  IconHistory,
  IconPlus,
  IconSearch,
  IconSetting,
} from '@douyinfe/semi-icons'
import { Link, useNavigate } from 'react-router-dom'
import type { RouteDefinition } from '@/router/routes'
import { ROUTES } from '@/constants/routes'

interface WorkspaceHeaderProps {
  route?: RouteDefinition
}

function HeaderPopoverContent({ title, description }: { title: string; description: string }) {
  return (
    <div className="workspace-header__popover">
      <strong>{title}</strong>
      <span>{description}</span>
    </div>
  )
}

export function WorkspaceHeader({ route }: WorkspaceHeaderProps) {
  const navigate = useNavigate()
  const routeTitle = route?.title ?? '工作台'

  return (
    <header className="workspace-header">
      <div className="workspace-header__context">
        <span className="workspace-header__identity">研发工作台</span>
        <span className="workspace-header__divider" aria-hidden="true" />
        <div className="workspace-header__route" aria-label={`当前位置：工作空间，${routeTitle}`}>
          <strong>{routeTitle}</strong>
          <span>本地单人空间</span>
        </div>
      </div>

      <div className="workspace-header__search-wrap">
        <button
          type="button"
          className="workspace-header__search"
          aria-label="搜索工作台"
          onClick={() => {
            void navigate('/search')
          }}
        >
          <IconSearch size="small" />
          <span>搜索项目、任务、会议和文档</span>
          <kbd>⌘ K</kbd>
        </button>
      </div>

      <div className="workspace-header__actions">
        <Dropdown
          trigger="click"
          position="bottomRight"
          render={
            <Dropdown.Menu className="workspace-header__create-menu">
              <Dropdown.Item>
                <Link to={ROUTES.PROJECT_SPACES}>新建项目</Link>
              </Dropdown.Item>
              <Dropdown.Item>
                <Link to={ROUTES.MY_WORK}>新建任务</Link>
              </Dropdown.Item>
              <Dropdown.Item>
                <Link to="/calendar">新建日程或会议</Link>
              </Dropdown.Item>
              <Dropdown.Item>
                <Link to="/docs">新建文档</Link>
              </Dropdown.Item>
            </Dropdown.Menu>
          }
        >
          <Button
            theme="solid"
            type="primary"
            icon={<IconPlus />}
            iconPosition="left"
            aria-label="全局新建"
          >
            新建 <IconChevronDown size="small" />
          </Button>
        </Dropdown>

        <Popover
          trigger="click"
          position="bottomRight"
          content={
            <HeaderPopoverContent title="最近访问" description="访问过的项目和文档会显示在这里。" />
          }
        >
          <Button
            theme="borderless"
            icon={<IconHistory />}
            aria-label="最近访问"
            className="workspace-header__icon-button"
          />
        </Popover>

        <Popover
          trigger="click"
          position="bottomRight"
          content={
            <HeaderPopoverContent title="通知中心" description="当前没有未读通知。" />
          }
        >
          <Badge count={0} type="danger">
            <Button
              theme="borderless"
              icon={<IconBellStroked />}
              aria-label="通知中心"
              className="workspace-header__icon-button"
            />
          </Badge>
        </Popover>

        <Link className="workspace-header__settings" to={ROUTES.SETTINGS} aria-label="设置">
          <IconSetting />
        </Link>
      </div>
    </header>
  )
}
