import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { KnowledgeSessionHistory } from '../components/KnowledgeSessionHistory';
import type { KnowledgeSession } from '../types';

const { listSessions, archiveSession, updateSession } = vi.hoisted(() => ({
  listSessions: vi.fn(),
  archiveSession: vi.fn(),
  updateSession: vi.fn(),
}));

vi.mock('../api', () => ({ listSessions, archiveSession, updateSession }));

vi.mock('@douyinfe/semi-ui', () => ({
  Button: ({ children, onClick, icon: _icon, ...props }: Record<string, unknown>) => (
    <button onClick={onClick as () => void} {...props}>{children as React.ReactNode}</button>
  ),
  Input: ({ value, onChange, prefix: _prefix, showClear: _showClear, ...props }: Record<string, unknown>) => (
    <input
      value={value as string}
      onChange={(event) => (onChange as (value: string) => void)(event.target.value)}
      {...props}
    />
  ),
  Modal: { confirm: ({ onOk }: { onOk?: () => unknown }) => onOk?.() },
  Toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('@douyinfe/semi-icons', () => ({
  IconClose: () => null,
  IconDelete: () => null,
  IconEdit: () => null,
  IconSearch: () => null,
  IconStar: () => null,
}));

function makeSession(overrides: Partial<KnowledgeSession>): KnowledgeSession {
  return {
    id: 'session-1',
    title: '默认会话',
    status: 'ACTIVE',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function renderHistory(
  sessions: KnowledgeSession[],
  options: {
    onClose?: () => void;
    onSelect?: (session: KnowledgeSession) => void;
  } = {},
) {
  listSessions.mockImplementation(async (search?: string) => (
    search
      ? sessions.filter((session) => session.title.includes(search))
      : sessions
  ));
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const onClose = options.onClose ?? vi.fn();
  const onSelect = options.onSelect ?? vi.fn();

  render(
    <QueryClientProvider client={queryClient}>
      <KnowledgeSessionHistory onClose={onClose} onSelect={onSelect} />
    </QueryClientProvider>,
  );

  return { onClose, onSelect };
}

describe('KnowledgeSessionHistory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('groups history by current month and previous year and shows message previews', async () => {
    const now = new Date();
    const previousYear = now.getFullYear() - 1;
    renderHistory([
      makeSession({
        id: 'current',
        title: '本月项目复盘',
        preview: '已经完成三个里程碑，下一步处理遗留风险。',
        lastMessageAt: now.toISOString(),
      }),
      makeSession({
        id: 'older',
        title: '往年项目复盘',
        preview: '历史项目总结摘要。',
        lastMessageAt: `${previousYear}-04-06T08:00:00.000Z`,
      }),
    ]);

    expect(await screen.findByText('本月')).toBeInTheDocument();
    expect(screen.getByText(`${previousYear}年`)).toBeInTheDocument();
    expect(screen.getByText('已经完成三个里程碑，下一步处理遗留风险。')).toBeInTheDocument();
  });

  it('filters history and opens the selected conversation', async () => {
    const target = makeSession({ id: 'target', title: '设备采购复盘' });
    const { onSelect } = renderHistory([
      target,
      makeSession({ id: 'other', title: '项目评审记录' }),
    ]);
    const user = userEvent.setup();

    await screen.findByText('项目评审记录');
    await user.type(screen.getByPlaceholderText('搜索历史会话'), '设备采购');

    await waitFor(() => {
      expect(listSessions).toHaveBeenLastCalledWith('设备采购', undefined, 100);
    });
    await user.click(await screen.findByRole('button', { name: '打开会话：设备采购复盘' }));

    expect(onSelect).toHaveBeenCalledWith(target);
  });

  it('exposes pin, rename, and delete actions for each history card', async () => {
    const session = makeSession({ id: 'actions', title: '需要整理的会话' });
    updateSession.mockResolvedValue({ ...session, isPinned: true });
    archiveSession.mockResolvedValue(undefined);
    renderHistory([session]);
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: '置顶：需要整理的会话' }));
    expect(updateSession).toHaveBeenCalledWith('actions', { isPinned: true });

    await user.click(screen.getByRole('button', { name: '删除：需要整理的会话' }));
    await waitFor(() => expect(archiveSession.mock.calls[0]?.[0]).toBe('actions'));
  });
});
