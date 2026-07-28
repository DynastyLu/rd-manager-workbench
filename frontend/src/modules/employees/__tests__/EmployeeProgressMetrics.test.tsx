import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { EmployeeProgressMetrics } from '../components/EmployeeProgressMetrics'

describe('EmployeeProgressMetrics', () => {
  it('keeps execution and future-plan metrics visually distinct', () => {
    render(
      <EmployeeProgressMetrics
        metrics={{
          workItemCount: 6,
          completedCount: 3,
          completionRate: 50,
          averageCompletionRate: 72,
          plannedHours: 40,
          actualHours: 36,
          riskCount: 1,
          blockedCount: 0,
          projectCount: 2,
          unlinkedCount: 1,
          dataComplete: true,
          missingWeeks: [],
          overdueCount: 2,
          projectWorkCount: 4,
          nonProjectWorkCount: 1,
          legacyUnclassifiedCount: 1,
          missingHoursCount: 2,
          hoursCompleteness: 67,
          hoursUtilizationRate: 90,
        }}
        nextPlanMetrics={{
          planCount: 5,
          priorityDistribution: {
            UNSPECIFIED: 0,
            LOW: 1,
            MEDIUM: 1,
            HIGH: 2,
            URGENT: 1,
          },
          highPriorityCount: 3,
          collaborationCount: 2,
          unmatchedCount: 4,
          cancelledCount: 1,
        }}
      />
    )

    expect(screen.getByLabelText('本周执行指标')).toHaveTextContent('项目工作4')
    expect(screen.getByLabelText('本周执行指标')).toHaveTextContent('非项目工作1')
    expect(screen.getByLabelText('本周执行指标')).toHaveTextContent('逾期2')
    expect(screen.getByLabelText('本周执行指标')).toHaveTextContent('工时完整度67%')
    expect(screen.getByLabelText('下周计划指标')).toHaveTextContent('计划数5')
    expect(screen.getByLabelText('下周计划指标')).toHaveTextContent('协作需求2')
    expect(screen.getByLabelText('下周计划指标')).toHaveTextContent('未承接4')
  })
})
