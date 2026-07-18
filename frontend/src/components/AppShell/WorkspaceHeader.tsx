import { useEffect, useState, type KeyboardEvent, type ReactNode } from 'react'
import { Button, Dropdown, Input, Modal, Popover } from '@douyinfe/semi-ui'
import {
  IconBellStroked,
  IconChevronDown,
  IconHistory,
  IconPlus,
  IconSearch,
  IconSetting,
} from '@douyinfe/semi-icons'
import { Link } from 'react-router-dom'
import type { RouteDefinition } from '@/router/routes'
import { ROUTES } from '@/constants/routes'
import { ProjectForm } from '@/modules/workbench/components/ProjectForm'
import { TaskForm } from '@/modules/workbench/components/TaskForm'

interface WorkspaceHeaderProps {
  route?: RouteDefinition
}

type CreateTarget = 'project' | 'task' | null

function getRecentProjectIds(): string[] {
  try {
    const value: unknown = JSON.parse(
      localStorage.getItem('rd-workbench:recent-projects') ?? '[]'
    )
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
  } catch {
    return []
  }
}

function HeaderPopoverContent({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  return (
    <div className="workspace-header__popover">
      <strong>{title}</strong>
      {children}
    </div>
  )
}

export function WorkspaceHeader({ route }: WorkspaceHeaderProps) {
  const [createTarget, setCreateTarget] = useState<CreateTarget>(null)
  const [recentProjectId, setRecentProjectId] = useState(() => getRecentProjectIds()[0])
  const routeTitle = route?.title ?? '工作台'

  useEffect(() => {
    const refreshRecentProjects = () => setRecentProjectId(getRecentProjectIds()[0])
    window.addEventListener('rd-workbench:recent-projects-changed', refreshRecentProjects)
    return () => {
      window.removeEventListener('rd-workbench:recent-projects-changed', refreshRecentProjects)
    }
  }, [])

  function openFromKeyboard(event: KeyboardEvent, target: Exclude<CreateTarget, null>) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      setCreateTarget(target)
    }
  }

  return (
    <>
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
          <Input
            className="workspace-header__search-input"
            aria-label="全局搜索（P1 开发中）"
            prefix={<IconSearch />}
            placeholder="全局搜索将在 P1 接入"
            disabled
          />
        </div>

        <div className="workspace-header__actions">
          <Dropdown
            trigger="click"
            position="bottomRight"
            render={
              <Dropdown.Menu className="workspace-header__create-menu">
                <Dropdown.Item
                  onClick={() => setCreateTarget('project')}
                  onKeyDown={(event) => openFromKeyboard(event, 'project')}
                >
                  新建项目
                </Dropdown.Item>
                <Dropdown.Item
                  onClick={() => setCreateTarget('task')}
                  onKeyDown={(event) => openFromKeyboard(event, 'task')}
                >
                  新建任务
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
              <HeaderPopoverContent title="最近访问">
                {recentProjectId ? (
                  <Link
                    className="workspace-header__popover-link"
                    to={ROUTES.projectWorkspace(recentProjectId)}
                    aria-label="打开最近访问的项目"
                  >
                    打开最近访问的项目
                  </Link>
                ) : (
                  <span>还没有最近访问的项目。</span>
                )}
              </HeaderPopoverContent>
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
              <HeaderPopoverContent title="通知中心将在 P0-B 接入">
                <span>提醒调度、页面推送和桌面通知将在下一批完成。</span>
              </HeaderPopoverContent>
            }
          >
            <Button
              theme="borderless"
              icon={<IconBellStroked />}
              aria-label="通知中心"
              className="workspace-header__icon-button"
            />
          </Popover>

          <Link className="workspace-header__settings" to={ROUTES.SETTINGS} aria-label="设置">
            <IconSetting />
          </Link>
        </div>
      </header>

      <Modal
        title={createTarget === 'project' ? '新建项目' : '新建任务'}
        visible={createTarget !== null}
        onCancel={() => setCreateTarget(null)}
        footer={null}
        width={520}
        closeOnEsc
      >
        {createTarget === 'project' ? (
          <ProjectForm onSuccess={() => setCreateTarget(null)} />
        ) : null}
        {createTarget === 'task' ? <TaskForm onSuccess={() => setCreateTarget(null)} /> : null}
      </Modal>
    </>
  )
}
