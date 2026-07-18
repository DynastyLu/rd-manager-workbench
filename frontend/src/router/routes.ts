import { createElement, lazy, type ComponentType } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import { ROUTES } from '@/constants/routes'

export type ModuleAvailability = 'AVAILABLE' | 'PLANNED'

export interface NavigationItem {
  key: string
  title: string
  icon: string
  path: string
  availability: ModuleAvailability
}

export interface RouteDefinition {
  path: string
  title: string
  icon: string
  component: ComponentType
  navigationKey?: NavigationItem['key']
  availability: ModuleAvailability
  redirectTo?: string
}

/** @deprecated Use RouteDefinition for new route consumers. */
export interface AppRoute extends RouteDefinition {}

/** @deprecated Kept only while the legacy sidebar is migrated to primaryNavigation. */
export interface RouteCategory {
  key: string
  title: string
  icon: string
  routes: RouteDefinition[]
}

const WorkbenchHome = lazy(() => import('@/pages/WorkbenchHome'))
const ProjectsPage = lazy(() => import('@/pages/ProjectsPage'))
const TasksPage = lazy(() => import('@/pages/TasksPage'))
const ApplicationCasesPage = lazy(() => import('@/pages/ApplicationCasesPage'))
const RisksPage = lazy(() => import('@/pages/RisksPage'))
const IssuesPage = lazy(() => import('@/pages/IssuesPage'))
const DecisionsPage = lazy(() => import('@/pages/DecisionsPage'))
const PartnersPage = lazy(() => import('@/pages/PartnersPage'))
const MeetingsPage = lazy(() => import('@/pages/MeetingsPage'))
const WorkbenchSettings = lazy(() => import('@/pages/WorkbenchSettings'))

function createPlannedModuleState(title: string, description: string): ComponentType {
  return function PlannedModuleState() {
    return createElement(
      'main',
      { className: 'app-page' },
      createElement(
        'div',
        { className: 'app-page__inner' },
        createElement(
          'div',
          { className: 'app-page__hero' },
          createElement('div', undefined, [
            createElement('h1', { className: 'app-page__title', key: 'title' }, title),
            createElement(
              'p',
              { className: 'app-page__subtitle', key: 'description' },
              description
            ),
          ])
        )
      )
    )
  }
}

const LibraryPage = createPlannedModuleState('业务库', '业务库总览正在整理中。')
const KnowledgePage = createPlannedModuleState(
  '知识库',
  '知识库正在规划中，当前不会读取或请求知识库数据。'
)
const AutomationDataPage = createPlannedModuleState(
  '自动化与数据',
  '自动化与数据能力正在规划中，当前不会发起未实现的请求。'
)
const PlannedGovernancePage = createPlannedModuleState(
  '业务库',
  '该业务库模块正在规划中，当前不会发起未实现的请求。'
)

const governancePages: Record<string, ComponentType> = {
  risks: RisksPage,
  issues: IssuesPage,
  decisions: DecisionsPage,
  partners: PartnersPage,
}

function GovernancePage() {
  const { kind } = useParams<{ kind: string }>()
  const Page = kind ? governancePages[kind] : undefined

  return createElement(Page ?? PlannedGovernancePage)
}

function createRedirect(redirectTo: string): ComponentType {
  return function LegacyRedirect() {
    return createElement(Navigate, { to: redirectTo, replace: true })
  }
}

function RedirectToWorkbench() {
  return createElement(Navigate, { to: ROUTES.HOME, replace: true })
}

export const primaryNavigation: NavigationItem[] = [
  { key: 'home', title: '工作台', icon: '⌂', path: ROUTES.HOME, availability: 'AVAILABLE' },
  { key: 'my-work', title: '我的工作', icon: '✓', path: ROUTES.MY_WORK, availability: 'AVAILABLE' },
  {
    key: 'project-spaces',
    title: '项目空间',
    icon: '▦',
    path: ROUTES.PROJECT_SPACES,
    availability: 'AVAILABLE',
  },
  { key: 'library', title: '业务库', icon: '▤', path: ROUTES.LIBRARY, availability: 'AVAILABLE' },
  {
    key: 'meetings',
    title: '会议与资料',
    icon: '◷',
    path: ROUTES.MEETINGS,
    availability: 'AVAILABLE',
  },
  { key: 'knowledge', title: '知识库', icon: '◫', path: ROUTES.KNOWLEDGE, availability: 'PLANNED' },
  {
    key: 'automation-data',
    title: '自动化与数据',
    icon: '◌',
    path: ROUTES.AUTOMATION_DATA,
    availability: 'PLANNED',
  },
  { key: 'settings', title: '设置', icon: '⚙', path: ROUTES.SETTINGS, availability: 'AVAILABLE' },
]

