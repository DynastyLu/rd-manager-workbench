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
      { path: ROUTES.SETTINGS, title: '设置', icon: '⚙', component: WorkbenchSettings },
    ],
  },
]

const routes: AppRoute[] = [
  ...routeCategories.flatMap((category) => category.routes),
  { path: '*', title: '首页', icon: '⌂', component: RedirectToWorkbench },
]

export default routes
