import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { SyncPreflightDialog } from '../SyncPreflightDialog'

describe('SyncPreflightDialog', () => {
  it('requires an explicit decision for every conflict before commit', async () => {
    const onCommit = vi.fn()
    render(
      <SyncPreflightDialog
        visible
        direction="BIDIRECTIONAL"
        items={[
          { id: 'add-1', title: '新增日程', action: 'ADD' },
          { id: 'conflict-1', title: '架构评审', action: 'CONFLICT' },
        ]}
        resolutions={{}}
        onResolutionChange={vi.fn()}
        onCancel={vi.fn()}
        onCommit={onCommit}
      />,
    )

    expect(screen.getByRole('button', { name: '确认同步' })).toBeDisabled()
    expect(screen.getByText('架构评审')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '架构评审：保留本地' })).toBeInTheDocument()
  })

  it('enables commit after conflict choices are supplied', async () => {
    const onCommit = vi.fn()
    const user = userEvent.setup()
    render(
      <SyncPreflightDialog
        visible
        direction="PULL_ONLY"
        items={[{ id: 'conflict-1', title: '架构评审', action: 'CONFLICT' }]}
        resolutions={{ 'conflict-1': 'CREATE_COPY' }}
        onResolutionChange={vi.fn()}
        onCancel={vi.fn()}
        onCommit={onCommit}
      />,
    )

    await user.click(screen.getByRole('button', { name: '确认同步' }))
    expect(onCommit).toHaveBeenCalledTimes(1)
  })
})
