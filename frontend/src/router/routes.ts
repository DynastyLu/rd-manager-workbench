import { createElement, lazy, type ComponentType } from 'react'
import { Navigate } from 'react-router-dom'
import { ROUTES } from '@/constants/routes'

export interface AppRoute {
  path: string
  title: string
  icon: string
  component: ComponentType
}

export interface RouteCategory {
  key: string
  title: string
  icon: string
  routes: AppRoute[]
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

function RedirectToWorkbench() {
  return createElement(Navigate, { to: ROUTES.HOME, replace: true })
}

export const routeCategories: RouteCategory[] = [
  {
    key: 'workbench',
    title: '工作台',
    icon: '◈',
    routes: [
      { path: ROUTES.HOME, title: '首页', icon: '⌂', component: WorkbenchHome },
      { path: ROUTES.PROJECTS, title: '项目', icon: '▦', component: ProjectsPage },
      { path: ROUTES.TASKS, title: '任务', icon: '✓', component: TasksPage },
      { path: ROUTES.APPLICATION_CASES, title: '申报认定', icon: '▤', component: ApplicationCasesPage },
      { path: ROUTES.RISKS, title: '风险', icon: '!', component: RisksPage },
      { path: ROUTES.ISSUES, title: '问题', icon: '?', component: IssuesPage },
      { path: ROUTES.DECISIONS, title: '决策', icon: '◆', component: DecisionsPage },
      { path: ROUTES.PARTNERS, title: '合作方', icon: '♧', component: PartnersPage },
      { path: ROUTES.MEETINGS, title: '会议', icon: '◷', component: MeetingsPage },
      { path: ROUTES.SETTINGS, title: '设置', icon: '⚙', component: WorkbenchSettings },
    ],
  },
]

const routes: AppRoute[] = [
  ...routeCategories.flatMap((category) => category.routes),
  { path: '*', title: '首页', icon: '⌂', component: RedirectToWorkbench },
]

export default routes
