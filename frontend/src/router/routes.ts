import { createElement, lazy, type ComponentType } from 'react'
import { Navigate, useLocation, useParams } from 'react-router-dom'
import { PlannedModuleState } from '@/components/AppShell/PlannedModuleState'
import { ROUTES } from '@/constants/routes'
import KnowledgeHomePage from '@/pages/KnowledgeHomePage'
import LibraryHomePage from '@/pages/LibraryHomePage'

export type ModuleAvailability = 'AVAILABLE' | 'PLANNED'

export type NavigationIcon =
  | 'home'
  | 'tasks'
  | 'projects'
  | 'employees'
  | 'docs'
  | 'base'
  | 'calendar'
  | 'search'

export interface NavigationItem {
  key: string
  title: string
  icon: NavigationIcon
  path: string
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
const ProjectWorkspacePage = lazy(() => import('@/pages/ProjectWorkspacePage'))
const TasksPage = lazy(() => import('@/pages/TasksPage'))
const CalendarPage = lazy(() => import('@/pages/CalendarPage'))
const SearchPage = lazy(() => import('@/pages/SearchPage'))
const ApplicationCasesPage = lazy(() => import('@/pages/ApplicationCasesPage'))
const RisksPage = lazy(() => import('@/pages/RisksPage'))
const IssuesPage = lazy(() => import('@/pages/IssuesPage'))
const DecisionsPage = lazy(() => import('@/pages/DecisionsPage'))
const PartnersPage = lazy(() => import('@/pages/PartnersPage'))
const WorkbenchSettings = lazy(() => import('@/pages/WorkbenchSettings'))
const DataGovernancePage = lazy(() => import('@/pages/DataGovernancePage'))
const ExtensionsSettingsPage = lazy(() => import('@/pages/ExtensionsSettingsPage'))
const OperationsPage = lazy(() => import('@/pages/OperationsPage'))
const ReportsPage = lazy(() => import('@/pages/ReportsPage'))
const IntelligencePage = lazy(() => import('@/pages/IntelligencePage'))
const IntelligenceBriefsPage = lazy(() => import('@/pages/IntelligenceBriefsPage'))
const EmployeesPage = lazy(() => import('@/pages/EmployeesPage'))
const EmployeeDetailPage = lazy(() => import('@/pages/EmployeeDetailPage'))

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
    const location = useLocation()
    const [pathname, targetQuery = ''] = redirectTo.split('?')
    const mergedQuery = new URLSearchParams(targetQuery)
    new URLSearchParams(location.search).forEach((value, key) => mergedQuery.set(key, value))
    const query = mergedQuery.toString()
    return createElement(Navigate, {
      to: `${pathname}${query ? `?${query}` : ''}`,
      replace: true,
    })
  }
}

function RedirectToWorkbench() {
  return createElement(Navigate, { to: ROUTES.HOME, replace: true })
}

export const primaryNavigation: NavigationItem[] = [
  { key: 'home', title: '工作台', icon: 'home', path: ROUTES.HOME },
  {
    key: 'my-work',
    title: '我的工作',
    icon: 'tasks',
    path: ROUTES.MY_WORK,
  },
  {
    key: 'projects',
    title: '项目',
    icon: 'projects',
    path: ROUTES.PROJECT_SPACES,
  },
  {
    key: 'employees',
    title: '员工',
    icon: 'employees',
    path: ROUTES.EMPLOYEES,
  },
  {
    key: 'docs',
    title: '文档与知识库',
    icon: 'docs',
    path: ROUTES.DOCS,
  },
  {
    key: 'base',
    title: '多维表格',
    icon: 'base',
    path: ROUTES.BASE,
  },
  {
    key: 'calendar',
    title: '日历',
    icon: 'calendar',
    path: ROUTES.CALENDAR,
  },
  {
    key: 'search',
    title: '搜索',
    icon: 'search',
    path: ROUTES.SEARCH,
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
    component: ProjectWorkspacePage,
    navigationKey: 'projects',
    availability: 'AVAILABLE',
  },
  {
    path: ROUTES.EMPLOYEES,
    title: '员工',
    icon: 'employees',
    component: EmployeesPage,
    navigationKey: 'employees',
    availability: 'AVAILABLE',
  },
  {
    path: '/employees/:employeeId',
    title: '员工进展',
    icon: 'employees',
    component: EmployeeDetailPage,
    navigationKey: 'employees',
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
    component: CalendarPage,
    navigationKey: 'calendar',
    availability: 'AVAILABLE',
  },
  {
    path: ROUTES.SEARCH,
    title: '搜索',
    icon: 'search',
    component: SearchPage,
    navigationKey: 'search',
    availability: 'AVAILABLE',
  },
  {
    path: ROUTES.LIBRARY,
    title: '业务库',
    icon: '▤',
    component: createRedirect(ROUTES.BASE),
    availability: 'AVAILABLE',
    redirectTo: ROUTES.BASE,
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
    path: ROUTES.OPERATIONS,
    title: '非项目研发',
    icon: '▤',
    component: OperationsPage,
    availability: 'AVAILABLE',
  },
  {
    path: ROUTES.REPORTS,
    title: '统计报表',
    icon: '▤',
    component: ReportsPage,
    availability: 'AVAILABLE',
  },
  {
    path: ROUTES.INTELLIGENCE,
    title: '行业情报',
    icon: '▤',
    component: IntelligencePage,
    availability: 'AVAILABLE',
  },
  {
    path: ROUTES.INTELLIGENCE_BRIEFS,
    title: '情报简报',
    icon: '▤',
    component: IntelligenceBriefsPage,
    availability: 'AVAILABLE',
  },
  {
    path: ROUTES.MEETINGS,
    title: '会议与资料',
    icon: '◷',
    component: createRedirect(ROUTES.CALENDAR),
    availability: 'AVAILABLE',
    redirectTo: ROUTES.CALENDAR,
  },
  {
    path: ROUTES.KNOWLEDGE,
    title: '知识库',
    icon: '◫',
    component: createRedirect(ROUTES.DOCS),
    availability: 'PLANNED',
    redirectTo: ROUTES.DOCS,
  },
  {
    path: ROUTES.AUTOMATION_DATA,
    title: '自动化与数据',
    icon: '◌',
    component: createRedirect(ROUTES.SEARCH),
    availability: 'PLANNED',
    redirectTo: ROUTES.SEARCH,
  },
  {
    path: ROUTES.SETTINGS,
    title: '设置',
    icon: '⚙',
    component: WorkbenchSettings,
    availability: 'AVAILABLE',
  },
  {
    path: ROUTES.DATA_GOVERNANCE,
    title: '数据安全',
    icon: '⚙',
    component: DataGovernancePage,
    availability: 'AVAILABLE',
  },
  {
    path: ROUTES.EXTENSIONS_SETTINGS,
    title: '外部能力',
    icon: '⚙',
    component: ExtensionsSettingsPage,
    availability: 'AVAILABLE',
  },
]

const legacyRoutes: RouteDefinition[] = [
  {
    path: ROUTES.RESOURCES_LEGACY,
    title: '资源负荷',
    icon: '▦',
    component: createRedirect(ROUTES.RESOURCES),
    availability: 'AVAILABLE',
    redirectTo: ROUTES.RESOURCES,
  },
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
