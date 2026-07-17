import { lazy, type ComponentType } from 'react'
import { ROUTES } from '@/constants/routes'

export interface AppRoute {
  path: string
  title: string
  icon: string
  component: ComponentType
  headerOnly?: boolean
  requireAdmin?: boolean
}

export interface RouteCategory {
  key: string
  title: string
  icon: string
  routes: AppRoute[]
}

// Lazy-loaded page components
const Home = lazy(() => import('@/pages/Home'))
const OcrTool = lazy(() => import('@/pages/OcrTool'))
const HairstyleTool = lazy(() => import('@/pages/HairstyleTool'))
const CopyrightRiskTool = lazy(() => import('@/pages/CopyrightRiskTool'))
const History = lazy(() => import('@/pages/History'))
const Mine = lazy(() => import('@/pages/Mine'))
const Settings = lazy(() => import('@/pages/Settings'))
const Profile = lazy(() => import('@/pages/Profile'))
const Admin = lazy(() => import('@/pages/Admin'))
const AdminUsers = lazy(() => import('@/pages/AdminUsers'))

export const routeCategories: RouteCategory[] = [
  {
    key: 'tools',
    title: '工具箱',
    icon: '⚽',
    routes: [
      { path: ROUTES.HOME, title: '首页', icon: '⌂', component: Home },
      { path: ROUTES.OCR, title: '识别工具', icon: '▤', component: OcrTool },
      { path: ROUTES.HAIRSTYLE, title: '发型变换', icon: '✂', component: HairstyleTool },
      { path: ROUTES.COPYRIGHT_RISK, title: '版权风险', icon: '⚠', component: CopyrightRiskTool },
      { path: ROUTES.HISTORY, title: '历史记录', icon: '🏆', component: History },
    ],
  },
  {
    key: 'personal',
    title: '个人空间',
    icon: '★',
    routes: [
      { path: ROUTES.MINE, title: '我的', icon: '★', component: Mine },
      { path: ROUTES.SETTINGS, title: '设置', icon: '✦', component: Settings },
    ],
  },
]

export const headerRoutes: AppRoute[] = [
  { path: ROUTES.PROFILE, title: '个人中心', icon: '◎', component: Profile, headerOnly: true },
  {
    path: ROUTES.ADMIN,
    title: '后台管理',
    icon: '▣',
    component: Admin,
    headerOnly: true,
    requireAdmin: true,
  },
  {
    path: ROUTES.ADMIN_USERS,
    title: '用户管理',
    icon: '◈',
    component: AdminUsers,
    headerOnly: true,
    requireAdmin: true,
  },
]

const routes: AppRoute[] = [...routeCategories.flatMap((c) => c.routes), ...headerRoutes]

export default routes
