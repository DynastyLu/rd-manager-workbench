import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { WorkspaceCard, WorkspaceCardContent, WorkspaceCardHeader, WorkspaceCardTitle } from '../WorkspaceCard'

describe('WorkspaceCard', () => {
  it('renders card with header and title', () => {
    render(
      <WorkspaceCard>
        <WorkspaceCardHeader>
          <WorkspaceCardTitle>Card Title</WorkspaceCardTitle>
        </WorkspaceCardHeader>
        <WorkspaceCardContent>Content</WorkspaceCardContent>
      </WorkspaceCard>
    )
    expect(screen.getByText('Card Title').closest('.workspace-card')).toHaveAttribute(
      'data-interactive',
      'true',
    )
    expect(screen.getByText('Content')).toBeInTheDocument()
  })

  it('can disable the interactive spotlight for dense container cards', () => {
    render(<WorkspaceCard hover={false}>Static content</WorkspaceCard>)
    expect(screen.getByText('Static content')).toHaveAttribute('data-interactive', 'false')
  })

  it('throws when subcomponent is used outside card', () => {
    expect(() => render(<WorkspaceCardTitle>Orphan</WorkspaceCardTitle>)).toThrow()
  })
})
