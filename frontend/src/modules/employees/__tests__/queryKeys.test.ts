import { describe, expect, it } from 'vitest'
import { employeeQueryKeys } from '../queryKeys'

describe('employee query keys', () => {
  it('keeps each employee data scope distinct and preserves filter objects', () => {
    const progress = { periodType: 'WEEK', periodStart: '2026-07-20' } as const
    const workItems = { ...progress, employeeId: 'employee-1', page: 2 }

    expect(employeeQueryKeys.all).toEqual(['employees'])
    expect(employeeQueryKeys.list({ department: '研发部', archiveState: 'ARCHIVED' })).toEqual([
      'employees',
      'list',
      { department: '研发部', archiveState: 'ARCHIVED' },
    ])
    expect(employeeQueryKeys.detail('employee-1')).toEqual(['employees', 'detail', 'employee-1'])
    expect(employeeQueryKeys.teamProgress(progress)).toEqual([
      'employees',
      'team-progress',
      progress,
    ])
    expect(employeeQueryKeys.progress('employee-1', progress)).toEqual([
      'employees',
      'progress',
      'employee-1',
      progress,
    ])
    expect(employeeQueryKeys.projectProgress('project-1', progress)).toEqual([
      'employees',
      'project-progress',
      'project-1',
      progress,
    ])
    expect(employeeQueryKeys.workItems(workItems)).toEqual(['employees', 'work-items', workItems])
    expect(employeeQueryKeys.importDetail('batch-1')).toEqual([
      'employees',
      'import',
      'batch-1',
      {},
    ])
  })

  it('canonicalizes equivalent string filters before adding them to a key', () => {
    const progress = { periodType: 'WEEK', periodStart: '2026-07-20' } as const

    expect(
      employeeQueryKeys.list({
        q: '   ',
        department: ' 研发部 ',
        employmentStatus: undefined,
      })
    ).toEqual(employeeQueryKeys.list({ department: '研发部' }))
    expect(
      employeeQueryKeys.teamProgress({
        ...progress,
        department: ' 研发部 ',
        projectId: '',
        status: undefined,
      })
    ).toEqual(employeeQueryKeys.teamProgress({ ...progress, department: '研发部' }))
  })
})
