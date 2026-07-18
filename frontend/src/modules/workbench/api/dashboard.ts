import { request } from '@/lib/http'

import type { DashboardData } from '@/modules/workbench/types'

export function getDashboard(): Promise<DashboardData> {
  return request<DashboardData>('/dashboard')
}
