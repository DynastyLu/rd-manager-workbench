import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { KnowledgeThinkingProcess } from '../components/KnowledgeThinkingProcess'

describe('KnowledgeThinkingProcess', () => {
  it('keeps the neutral thinking state free from the retrieval glow', () => {
    render(<KnowledgeThinkingProcess steps={[]} hasAnswerContent={false} />)

    const thinking = screen.getByLabelText('AI 思考过程')
    expect(thinking).not.toHaveClass('kb-ai-thinking--searching')
    expect(thinking.querySelector('.kb-ai-thinking__search-glow')).not.toBeInTheDocument()
  })

  it('adds the moving glow only while knowledge retrieval is active', () => {
    render(
      <KnowledgeThinkingProcess
        steps={[{ phase: 'searching', message: '正在检索本地研发资料' }]}
        hasAnswerContent={false}
      />
    )

    const thinking = screen.getByLabelText('AI 思考过程')
    expect(thinking).toHaveClass('kb-ai-thinking--searching')
    expect(thinking.querySelector('.kb-ai-thinking__search-glow')).toBeInTheDocument()
    expect(screen.getByText('正在检索本地研发资料')).toBeInTheDocument()
  })
})
