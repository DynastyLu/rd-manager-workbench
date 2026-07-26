import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, beforeEach } from 'vitest';
import { KnowledgeCitationCard } from '../components/KnowledgeCitationCard';
import type { ChunkCitation } from '../types';

function makeCitation(overrides: Partial<ChunkCitation> = {}): ChunkCitation {
  return {
    documentId: 'doc-1',
    title: '测试文档',
    chunkIndex: 0,
    text: '这是一段测试文本',
    ...overrides,
  };
}

describe('KnowledgeCitationCard', () => {
  let hashSetter: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    hashSetter = vi.fn();
    Object.defineProperty(window, 'location', {
      value: {
        ...window.location,
        hash: '',
      },
      writable: true,
      configurable: true,
    });
    // Spy on hash setter
    let hashValue = '';
    Object.defineProperty(window.location, 'hash', {
      get() {
        return hashValue;
      },
      set(value: string) {
        hashValue = value;
        hashSetter(value);
      },
      configurable: true,
    });
  });

  it('renders citation tags for each citation', () => {
    const citations = [
      makeCitation({ documentId: 'doc-1', title: '文档A' }),
      makeCitation({ documentId: 'doc-2', title: '文档B' }),
      makeCitation({ documentId: 'doc-3', title: '文档C' }),
    ];

    render(<KnowledgeCitationCard citations={citations} />);

    expect(screen.getByText('文档A')).toBeInTheDocument();
    expect(screen.getByText('文档B')).toBeInTheDocument();
    expect(screen.getByText('文档C')).toBeInTheDocument();
    expect(screen.getByText('引用来源：')).toBeInTheDocument();
  });

  it('clicking a tag navigates to the correct URL', () => {
    const citations = [makeCitation({ documentId: 'abc-123', title: '测试文档' })];

    render(<KnowledgeCitationCard citations={citations} />);

    const tag = screen.getByText('测试文档');
    fireEvent.click(tag);

    expect(hashSetter).toHaveBeenCalledWith('#/docs?documentId=abc-123');
  });

  it('deleted citation is greyed out and not clickable', () => {
    const citations = [makeCitation({ documentId: 'deleted-doc', title: '已删除文档' })];
    const deletedIds = new Set(['deleted-doc']);

    render(<KnowledgeCitationCard citations={citations} deletedIds={deletedIds} />);

    // Semi Tag renders: <div class="semi-tag ..."><div class="semi-tag-content">text</div></div>
    // The style is on the outer .semi-tag element
    const tagContent = screen.getByText('已删除文档');
    const tag = tagContent.closest('.semi-tag') as HTMLElement;

    // Should be greyed out with strikethrough
    expect(tag.style.color).toBe('rgb(153, 153, 153)');
    expect(tag.style.textDecoration).toBe('line-through');
    expect(tag.style.cursor).toBe('not-allowed');

    // Clicking should not navigate
    fireEvent.click(tag);
    expect(hashSetter).not.toHaveBeenCalled();
  });

  it('renders nothing when citations array is empty', () => {
    const { container } = render(<KnowledgeCitationCard citations={[]} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders nothing when citations is undefined', () => {
    const { container } = render(<KnowledgeCitationCard />);
    expect(container.innerHTML).toBe('');
  });

  it('long titles are truncated with "..."', () => {
    const longTitle = '这是一个非常非常非常长的文档标题超过二十个字符';
    const citations = [makeCitation({ title: longTitle })];

    render(<KnowledgeCitationCard citations={citations} />);

    // Title should be truncated to 20 chars + "..."
    const expected = longTitle.slice(0, 20) + '...';
    expect(screen.getByText(expected)).toBeInTheDocument();
    expect(screen.queryByText(longTitle)).toBeNull();
  });

  it('titles at exactly 20 characters are not truncated', () => {
    const exactTitle = '一二三四五六七八九十一二三四五六七八九十'; // Exactly 20 chars
    const citations = [makeCitation({ title: exactTitle })];

    render(<KnowledgeCitationCard citations={citations} />);

    expect(screen.getByText(exactTitle)).toBeInTheDocument();
  });
});
