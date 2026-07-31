import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { Avatar, Button, Dropdown, Modal, Popover } from '@douyinfe/semi-ui'
import {
  IconChevronDown,
  IconExit,
  IconHistory,
  IconKey,
  IconPlus,
  IconSearch,
  IconSetting,
} from '@douyinfe/semi-icons'
import { Link, useNavigate } from 'react-router-dom'
import type { RouteDefinition } from '@/router/routes'
import { ROUTES } from '@/constants/routes'
import { logout } from '@/modules/auth/api'
import { useAuthStore } from '@/modules/auth/store'
import type { CurrentUser } from '@/modules/auth/types'
import { ProjectForm } from '@/modules/workbench/components/ProjectForm'
import { TaskForm } from '@/modules/workbench/components/TaskForm'
import { NotificationCenter } from './NotificationCenter'

interface WorkspaceHeaderProps {
  route?: RouteDefinition
}

type CreateTarget = 'project' | 'task' | null

const ADMIN_PERMISSION_CODES = new Set([
  'user.read',
  'user.create',
  'user.update',
  'user.disable',
  'role.read',
  'role.create',
  'role.update',
  'role.assign',
  'audit.read',
  'system.configure',
])

function canAccessAdmin(user: CurrentUser | undefined): boolean {
  if (!user) return false
  if (user.roleCodes.includes('SUPER_ADMIN')) return true
  return user.permissions.some((grant) => ADMIN_PERMISSION_CODES.has(grant.code))
}

function initials(displayName: string): string {
  return displayName
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((segment) => segment[0])
    .join('')
    .toUpperCase()
}

function roleSummary(user: CurrentUser): string {
  if (user.roleCodes.includes('SUPER_ADMIN')) return '超级管理员'
  if (user.roleTitle) return user.roleTitle
  if (user.department) return user.department
  return '工作空间成员'
}

function getRecentProjectIds(): string[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem('rd-workbench:recent-projects') ?? '[]')
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === 'string')
      : []
  } catch {
    return []
  }
}

function HeaderPopoverContent({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="workspace-header__popover">
      <strong>{title}</strong>
      {children}
    </div>
  )
}

function AccountMenu() {
  const navigate = useNavigate()
  const user = useAuthStore((state) => state.user)
  const [loggingOut, setLoggingOut] = useState(false)

  if (!user) return null

  const handleLogout = async () => {
    setLoggingOut(true)
    try {
      await logout()
    } catch {
      // Ignore network errors; clearing the local session still signs the user out.
    } finally {
      useAuthStore.getState().clearSession()
      void navigate(ROUTES.LOGIN, { replace: true })
      setLoggingOut(false)
    }
  }

  return (
    <Dropdown
      trigger="click"
      position="bottomRight"
      render={
        <Dropdown.Menu>
          <Dropdown.Item icon={<IconKey />}>
            <Link to={ROUTES.PERSONAL_SECURITY} className="workspace-header__dropdown-link">
              个人安全
            </Link>
          </Dropdown.Item>
          {canAccessAdmin(user) ? (
            <Dropdown.Item icon={<IconSetting />}>
              <Link to={ROUTES.ADMIN_USERS} className="workspace-header__dropdown-link">
                系统管理
              </Link>
            </Dropdown.Item>
          ) : null}
          <Dropdown.Divider />
          <Dropdown.Item icon={<IconExit />} type="danger" disabled={loggingOut}>
            <button
              type="button"
              className="workspace-header__logout-button"
              disabled={loggingOut}
              onClick={() => void handleLogout()}
            >
              退出登录
            </button>
          </Dropdown.Item>
        </Dropdown.Menu>
      }
    >
      <Button
        theme="borderless"
        className="workspace-header__account"
        aria-label={`账号菜单：${user.displayName}`}
      >
        <Avatar size="extra-small" alt={user.displayName}>
          {initials(user.displayName)}
        </Avatar>
        <span className="workspace-header__account-name">{user.displayName}</span>
        <span className="workspace-header__account-role">{roleSummary(user)}</span>
        <IconChevronDown size="small" />
      </Button>
    </Dropdown>
  )
}

