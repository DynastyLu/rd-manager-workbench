import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { KnowledgeCitationCard } from '../components/KnowledgeCitationCard';
import type { ChunkCitation } from '../types';

function makeCitation(overrides: Partial<ChunkCitation> = {}): ChunkCitation {
  return { documentId: 'doc-1', title: '测试文档', chunkIndex: 0, text: '文本片段', content: '完整内容', spaceName: '我的空间', ...overrides };
}

describe('KnowledgeCitationCard', () => {
  it('renders source count header', () => {
    const citations = [makeCitation({ documentId: 'd1', title: '文档A' }), makeCitation({ documentId: 'd2', title: '文档B' })];
    render(<KnowledgeCitationCard citations={citations} />);
    expect(screen.getByText('2 个来源')).toBeInTheDocument();
  });

  it('deduplicates by documentId', () => {
    const citations = [makeCitation({ documentId: 'd1', title: 'A' }), makeCitation({ documentId: 'd1', title: 'A' })];
    render(<KnowledgeCitationCard citations={citations} />);
    expect(screen.getByText('1 个来源')).toBeInTheDocument();
  });

  it('shows document title and space name', () => {
    render(<KnowledgeCitationCard citations={[makeCitation({ title: '项目计划书', spaceName: '项目文档' })]} />);
    expect(screen.getByText('项目计划书')).toBeInTheDocument();
    expect(screen.getByText('项目文档')).toBeInTheDocument();
  });

  it('shows content snippet', () => {
    render(<KnowledgeCitationCard citations={[makeCitation({ text: '预览', content: '这是匹配的文本内容' })]} />);
    expect(screen.getByText(/匹配的文本内容/)).toBeInTheDocument();
  });

  it('opens the cited file in the knowledge reader and shows its source location', () => {
    window.location.hash = '#/knowledge?tab=chat';
    render(<KnowledgeCitationCard citations={[makeCitation({
      documentId: 'doc-42',
      pageNumber: 3,
      locationLabel: '第 3 页',
    })]} />);

    expect(screen.getByText('第 3 页')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /测试文档/ }));
    expect(window.location.hash).toContain('#/knowledge?');
    expect(window.location.hash).toContain('documentId=doc-42');
    expect(window.location.hash).toContain('citationPage=3');
  });

  it('renders nothing for empty citations', () => {
    const { container } = render(<KnowledgeCitationCard citations={[]} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders nothing for undefined citations', () => {
    const { container } = render(<KnowledgeCitationCard citations={undefined} />);
    expect(container.innerHTML).toBe('');
  });
});
