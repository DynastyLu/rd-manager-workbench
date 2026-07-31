import { request } from '@/lib/http'

export type ActivityActorKind = 'HUMAN' | 'AUTOMATION' | 'SYSTEM'

export interface ActivityRecord {
  id: string
  actorKind: ActivityActorKind
  actorId: string | null
  actorName: string | null
  objectType: string
  objectId: string
  projectId: string | null
  employeeId: string | null
  action: string
  summary: string
  sourcePath: string
  metadata: Record<string, unknown> | null
  occurredAt: string
}

export interface ActivityFilters {
  projectId?: string
  employeeId?: string
  objectType?: string
  actorKind?: ActivityActorKind
  from?: string
  to?: string
  cursor?: string
  limit?: number
}

export interface ActivityPage {
  data: ActivityRecord[]
  nextCursor: string | null
}

function queryString(filters: ActivityFilters): string {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== '') query.set(key, String(value))
  }
  const rendered = query.toString()
  return rendered ? `?${rendered}` : ''
}

export function listActivities(filters: ActivityFilters): Promise<ActivityPage> {
  return request(`/activities${queryString(filters)}`)
}