export function WorkspaceHeader({ route }: WorkspaceHeaderProps) {
  const navigate = useNavigate()
  const searchEntryRef = useRef<HTMLButtonElement>(null)
  const [createTarget, setCreateTarget] = useState<CreateTarget>(null)
  const [createMenuOpen, setCreateMenuOpen] = useState(false)
  const [recentProjectId, setRecentProjectId] = useState(() => getRecentProjectIds()[0])
  const routeTitle = route?.title ?? '工作台'

  useEffect(() => {
    const refreshRecentProjects = () => setRecentProjectId(getRecentProjectIds()[0])
    window.addEventListener('rd-workbench:recent-projects-changed', refreshRecentProjects)
    return () => {
      window.removeEventListener('rd-workbench:recent-projects-changed', refreshRecentProjects)
    }
  }, [])

  const openSearchWorkspace = useCallback(() => {
    void navigate(ROUTES.SEARCH)
    window.requestAnimationFrame(() => {
      window.dispatchEvent(new Event('rd-workbench:focus-search'))
    })
  }, [navigate])

  useEffect(() => {
    function openSearch(event: globalThis.KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        searchEntryRef.current?.focus()
        openSearchWorkspace()
      }
    }
    window.addEventListener('keydown', openSearch)
    return () => window.removeEventListener('keydown', openSearch)
  }, [openSearchWorkspace])

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
          <button
            ref={searchEntryRef}
            type="button"
            className="workspace-header__search-input flex min-h-9 w-full items-center gap-2 rounded-lg border border-[var(--workspace-border)] bg-[#f5f6f7] px-3 text-left text-sm text-[var(--workspace-text-muted)] hover:border-[var(--workspace-brand)] hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--workspace-brand)]"
            aria-label="全局搜索"
            onClick={openSearchWorkspace}
          >
            <IconSearch aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate">搜索项目、任务、文档…</span>
            <kbd className="rounded border border-[var(--workspace-border)] bg-white px-1.5 py-0.5 text-xs">
              ⌘ K
            </kbd>
          </button>
        </div>

        <div className="workspace-header__actions">
          <Dropdown
            trigger="click"
            position="bottomRight"
            visible={createMenuOpen}
            onVisibleChange={setCreateMenuOpen}
            render={
              <Dropdown.Menu className="workspace-header__create-menu">
                <Dropdown.Item
                  onClick={() => { setCreateMenuOpen(false); setCreateTarget('project') }}
                  onKeyDown={(event) => openFromKeyboard(event, 'project')}
                >
                  新建项目
                </Dropdown.Item>
                <Dropdown.Item
                  onClick={() => { setCreateMenuOpen(false); setCreateTarget('task') }}
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

          <NotificationCenter />

          <Link className="workspace-header__settings" to={ROUTES.SETTINGS} aria-label="设置">
            <IconSetting />
          </Link>

          <AccountMenu />
        </div>
      </header>

      <Modal
        title={createTarget === 'project' ? '新建项目' : '新建任务'}
        visible={createTarget !== null}
        onCancel={() => setCreateTarget(null)}
        footer={(
          <div className="workspace-modal-footer">
            <Button onClick={() => setCreateTarget(null)}>取消</Button>
            <Button
              theme="solid"
              type="primary"
              htmlType="submit"
              form={createTarget === 'project' ? 'global-project-form' : 'global-task-form'}
            >
              {createTarget === 'project' ? '保存项目' : '保存任务'}
            </Button>
          </div>
        )}
        width={520}
        closeOnEsc
      >
        {createTarget === 'project' ? (
          <ProjectForm formId="global-project-form" showActions={false} onSuccess={() => setCreateTarget(null)} />
        ) : null}
        {createTarget === 'task' ? <TaskForm formId="global-task-form" showActions={false} onSuccess={() => setCreateTarget(null)} /> : null}
      </Modal>
    </>
  )
}
