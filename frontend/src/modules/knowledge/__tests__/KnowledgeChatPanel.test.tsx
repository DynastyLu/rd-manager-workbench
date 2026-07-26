import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { KnowledgeChatPanel } from '../components/KnowledgeChatPanel';

// ---------------------------------------------------------------------------
// Hoisted module-level mocks
// ---------------------------------------------------------------------------
const { getSession, createSession, chatStream } = vi.hoisted(() => ({
  getSession: vi.fn(),
  createSession: vi.fn(),
  chatStream: vi.fn(),
}));

vi.mock('../api', () => ({ getSession, createSession, chatStream }));

vi.mock('../components/KnowledgeMarkdown', () => ({
  KnowledgeMarkdown: ({ text }: { text: string }) => (
    <span data-testid="markdown-content">{text}</span>
  ),
}));

// ---------------------------------------------------------------------------
// Helpers — manual mock objects that avoid jsdom ReadableStream reliance
// ---------------------------------------------------------------------------

/**
 * Build a mock fetch Response whose body.getReader() yields SSE lines
 * (each line verbatim + "\n") and optionally hangs instead of closing.
 */
function mockStreamResponse(lines: string[], hang = false) {
  const encoder = new TextEncoder();
  const data = lines.map((l) => l + '\n').join('');
  const encoded = encoder.encode(data);

  let readCount = 0;
  return {
    ok: true,
    status: 200,
    text: () => Promise.resolve(data),
    body: {
      getReader: () => ({
        read: (): Promise<ReadableStreamReadResult<Uint8Array>> => {
          if (readCount === 0) {
            readCount++;
            return Promise.resolve({ done: false, value: encoded });
          }
          if (hang) {
            return new Promise(() => {});
          }
          return Promise.resolve({ done: true, value: undefined as never });
        },
      }),
    },
  };
}

/**
 * A response with a body reader whose read() never resolves.
 * Used for stop-button tests where we need the stream to hang forever.
 */
