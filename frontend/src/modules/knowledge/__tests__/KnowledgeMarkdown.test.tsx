import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { KnowledgeMarkdown } from '../components/KnowledgeMarkdown';

describe('KnowledgeMarkdown', () => {
  it('renders plain text in a paragraph', () => {
    render(<KnowledgeMarkdown text="你好世界" />);
    expect(screen.getByText('你好世界')).toBeInTheDocument();
  });

  it('renders bold text', () => {
    render(<KnowledgeMarkdown text="这是**重点**内容" />);
    const el = screen.getByText('重点');
    expect(el.tagName).toBe('STRONG');
  });

  it('renders inline code', () => {
    render(<KnowledgeMarkdown text="使用 `const x = 1` 声明" />);
    const el = screen.getByText('const x = 1');
    expect(el.tagName).toBe('CODE');
  });

  it('renders code blocks', () => {
    const { container } = render(<KnowledgeMarkdown text="```\nfunction hello() {}\n```" />);
    expect(container.textContent).toMatch(/function hello/);
  });

  it('renders headers', () => {
    const { container } = render(<KnowledgeMarkdown text="# 标题一\n## 标题二" />);
    expect(container.textContent).toContain('标题一');
    expect(container.textContent).toContain('标题二');
  });

  it('escapes HTML tags', () => {
    render(<KnowledgeMarkdown text='<script>alert("xss")</script>' />);
    expect(screen.getByText(/alert/)).toBeInTheDocument();
    expect(document.querySelector('script')).toBeNull();
  });

  it('renders list items', () => {
    const { container } = render(<KnowledgeMarkdown text="- 项目一\n- 项目二" />);
    expect(container.textContent).toContain('项目一');
    expect(container.textContent).toContain('项目二');
  });
});
