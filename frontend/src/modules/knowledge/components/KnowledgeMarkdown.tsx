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
  html = html.replace(/^### (.+)$/gm, '<h4>$1</h4>');
  html = html.replace(/^## (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^# (.+)$/gm, '<h2>$1</h2>');
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
