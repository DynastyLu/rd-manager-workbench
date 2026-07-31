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
    expect(screen.getByText('Card Title')).toBeInTheDocument()
    expect(screen.getByText('Content')).toBeInTheDocument()
  })

  it('throws when subcomponent is used outside card', () => {
    expect(() => render(<WorkspaceCardTitle>Orphan</WorkspaceCardTitle>)).toThrow()
  })
})