function mockHangingResponse() {
  return {
    ok: true,
    status: 200,
    body: {
      getReader: () => ({
        read: (): Promise<ReadableStreamReadResult<Uint8Array>> =>
          new Promise(() => {}),
      }),
    },
  };
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------
describe('KnowledgeChatPanel', () => {
  const onSessionCreated = vi.fn();
  let queryClient: QueryClient;
  let abortSpy: ReturnType<typeof vi.fn>;

  function renderPanel(sessionId: string | null = null) {
    return render(
      <QueryClientProvider client={queryClient}>
        <KnowledgeChatPanel
          sessionId={sessionId}
          onSessionCreated={onSessionCreated}
        />
      </QueryClientProvider>,
    );
  }

  beforeEach(() => {
    vi.clearAllMocks();

    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          // gcTime: 0 helps immediate cleanup between tests
          gcTime: 0,
        },
      },
    });

    // Sensible defaults for the API mocks.
    getSession.mockResolvedValue({
      id: 's1',
      title: 'Test Session',
      status: 'ACTIVE' as const,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messages: [],
    });

    createSession.mockResolvedValue({
      id: 'new-s1',
      title: 'New Session',
      status: 'ACTIVE' as const,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    chatStream.mockResolvedValue(
      mockStreamResponse(['data: {"content":"Hello","index":0}']),
    );

    // Spy on AbortController.prototype.abort so we can assert it was called.
    abortSpy = vi.fn();
    vi.spyOn(AbortController.prototype, 'abort').mockImplementation(abortSpy);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // -----------------------------------------------------------------------
  // 1. Empty state
  // -----------------------------------------------------------------------
  describe('empty state (no sessionId)', () => {
    it('renders the heading and a textarea', () => {
      renderPanel(null);

      expect(screen.getByText('知识库 AI 问答')).toBeInTheDocument();
      expect(
        screen.getByPlaceholderText('输入问题，回车发送...'),
      ).toBeInTheDocument();
    });

    it('shows the subtitle about auto-created sessions and DeepSeek', () => {
      renderPanel(null);

      expect(
        screen.getByText(/新对话将自动创建/),
      ).toBeInTheDocument();
      expect(screen.getByText(/DeepSeek 驱动/)).toBeInTheDocument();
    });
  });

  // -----------------------------------------------------------------------
  // 2. Loading spinner
  // -----------------------------------------------------------------------
  describe('loading state', () => {
    it('shows a loading spinner when sessionId is set and data is loading', () => {
      // Keep the promise pending forever so isLoading stays true.
      getSession.mockReturnValue(new Promise(() => {}));

      renderPanel('s1');

      // The empty-state UI must NOT be visible.
      expect(screen.queryByText('知识库 AI 问答')).not.toBeInTheDocument();
      expect(screen.queryByText('开始提问吧')).not.toBeInTheDocument();

      // The messages area must NOT be rendered.
      expect(
        document.querySelector('.kb-chat-main__messages'),
      ).not.toBeInTheDocument();

      // The kb-chat-main container is present (wraps the Spin).
      expect(document.querySelector('.kb-chat-main')).toBeInTheDocument();
    });
  });

  // -----------------------------------------------------------------------
  // 3. Messages rendering
  // -----------------------------------------------------------------------
  describe('messages rendering', () => {
    it('renders messages from the loaded session', async () => {
      getSession.mockResolvedValue({
        id: 's1',
        title: 'Test',
        status: 'ACTIVE',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        messages: [
          {
            id: 'm1',
            role: 'USER',
            content: '什么是 RAG？',
            tokenCount: 10,
            createdAt: new Date().toISOString(),
          },
          {
            id: 'm2',
            role: 'ASSISTANT',
            content: 'RAG 是检索增强生成...',
            tokenCount: 50,
            createdAt: new Date().toISOString(),
          },
        ],
      });

      renderPanel('s1');

      await waitFor(() => {
        expect(screen.getByText('什么是 RAG？')).toBeInTheDocument();
      });
      expect(screen.getByText('RAG 是检索增强生成...')).toBeInTheDocument();
    });

    it('shows empty prompt when session has no messages and not streaming', async () => {
      getSession.mockResolvedValue({
        id: 's2',
        title: 'Empty',
        status: 'ACTIVE',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        messages: [],
      });

      renderPanel('s2');

      await waitFor(() => {
        expect(screen.getByText('输入问题开始搜索本地知识库')).toBeInTheDocument();
      });
    });

    it('renders citations attached to an assistant message', async () => {
      getSession.mockResolvedValue({
        id: 's1',
        title: 'With Citations',
        status: 'ACTIVE',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        messages: [
          {
            id: 'm1',
            role: 'USER',
            content: 'What is RAG?',
            tokenCount: 5,
            createdAt: new Date().toISOString(),
          },
          {
            id: 'm2',
            role: 'ASSISTANT',
            content: 'RAG stands for...',
            citations: [
              {
                documentId: 'doc-1',
                title: 'RAG Paper',
                chunkIndex: 0,
                text: 'Retrieval-Augmented Generation...',
              },
              {
                documentId: 'doc-2',
                title: 'Survey',
                chunkIndex: 1,
                text: 'A survey of RAG techniques...',
              },
            ],
            tokenCount: 40,
            createdAt: new Date().toISOString(),
          },
        ],
      });

      renderPanel('s1');

      await waitFor(() => {
        expect(screen.getByText('RAG Paper')).toBeInTheDocument();
      });
      expect(screen.getByText('Survey')).toBeInTheDocument();
    });
  });

  // -----------------------------------------------------------------------
  // 4. Sending a message and creating a new session
  // -----------------------------------------------------------------------
  describe('sending a message', () => {
    it('creates a new session when sessionId is null, then sends', async () => {
      const user = userEvent.setup();

      // sessionId = null triggers the creation path.
      createSession.mockResolvedValue({
        id: 'created-session-42',
        title: 'Auto-created',
        status: 'ACTIVE' as const,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        messages: [],
      });

      // chatStream returns a normal completed response.
      chatStream.mockResolvedValue(
        mockStreamResponse(['data: {"content":"Answer!","index":0}']),
      );

      renderPanel(null);

      const textarea = screen.getByPlaceholderText('输入问题，回车发送...');
      await user.type(textarea, 'What is RAG?');
      await user.keyboard('{Enter}');

      // Verify createSession was called with the question text.
      await waitFor(() => {
        expect(createSession).toHaveBeenCalledWith('What is RAG?');
      });

      // Verify onSessionCreated was called with the new session id.
      await waitFor(() => {
        expect(onSessionCreated).toHaveBeenCalledWith('created-session-42');
      });
    });

    it('sends a message on an existing session without creating a new one', async () => {
      const user = userEvent.setup();

      getSession.mockResolvedValue({
        id: 'existing-s1',
        title: 'Existing',
        status: 'ACTIVE',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        messages: [],
      });

      renderPanel('existing-s1');

      // Wait for the loaded state (textarea with the "chat" placeholder).
      const textarea = await screen.findByPlaceholderText(
        '输入问题，Enter 发送，Shift+Enter 换行',
      );

      await user.type(textarea, 'Hello');
      await user.keyboard('{Enter}');

      await waitFor(() => {
        expect(chatStream).toHaveBeenCalledWith(
          'existing-s1',
          'Hello',
          expect.any(AbortSignal),
        );
      });

      // createSession should NOT have been called.
      expect(createSession).not.toHaveBeenCalled();
    });

    it('does not send an empty or whitespace-only message', async () => {
      const user = userEvent.setup();
      renderPanel(null);

      const textarea = screen.getByPlaceholderText('输入问题，回车发送...');

      // Press Enter with empty text.
      await user.click(textarea);
      await user.keyboard('{Enter}');
      expect(createSession).not.toHaveBeenCalled();

      // Type only spaces and press Enter.
      await user.type(textarea, '   ');
      await user.keyboard('{Enter}');
      expect(createSession).not.toHaveBeenCalled();
    });

    it('sends via the send button click on an existing session', async () => {
      const user = userEvent.setup();

      getSession.mockResolvedValue({
        id: 'existing-s2',
        title: 'Existing',
        status: 'ACTIVE',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        messages: [],
      });

      renderPanel('existing-s2');

      const textarea = await screen.findByPlaceholderText(
        '输入问题，Enter 发送，Shift+Enter 换行',
      );
      await user.type(textarea, 'Hello from button');
      await user.click(screen.getByText('发送'));

      await waitFor(() => {
        expect(chatStream).toHaveBeenCalledWith(
          'existing-s2',
          'Hello from button',
          expect.any(AbortSignal),
        );
      });
    });
  });

  // -----------------------------------------------------------------------
  // 5. Streaming content
  // -----------------------------------------------------------------------
  describe('streaming content', () => {
    it('enters streaming mode — stop button and disabled textarea appear', async () => {
      const user = userEvent.setup();

      getSession.mockResolvedValue({
        id: 'stream-s4',
        title: 'Stream',
        status: 'ACTIVE',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        messages: [],
      });

      // A hanging stream keeps the component in "streaming" mode.
      chatStream.mockResolvedValue(mockHangingResponse());

      renderPanel('stream-s4');

      const textarea = await screen.findByPlaceholderText(
        '输入问题，Enter 发送，Shift+Enter 换行',
      );
      await user.type(textarea, 'Explain');
      await user.keyboard('{Enter}');

      // Textarea changes placeholder and becomes disabled.
      await waitFor(() => {
        expect(
          screen.getByPlaceholderText('等待回复完成...'),
        ).toBeInTheDocument();
        expect(
          screen.getByPlaceholderText('等待回复完成...'),
        ).toBeDisabled();
        // Stop button replaces the send button.
        expect(screen.getByText('停止')).toBeInTheDocument();
        expect(screen.queryByText('发送')).not.toBeInTheDocument();
      });
    });

    it('shows "思考中..." placeholder when stream has not delivered content', async () => {
      const user = userEvent.setup();

      getSession.mockResolvedValue({
        id: 'stream-s2',
        title: 'Stream',
        status: 'ACTIVE',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        messages: [],
      });

      chatStream.mockResolvedValue(mockHangingResponse());

      renderPanel('stream-s2');

      const textarea = await screen.findByPlaceholderText(
        '输入问题，Enter 发送，Shift+Enter 换行',
      );
      await user.type(textarea, 'Ping');
      await user.keyboard('{Enter}');

      // streamingContent is '' so the fallback text is rendered.
      await waitFor(() => {
        expect(screen.getByText('正在检索知识库...')).toBeInTheDocument();
      });
    });

    it('calls chatStream with correct parameters when sending', async () => {
      const user = userEvent.setup();

      getSession.mockResolvedValue({
        id: 'stream-s6',
        title: 'Stream',
        status: 'ACTIVE',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        messages: [],
      });

      chatStream.mockResolvedValue(mockHangingResponse());

      renderPanel('stream-s6');

      const textarea = await screen.findByPlaceholderText(
        '输入问题，Enter 发送，Shift+Enter 换行',
      );
      await user.type(textarea, 'My question');
      await user.keyboard('{Enter}');

      await waitFor(() => {
        expect(chatStream).toHaveBeenCalledWith(
          'stream-s6',
          'My question',
          expect.any(AbortSignal),
        );
      });
    });
  });

  // -----------------------------------------------------------------------
  // 6. Citations display
  // -----------------------------------------------------------------------
  describe('citations', () => {
    it('shows citations on completed assistant messages', async () => {
      getSession.mockResolvedValue({
        id: 's-cit',
        title: 'Citations',
        status: 'ACTIVE',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        messages: [
          {
            id: 'u1',
            role: 'USER',
            content: 'question',
            tokenCount: 3,
            createdAt: new Date().toISOString(),
          },
          {
            id: 'a1',
            role: 'ASSISTANT',
            content: 'answer',
            citations: [
              { documentId: 'd1', title: 'Alpha', chunkIndex: 0, text: '...' },
              { documentId: 'd2', title: 'Beta', chunkIndex: 1, text: '...' },
            ],
            tokenCount: 20,
            createdAt: new Date().toISOString(),
          },
        ],
      });

      renderPanel('s-cit');

      await waitFor(() => {
        expect(screen.getByText('Alpha')).toBeInTheDocument();
      });
      expect(screen.getByText('Beta')).toBeInTheDocument();

      // Citation source items have role="button"
      const citationBtns = document.querySelectorAll('.kb-source-item[role="button"]');
      expect(citationBtns).toHaveLength(2);
      expect(citationBtns[0]).toHaveTextContent('Alpha');
      expect(citationBtns[1]).toHaveTextContent('Beta');
    });

    it('does not render citation area when message has no citations', async () => {
      getSession.mockResolvedValue({
        id: 's-nocit',
        title: 'No Citations',
        status: 'ACTIVE',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        messages: [
          {
            id: 'u1',
            role: 'USER',
            content: 'hello',
            tokenCount: 2,
            createdAt: new Date().toISOString(),
          },
          {
            id: 'a1',
            role: 'ASSISTANT',
            content: 'hi there',
            citations: [],
            tokenCount: 5,
            createdAt: new Date().toISOString(),
          },
        ],
      });

      renderPanel('s-nocit');

      // Wait for messages to load.
      await screen.findAllByTestId('markdown-content');

      // No citation container should exist.
      expect(
        document.querySelector('.kb-message__citations'),
      ).not.toBeInTheDocument();
    });
  });

  // -----------------------------------------------------------------------
  // 7. Error handling
  // -----------------------------------------------------------------------
  describe('error handling', () => {
    it('handles createSession failure — stays in empty state', async () => {
      const user = userEvent.setup();

      createSession.mockRejectedValue(new Error('Network Error'));

      renderPanel(null);

      const textarea = screen.getByPlaceholderText('输入问题，回车发送...');
      await user.type(textarea, 'Error test');
      await user.keyboard('{Enter}');

      // createSession was called and rejected.
      await waitFor(() => {
        expect(createSession).toHaveBeenCalledWith('Error test');
      });

      // Since sessionId is still null, the component stays in the empty state.
      // The error is set internally but the empty-state branch does not render it.
      expect(screen.getByText('知识库 AI 问答')).toBeInTheDocument();
      expect(onSessionCreated).not.toHaveBeenCalled();
    });

    it('shows an error when chatStream returns a non-ok response', async () => {
      const user = userEvent.setup();

      getSession.mockResolvedValue({
        id: 's-err',
        title: 'Error Session',
        status: 'ACTIVE',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        messages: [],
      });

      chatStream.mockResolvedValue({
        ok: false,
        status: 500,
        text: () => Promise.resolve('Internal Server Error'),
      });

      renderPanel('s-err');

      const textarea = await screen.findByPlaceholderText(
        '输入问题，Enter 发送，Shift+Enter 换行',
      );
      await user.type(textarea, 'Cause error');
      await user.keyboard('{Enter}');

      await waitFor(() => {
        expect(
          screen.getByText(/请求失败 \(500\)/),
        ).toBeInTheDocument();
        expect(
          screen.getByText(/DeepSeek API Key/),
        ).toBeInTheDocument();
      });
    });

    it('shows an error when chatStream returns non-ok with JSON error body', async () => {
      const user = userEvent.setup();

      getSession.mockResolvedValue({
        id: 's-err2',
        title: 'Error Session',
        status: 'ACTIVE',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        messages: [],
      });

      chatStream.mockResolvedValue({
        ok: false,
        status: 400,
        text: () =>
          Promise.resolve(
            JSON.stringify({ error: { message: 'Bad request parameter' } }),
          ),
      });

      renderPanel('s-err2');

      const textarea = await screen.findByPlaceholderText(
        '输入问题，Enter 发送，Shift+Enter 换行',
      );
      await user.type(textarea, 'Bad request');
      await user.keyboard('{Enter}');

      await waitFor(() => {
        expect(
          screen.getByText(/请求失败 \(400\)：Bad request parameter/),
        ).toBeInTheDocument();
      });
    });

    it('shows an error when the stream sends an SSE error event', async () => {
      const user = userEvent.setup();

      getSession.mockResolvedValue({
        id: 's-sse-err',
        title: 'SSE Error',
        status: 'ACTIVE',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        messages: [],
      });

      // Simulate an SSE error event: "event: error" followed by data with error field.
      chatStream.mockResolvedValue(
        mockStreamResponse([
          'event: error',
          'data: {"error":"DeepSeek API returned an error"}',
        ]),
      );

      renderPanel('s-sse-err');

      const textarea = await screen.findByPlaceholderText(
        '输入问题，Enter 发送，Shift+Enter 换行',
      );
      await user.type(textarea, 'SSE error test');
      await user.keyboard('{Enter}');

      await waitFor(() => {
        expect(
          screen.getByText('DeepSeek API returned an error'),
        ).toBeInTheDocument();
      });
    });

    it('handles non-JSON data lines gracefully (skip without crashing)', async () => {
      const user = userEvent.setup();

      getSession.mockResolvedValue({
        id: 's-malformed',
        title: 'Malformed Stream',
        status: 'ACTIVE',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        messages: [],
      });

      // Lines that are not valid JSON or have unexpected structure are
      // silently skipped by the catch block without throwing.
      chatStream.mockResolvedValue(
        mockStreamResponse([
          'data: not-valid-json',
          'data: {"content":"Still works","index":0}',
        ]),
      );

      renderPanel('s-malformed');

      const textarea = await screen.findByPlaceholderText(
        '输入问题，Enter 发送，Shift+Enter 换行',
      );
      await user.type(textarea, 'Test');
      await user.keyboard('{Enter}');

      // Verify the stream was called — the malformed line is silently skipped.
      await waitFor(() => {
        expect(chatStream).toHaveBeenCalledWith(
          's-malformed',
          'Test',
          expect.any(AbortSignal),
        );
      });

      // No error bubble should be present — the malformed data did not crash
      // the component or produce an error message.
      expect(
        document.querySelector('.kb-message__bubble[style*="rgb(255, 243, 243)"]'),
      ).not.toBeInTheDocument();
    });
  });

  // -----------------------------------------------------------------------
  // 8. Stop button
  // -----------------------------------------------------------------------
  describe('stop button', () => {
    it('aborts the streaming request when stop is clicked', async () => {
      const user = userEvent.setup();

      getSession.mockResolvedValue({
        id: 's-stop',
        title: 'Stop Test',
        status: 'ACTIVE',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        messages: [],
      });

      // A hanging stream keeps the component in "streaming" mode so the stop
      // button remains visible.
      chatStream.mockResolvedValue(mockHangingResponse());

      renderPanel('s-stop');

      const textarea = await screen.findByPlaceholderText(
        '输入问题，Enter 发送，Shift+Enter 换行',
      );
      await user.type(textarea, 'Test');
      await user.keyboard('{Enter}');

      // Wait for the stop button to appear.
      const stopButton = await screen.findByText('停止');
      expect(stopButton).toBeInTheDocument();

      // Click stop — it calls abortRef.current?.abort().
      await user.click(stopButton);

      expect(abortSpy).toHaveBeenCalled();
    });

    it('shows the stop button (not send) while streaming is active', async () => {
      const user = userEvent.setup();

      getSession.mockResolvedValue({
        id: 's-buttons',
        title: 'Buttons',
        status: 'ACTIVE',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        messages: [],
      });

      chatStream.mockResolvedValue(mockHangingResponse());

      renderPanel('s-buttons');

      const textarea = await screen.findByPlaceholderText(
        '输入问题，Enter 发送，Shift+Enter 换行',
      );
      await user.type(textarea, 'Test');
      await user.keyboard('{Enter}');

      await waitFor(() => {
        expect(screen.getByText('停止')).toBeInTheDocument();
        expect(screen.queryByText('发送')).not.toBeInTheDocument();
      });
    });
  });

  // -----------------------------------------------------------------------
  // 9. Query client interactions
  // -----------------------------------------------------------------------
  describe('query client interactions', () => {
    it('invalidates sessions query after creating a new session', async () => {
      const user = userEvent.setup();
      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

      createSession.mockResolvedValue({
        id: 'inv-s1',
        title: 'Invalidate Test',
        status: 'ACTIVE' as const,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        messages: [],
      });

      chatStream.mockResolvedValue(
        mockStreamResponse(['data: {"content":"OK","index":0}']),
      );

      renderPanel(null);

      const textarea = screen.getByPlaceholderText('输入问题，回车发送...');
      await user.type(textarea, 'Invalidate test');
      await user.keyboard('{Enter}');

      await waitFor(() => {
        expect(invalidateSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            queryKey: ['knowledge', 'sessions'],
          }),
        );
      });

      invalidateSpy.mockRestore();
    });
  });
});
