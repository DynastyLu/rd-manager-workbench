import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { KnowledgeAssistantWorkspace } from '../components/KnowledgeAssistantWorkspace';

const { listSessions } = vi.hoisted(() => ({
  listSessions: vi.fn().mockResolvedValue([]),
}));

vi.mock('../api', () => ({
  listSessions,
  archiveSession: vi.fn(),
  updateSession: vi.fn(),
}));

vi.mock('../components/KnowledgeSessionList', () => ({
  KnowledgeSessionList: ({
    onOpenHistory,
  }: {
    onOpenHistory?: () => void;
  }) => (
    <aside>
      对话列表
      <button onClick={onOpenHistory}>查看全部</button>
    </aside>
  ),
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
  const renderWorkspace = (
    sessionId: string | null = null,
    onSessionChange = vi.fn(),
  ) => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const result = render(
      <QueryClientProvider client={queryClient}>
        <KnowledgeAssistantWorkspace
          sessionId={sessionId}
          onSessionChange={onSessionChange}
        />
      </QueryClientProvider>,
    );
    return { ...result, onSessionChange };
  };

  it('opens and closes the full history page from the sidebar', () => {
    renderWorkspace();

    fireEvent.click(screen.getByRole('button', { name: '查看全部' }));

    expect(screen.getByRole('heading', { name: '历史会话' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '关闭历史会话' }));
    expect(screen.queryByRole('heading', { name: '历史会话' })).not.toBeInTheDocument();
  });

  it('keeps the citation panel hidden until a source is selected', () => {
    renderWorkspace('s1');

    expect(screen.queryByLabelText('引用来源')).not.toBeInTheDocument();
  });

  it('opens a selected historical conversation and closes the history page', async () => {
    listSessions.mockResolvedValueOnce([
      {
        id: 'history-1',
        title: '项目历史复盘',
        status: 'ACTIVE',
        createdAt: '2026-07-28T10:00:00.000Z',
        updatedAt: '2026-07-28T10:00:00.000Z',
      },
    ]);
    const { onSessionChange } = renderWorkspace();

    fireEvent.click(screen.getByRole('button', { name: '查看全部' }));
    fireEvent.click(await screen.findByRole('button', { name: '打开会话：项目历史复盘' }));

    expect(onSessionChange).toHaveBeenCalledWith('history-1');
    expect(screen.queryByRole('heading', { name: '历史会话' })).not.toBeInTheDocument();
  });

  it('keeps the conversation route while opening a citation in the right pane', () => {
    window.location.hash = '#/knowledge?tab=chat';
    renderWorkspace('s1');

    fireEvent.click(screen.getByText('来源 1'));

    expect(screen.getByText('项目评审纪要')).toBeInTheDocument();
    expect(screen.getByText('评审确认先完成可靠性验证。')).toBeInTheDocument();
    expect(screen.getByLabelText('引用来源')).toHaveClass('knowledge-assistant__source--open');
    expect(window.location.hash).toBe('#/knowledge?tab=chat');
  });
});
