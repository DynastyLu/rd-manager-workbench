import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { KnowledgeMessageBubble } from '../components/KnowledgeMessageBubble';
import type { KnowledgeMessage } from '../types';

// Mock KnowledgeMarkdown to render text in a simple div
vi.mock('../components/KnowledgeMarkdown', () => ({
  KnowledgeMarkdown: ({ text }: { text: string }) => (
    <div data-testid="markdown">{text}</div>
  ),
}));

// Mock KnowledgeCitationCard to expose citations count and deletedIds size
vi.mock('../components/KnowledgeCitationCard', () => ({
  KnowledgeCitationCard: ({
    citations,
    deletedIds,
  }: {
    citations: Array<{ documentId: string; title: string; chunkIndex: number; text: string }>;
    deletedIds?: Set<string>;
  }) => (
    <div data-testid="citation-card">
      <span data-testid="citation-count">{citations.length}</span>
      {deletedIds != null && (
        <span data-testid="deleted-count">{deletedIds.size}</span>
      )}
    </div>
  ),
}));

function createMessage(overrides: Partial<KnowledgeMessage> = {}): KnowledgeMessage {
  return {
    id: 'msg-1',
    role: 'USER',
    content: '你好，这是一个测试消息',
    createdAt: '2025-01-01T10:00:00.000Z',
    ...overrides,
  };
}

describe('KnowledgeMessageBubble', () => {
  it('renders user message with right alignment and Card', () => {
    const message = createMessage({ role: 'USER' });
    const { container } = render(<KnowledgeMessageBubble message={message} />);

    // Should have the user-modifier class for right alignment
    expect(container.querySelector('.kb-message--user')).toBeInTheDocument();

    // Content should be visible inside a Card-like bubble
    expect(screen.getByText('你好，这是一个测试消息')).toBeInTheDocument();
  });

  it('renders AI message with KnowledgeMarkdown', () => {
    const message = createMessage({
      role: 'ASSISTANT',
      content: '这是AI回复',
    });
    render(<KnowledgeMessageBubble message={message} />);

    // KnowledgeMarkdown mock renders into a test-id element
    expect(screen.getByTestId('markdown')).toBeInTheDocument();
    expect(screen.getByTestId('markdown')).toHaveTextContent('这是AI回复');
  });

  it('renders citations via KnowledgeCitationCard when present', () => {
    const message = createMessage({
      role: 'ASSISTANT',
      content: '带引用的回复',
      citations: [
        { documentId: 'doc1', title: '文档1', chunkIndex: 0, text: '内容1' },
        { documentId: 'doc2', title: '文档2', chunkIndex: 1, text: '内容2' },
      ],
    });
    render(<KnowledgeMessageBubble message={message} />);

    expect(screen.getByTestId('citation-card')).toBeInTheDocument();
    expect(screen.getByTestId('citation-count')).toHaveTextContent('2');
  });

  it('does not render citations section when citations is empty or undefined', () => {
    const message = createMessage({
      role: 'ASSISTANT',
      content: '无引用回复',
      citations: [],
    });
    render(<KnowledgeMessageBubble message={message} />);

    expect(screen.queryByTestId('citation-card')).not.toBeInTheDocument();
  });

  it('renders streaming content when isStreaming is true', () => {
    const message = createMessage({
      role: 'ASSISTANT',
      content: '原始完整内容',
    });
    render(
      <KnowledgeMessageBubble
        message={message}
        isStreaming
        streamingContent="流式内容片段..."
      />,
    );

    // Should show the streaming content, not the original message content
    expect(screen.getByTestId('markdown')).toHaveTextContent('流式内容片段...');
  });

  it('shows timestamp in Chinese locale format', () => {
    const message = createMessage({ createdAt: '2025-03-15T08:30:00.000Z' });
    const { container } = render(<KnowledgeMessageBubble message={message} />);

    const timeEl = container.querySelector('.kb-message__time');
    expect(timeEl).toBeInTheDocument();
    // toLocaleTimeString('zh-CN') should produce a non-empty string
    expect(timeEl?.textContent).toBeTruthy();
    // zh-CN time format uses colon separators, e.g. "16:30:00"
    expect(timeEl?.textContent).toMatch(/^\d{1,2}:\d{2}:\d{2}$/);
  });

  it('passes deletedDocIds to KnowledgeCitationCard', () => {
    const message = createMessage({
      role: 'ASSISTANT',
      citations: [
        { documentId: 'doc1', title: 'Doc 1', chunkIndex: 0, text: 'text' },
        { documentId: 'doc2', title: 'Doc 2', chunkIndex: 1, text: 'text' },
      ],
    });
    const deletedDocIds = new Set(['doc1']);
    render(
      <KnowledgeMessageBubble
        message={message}
        deletedDocIds={deletedDocIds}
      />,
    );

    expect(screen.getByTestId('deleted-count')).toHaveTextContent('1');
  });

  it('shows blinking streaming indicator when streaming has content', () => {
    const message = createMessage({ role: 'ASSISTANT', content: '最终内容' });
    const { container } = render(
      <KnowledgeMessageBubble
        message={message}
        isStreaming
        streamingContent="正在生成..."
      />,
    );

    expect(container.querySelector('.kb-streaming-indicator')).toBeInTheDocument();
  });

  it('does not show streaming indicator when streaming is idle or empty', () => {
    const message = createMessage({ role: 'ASSISTANT', content: '一段完整回复' });
    const { container } = render(<KnowledgeMessageBubble message={message} />);

    expect(container.querySelector('.kb-streaming-indicator')).not.toBeInTheDocument();
  });

  it('renders avatar "U" for user and "AI" for assistant', () => {
    const userMsg = createMessage({ role: 'USER' });
    const aiMsg = createMessage({ role: 'ASSISTANT' });

    const { rerender, container } = render(
      <KnowledgeMessageBubble message={userMsg} />,
    );
    expect(container.querySelector('.kb-message__avatar')).toHaveTextContent(
      'U',
    );

    rerender(<KnowledgeMessageBubble message={aiMsg} />);
    expect(container.querySelector('.kb-message__avatar')).toHaveTextContent(
      'AI',
    );
  });

  it('renders assistant message with left-aligned layout', () => {
    const message = createMessage({ role: 'ASSISTANT' });
    const { container } = render(<KnowledgeMessageBubble message={message} />);

    const msgEl = container.querySelector('.kb-message--assistant');
    expect(msgEl).toBeInTheDocument();
    expect(msgEl).not.toHaveClass('kb-message--user');
  });
});
