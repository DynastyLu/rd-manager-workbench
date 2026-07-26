import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { KnowledgeSessionList } from '../components/KnowledgeSessionList';
import type { KnowledgeSession } from '../types';

const { listSessions, archiveSession } = vi.hoisted(() => ({
  listSessions: vi.fn(),
  archiveSession: vi.fn(),
}));

vi.mock('../api', () => ({ listSessions, archiveSession }));

vi.mock('@douyinfe/semi-ui', () => ({
  Button: ({ children, onClick, ...props }: Record<string, unknown>) => (
    <button onClick={onClick as () => void} {...props}>
      {children as React.ReactNode}
    </button>
  ),
  Toast: { success: vi.fn() },
}));

vi.mock('@douyinfe/semi-icons', () => ({
  IconPlus: () => null,
  IconDelete: () => null,
}));

function makeSession(overrides: Partial<KnowledgeSession> = {}): KnowledgeSession {
  return {
    id: '1',
    title: 'Test Session',
    status: 'ACTIVE',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

interface RenderOptions {
  activeId?: string | null;
  onSelect?: (s: KnowledgeSession) => void;
  onNew?: () => void;
}

function renderComponent(options: RenderOptions = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  const onSelect = options.onSelect ?? vi.fn();
  const onNew = options.onNew ?? vi.fn();

  const result = render(
    <QueryClientProvider client={queryClient}>
      <KnowledgeSessionList
        activeId={options.activeId ?? null}
        onSelect={onSelect}
        onNew={onNew}
      />
    </QueryClientProvider>,
  );

  return { ...result, onSelect, onNew };
}

describe('KnowledgeSessionList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders sessions from API', async () => {
    const sessions = [
      makeSession({ id: '1', title: 'First Session' }),
      makeSession({ id: '2', title: 'Second Session' }),
    ];
    listSessions.mockResolvedValue(sessions);

    renderComponent();

    expect(await screen.findByText('First Session')).toBeInTheDocument();
    expect(screen.getByText('Second Session')).toBeInTheDocument();
  });

  it('highlights the active session with the active class', async () => {
    const sessions = [
      makeSession({ id: '1', title: 'Active Session' }),
      makeSession({ id: '2', title: 'Inactive Session' }),
    ];
    listSessions.mockResolvedValue(sessions);

    renderComponent({ activeId: '1' });

    await screen.findByText('Active Session');

    const items = document.querySelectorAll('.kb-chat-session-item');
    expect(items).toHaveLength(2);
    expect(items[0].className).toContain('kb-chat-session-item--active');
    expect(items[1].className).not.toContain('kb-chat-session-item--active');
  });

  it('clicking a session calls onSelect with the session', async () => {
    const session = makeSession({ id: 'click-1', title: 'Click Me' });
    listSessions.mockResolvedValue([session]);
    const onSelect = vi.fn();

    renderComponent({ onSelect });

    const user = userEvent.setup();
    await user.click(await screen.findByText('Click Me'));

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(session);
  });

  it('clicking the new button calls onNew', async () => {
    listSessions.mockResolvedValue([]);
    const onNew = vi.fn();

    renderComponent({ onNew });

    const user = userEvent.setup();
    await user.click(screen.getByText('新建对话'));

    expect(onNew).toHaveBeenCalledTimes(1);
  });

  it('deleting a session calls archiveSession with the session id', async () => {
    const session = makeSession({ id: 'del-1', title: 'Deletable' });
    listSessions.mockResolvedValue([session]);
    archiveSession.mockResolvedValue(undefined);

    renderComponent();

    await screen.findByText('Deletable');

    const user = userEvent.setup();
    await user.click(screen.getByLabelText('删除对话'));

    await waitFor(() => {
      expect(archiveSession).toHaveBeenCalledWith('del-1');
    });
  });

  it('deleting the active session calls onNew', async () => {
    const session = makeSession({ id: 'active-1', title: 'Active One' });
    listSessions.mockResolvedValue([session]);
    archiveSession.mockResolvedValue(undefined);
    const onNew = vi.fn();

    renderComponent({ activeId: 'active-1', onNew });

    await screen.findByText('Active One');

    const user = userEvent.setup();
    await user.click(screen.getByLabelText('删除对话'));

    await waitFor(() => {
      expect(onNew).toHaveBeenCalledTimes(1);
    });
  });

  it('renders no sessions gracefully when API returns empty array', async () => {
    listSessions.mockResolvedValue([]);

    renderComponent();

    // Header and new button are always visible
    expect(screen.getByText('对话历史')).toBeInTheDocument();
    expect(screen.getByText('新建对话')).toBeInTheDocument();

    // No session items are rendered after loading completes
    await waitFor(() => {
      const items = document.querySelectorAll('.kb-chat-session-item');
      expect(items.length).toBe(0);
    });
  });
});
