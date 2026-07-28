import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { KnowledgeAssistantWorkspace } from '../components/KnowledgeAssistantWorkspace';

vi.mock('../components/KnowledgeSessionList', () => ({
  KnowledgeSessionList: () => <aside>对话列表</aside>,
}));

vi.mock('../components/KnowledgeChatPanel', () => ({
  KnowledgeChatPanel: ({
    onCitationSelect,
  }: {
    onCitationSelect?: (citation: {
      documentId: string;
      title: string;
      chunkIndex: number;
      text: string;
      locationLabel: string;
    }) => void;
  }) => (
    <main>
      <button
        onClick={() =>
          onCitationSelect?.({
            documentId: 'd1',
            title: '项目评审纪要',
            chunkIndex: 2,
            text: '评审确认先完成可靠性验证。',
            locationLabel: '第 3 页',
          })
        }
      >
        来源 1
      </button>
    </main>
  ),
}));

describe('KnowledgeAssistantWorkspace', () => {
  it('keeps the conversation route while opening a citation in the right pane', () => {
    window.location.hash = '#/knowledge?tab=chat';
    render(
      <KnowledgeAssistantWorkspace sessionId="s1" onSessionChange={vi.fn()} />,
    );

    fireEvent.click(screen.getByText('来源 1'));

    expect(screen.getByText('项目评审纪要')).toBeInTheDocument();
    expect(screen.getByText('评审确认先完成可靠性验证。')).toBeInTheDocument();
    expect(window.location.hash).toBe('#/knowledge?tab=chat');
  });
});
