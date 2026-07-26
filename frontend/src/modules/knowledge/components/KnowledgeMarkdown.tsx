import { useMemo } from 'react';

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function renderMarkdown(text: string): string {
  let html = escapeHtml(text);
  // Code blocks ```
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g,
    '<pre class="kb-code-block"><code>$2</code></pre>');
  // Inline code `
  html = html.replace(/`([^`]+)`/g, '<code class="kb-inline-code">$1</code>');
  // Bold **
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  // Headers
  html = html.replace(/^#{1,6} (.+)$/gm, (_: string, text: string, offset: number, full: string) => {
    const line = full.substring(offset, full.indexOf('\n', offset) === -1 ? full.length : full.indexOf('\n', offset));
    const level = line.match(/^(#+)/)?.[1]?.length ?? 1;
    const tag = `h${Math.min(level + 1, 6)}`;
    return `<${tag}>${text}</${tag}>`;
  });
  // Unordered lists
  html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');
  // Paragraph breaks
  html = html.replace(/\n\n+/g, '</p><p>');
  html = '<p>' + html + '</p>';
  return html;
}

export function KnowledgeMarkdown({ text }: { text: string }) {
  const html = useMemo(() => renderMarkdown(text), [text]);
  return <div className="kb-markdown" dangerouslySetInnerHTML={{ __html: html }} />;
}
