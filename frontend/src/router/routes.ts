import { createElement, lazy, type ComponentType } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import { PlannedModuleState } from '@/components/AppShell/PlannedModuleState'
import { ROUTES } from '@/constants/routes'
import AutomationDataPage from '@/pages/AutomationDataPage'
import KnowledgeHomePage from '@/pages/KnowledgeHomePage'
import LibraryHomePage from '@/pages/LibraryHomePage'
import MeetingsAndMaterialsPage from '@/pages/MeetingsAndMaterialsPage'

export type ModuleAvailability = 'AVAILABLE' | 'PLANNED'

export type NavigationIcon = 'home' | 'tasks' | 'projects' | 'docs' | 'base' | 'calendar' | 'search'

export interface NavigationItem {
  key: string
  title: string
  icon: NavigationIcon
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
export type AppRoute = RouteDefinition

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
const WorkbenchSettings = lazy(() => import('@/pages/WorkbenchSettings'))

function PlannedGovernancePage() {
  return createElement(PlannedModuleState, {
    title: '业务库',
    description: '该业务库模块尚未开放。',
    nextStep: '下一步：确认该模块的本地记录范围。',
  })
}

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
  { key: 'home', title: '工作台', icon: 'home', path: ROUTES.HOME, availability: 'AVAILABLE' },
  {
    key: 'my-work',
    title: '我的工作',
    icon: 'tasks',
    path: ROUTES.MY_WORK,
    availability: 'AVAILABLE',
  },
  {
    key: 'projects',
    title: '项目',
    icon: 'projects',
    path: ROUTES.PROJECT_SPACES,
    availability: 'AVAILABLE',
  },
  {
    key: 'docs',
    title: '文档与知识库',
    icon: 'docs',
    path: ROUTES.DOCS,
    availability: 'AVAILABLE',
  },
  {
    key: 'base',
    title: '多维表格',
    icon: 'base',
    path: ROUTES.BASE,
    availability: 'AVAILABLE',
  },
  {
    key: 'calendar',
    title: '日历',
    icon: 'calendar',
    path: ROUTES.CALENDAR,
    availability: 'AVAILABLE',
  },
  {
    key: 'search',
    title: '搜索',
    icon: 'search',
    path: ROUTES.SEARCH,
    availability: 'AVAILABLE',
  },
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
    title: '项目',
    icon: '▦',
    component: ProjectsPage,
    navigationKey: 'projects',
    availability: 'AVAILABLE',
  },
  {
    path: '/spaces/projects/:projectId/:section?',
    title: '项目',
    icon: '▦',
    component: ProjectsPage,
    navigationKey: 'projects',
    availability: 'AVAILABLE',
  },
  {
    path: ROUTES.DOCS,
    title: '文档与知识库',
    icon: 'docs',
    component: KnowledgeHomePage,
    navigationKey: 'docs',
    availability: 'AVAILABLE',
  },
  {
    path: ROUTES.BASE,
    title: '多维表格',
    icon: 'base',
    component: LibraryHomePage,
    navigationKey: 'base',
    availability: 'AVAILABLE',
  },
  {
    path: ROUTES.CALENDAR,
    title: '日历',
    icon: 'calendar',
    component: MeetingsAndMaterialsPage,
    navigationKey: 'calendar',
    availability: 'AVAILABLE',
  },
  {
    path: ROUTES.SEARCH,
    title: '搜索',
    icon: 'search',
    component: AutomationDataPage,
    navigationKey: 'search',
    availability: 'AVAILABLE',
  },
  {
    path: ROUTES.LIBRARY,
    title: '业务库',
    icon: '▤',
    component: LibraryHomePage,
    availability: 'AVAILABLE',
  },
  {
    path: ROUTES.APPLICATIONS,
    title: '申报认定',
    icon: '▤',
    component: ApplicationCasesPage,
    availability: 'AVAILABLE',
  },
  {
    path: '/library/governance/:kind',
    title: '业务库',
    icon: '▤',
    component: GovernancePage,
    availability: 'AVAILABLE',
  },
  {
    path: ROUTES.MEETINGS,
    title: '会议与资料',
    icon: '◷',
    component: MeetingsAndMaterialsPage,
    availability: 'AVAILABLE',
  },
  {
    path: ROUTES.KNOWLEDGE,
    title: '知识库',
    icon: '◫',
    component: KnowledgeHomePage,
    availability: 'PLANNED',
  },
  {
    path: ROUTES.AUTOMATION_DATA,
    title: '自动化与数据',
    icon: '◌',
    component: AutomationDataPage,
    availability: 'PLANNED',
  },
  {
    path: ROUTES.SETTINGS,
    title: '设置',
    icon: '⚙',
    component: WorkbenchSettings,
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
