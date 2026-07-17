import { lazy, type ComponentType } from 'react'
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
const WorkbenchSettings = lazy(() => import('@/pages/WorkbenchSettings'))

export const routeCategories: RouteCategory[] = [
  {
    key: 'workbench',
    title: '工作台',
    icon: '◈',
    routes: [
      { path: ROUTES.HOME, title: '首页', icon: '⌂', component: WorkbenchHome },
      { path: ROUTES.SETTINGS, title: '设置', icon: '⚙', component: WorkbenchSettings },
    ],
  },
]

const routes: AppRoute[] = routeCategories.flatMap((category) => category.routes)

export default routes