const canonicalRoutes: RouteDefinition[] = [
  {
    path: ROUTES.HOME,
    title: '工作台',
    icon: '⌂',
    component: WorkbenchHome,
    navigationKey: 'home',
    availability: 'AVAILABLE',
  },
  {
    path: ROUTES.MY_WORK,
    title: '我的工作',
    icon: '✓',
    component: TasksPage,
    navigationKey: 'my-work',
    availability: 'AVAILABLE',
  },
  {
    path: ROUTES.PROJECT_SPACES,
    title: '项目空间',
    icon: '▦',
    component: ProjectsPage,
    navigationKey: 'project-spaces',
    availability: 'AVAILABLE',
  },
  {
    path: '/spaces/projects/:projectId/:section?',
    title: '项目空间',
    icon: '▦',
    component: ProjectsPage,
    navigationKey: 'project-spaces',
    availability: 'AVAILABLE',
  },
  {
    path: ROUTES.LIBRARY,
    title: '业务库',
    icon: '▤',
    component: LibraryPage,
    navigationKey: 'library',
    availability: 'AVAILABLE',
  },
  {
    path: ROUTES.APPLICATIONS,
    title: '申报认定',
    icon: '▤',
    component: ApplicationCasesPage,
    navigationKey: 'library',
    availability: 'AVAILABLE',
  },
  {
    path: '/library/governance/:kind',
    title: '业务库',
    icon: '▤',
    component: GovernancePage,
    navigationKey: 'library',
    availability: 'AVAILABLE',
  },
  {
    path: ROUTES.MEETINGS,
    title: '会议与资料',
    icon: '◷',
    component: MeetingsPage,
    navigationKey: 'meetings',
    availability: 'AVAILABLE',
  },
  {
    path: ROUTES.KNOWLEDGE,
    title: '知识库',
    icon: '◫',
    component: KnowledgePage,
    navigationKey: 'knowledge',
    availability: 'PLANNED',
  },
  {
    path: ROUTES.AUTOMATION_DATA,
    title: '自动化与数据',
    icon: '◌',
    component: AutomationDataPage,
    navigationKey: 'automation-data',
    availability: 'PLANNED',
  },
  {
    path: ROUTES.SETTINGS,
    title: '设置',
    icon: '⚙',
    component: WorkbenchSettings,
    navigationKey: 'settings',
    availability: 'AVAILABLE',
  },
]

const legacyRoutes: RouteDefinition[] = [
  {
    path: ROUTES.PROJECTS,
    title: '项目空间',
    icon: '▦',
    component: createRedirect(ROUTES.PROJECT_SPACES),
    availability: 'AVAILABLE',
    redirectTo: ROUTES.PROJECT_SPACES,
  },
  {
    path: ROUTES.TASKS,
    title: '我的工作',
    icon: '✓',
    component: createRedirect(ROUTES.MY_WORK),
    availability: 'AVAILABLE',
    redirectTo: ROUTES.MY_WORK,
  },
  {
    path: ROUTES.APPLICATION_CASES,
    title: '申报认定',
    icon: '▤',
    component: createRedirect(ROUTES.APPLICATIONS),
    availability: 'AVAILABLE',
    redirectTo: ROUTES.APPLICATIONS,
  },
  {
    path: ROUTES.RISKS,
    title: '风险',
    icon: '!',
    component: createRedirect(ROUTES.governance('risks')),
    availability: 'AVAILABLE',
    redirectTo: ROUTES.governance('risks'),
  },
  {
    path: ROUTES.ISSUES,
    title: '问题',
    icon: '?',
    component: createRedirect(ROUTES.governance('issues')),
    availability: 'AVAILABLE',
    redirectTo: ROUTES.governance('issues'),
  },
  {
    path: ROUTES.DECISIONS,
    title: '决策',
    icon: '◆',
    component: createRedirect(ROUTES.governance('decisions')),
    availability: 'AVAILABLE',
    redirectTo: ROUTES.governance('decisions'),
  },
  {
    path: ROUTES.PARTNERS,
    title: '合作方',
    icon: '♧',
    component: createRedirect(ROUTES.governance('partners')),
    availability: 'AVAILABLE',
    redirectTo: ROUTES.governance('partners'),
  },
]

const fallbackRoute: RouteDefinition = {
  path: '*',
  title: '工作台',
  icon: '⌂',
  component: RedirectToWorkbench,
  availability: 'AVAILABLE',
}

const routes: RouteDefinition[] = [...canonicalRoutes, ...legacyRoutes, fallbackRoute]

export function findRoute(path: string): RouteDefinition | undefined {
  return routes.find((route) => route.path === path)
}

/** @deprecated Kept for the legacy sidebar until it consumes primaryNavigation directly. */
export const routeCategories: RouteCategory[] = [
  {
    key: 'workspace',
    title: '工作空间',
    icon: '◈',
    routes: primaryNavigation
      .map((item) => findRoute(item.path))
      .filter((route): route is RouteDefinition => route !== undefined),
  },
]

export default routes
