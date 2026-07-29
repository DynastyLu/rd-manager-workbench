import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Select, Spin, Toast, Tooltip } from '@douyinfe/semi-ui';
import {
  IconCopy,
  IconDislikeThumb,
  IconEdit,
  IconLikeThumb,
  IconPlusCircle,
  IconRefresh,
  IconSend,
  IconStop,
} from '@douyinfe/semi-icons';
import {
  chatStream,
  createSession,
  getIndexStatus,
  getSession,
  updateSession,
} from '../api';
import { knowledgeQueryKeys } from '../queryKeys';
import { KnowledgeMarkdown } from './KnowledgeMarkdown';
import { KnowledgeCitationCard } from './KnowledgeCitationCard';
import { KnowledgeThinkingProcess } from './KnowledgeThinkingProcess';
import { NovaWordmark } from './NovaWordmark';
import { NovaBot } from './NovaBot';
import { copyToClipboard, extractHighlightTerms } from '../format';
import { createSseParser } from '../sse';
import type { KnowledgeMessage, ChunkCitation, KnowledgeScope } from '../types';
import { createTask } from '@/modules/workbench/api/tasks';

interface Props {
  sessionId: string | null;
  onSessionCreated: (id: string) => void;
  onCitationSelect?: (citation: ChunkCitation) => void;
  projectId?: string;
}

export function KnowledgeChatPanel({
  sessionId,
  onSessionCreated,
  onCitationSelect,
  projectId,
}: Props) {
  const [streamingContent, setStreamingContent] = useState('');
  const [draft, setDraft] = useState('');
  const [streamingCitations, setStreamingCitations] = useState<ChunkCitation[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastQuestion, setLastQuestion] = useState('');
  const [newScopeType, setNewScopeType] = useState<'ALL' | 'RECENT' | 'PROJECT'>(
    projectId ? 'PROJECT' : 'ALL',
  );
  const [thinkingSteps, setThinkingSteps] = useState<Array<{ phase: string; message: string }>>([]);
  const [lastEmptyResult, setLastEmptyResult] = useState<{ message: string; totalFound: number } | null>(null);
  // Hold streaming result briefly so it doesn't disappear before the session refetch
  const [pendingAnswer, setPendingAnswer] = useState<{ content: string; citations: ChunkCitation[] } | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const activeSessionRef = useRef<string | null>(sessionId);
  const messagesRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const streamContentRef = useRef('');       // capture streaming content for finally
  const streamCitationsRef = useRef<ChunkCitation[]>([]);
  const qc = useQueryClient();

  const { data: session, isLoading } = useQuery({
    queryKey: knowledgeQueryKeys.session(sessionId ?? ''),
    queryFn: () => getSession(sessionId!),
    enabled: !!sessionId,
  });
  const indexStatusQuery = useQuery({
    queryKey: knowledgeQueryKeys.indexStatus,
    queryFn: getIndexStatus,
  });

  const highlightTerms = useMemo(() => extractHighlightTerms(lastQuestion), [lastQuestion]);

  useEffect(() => {
    const container = messagesRef.current;
    if (container) container.scrollTop = container.scrollHeight;
  }, [session?.messages, streamingContent]);

  // Clear pending answer once it appears in the loaded session messages
  useEffect(() => {
    if (pendingAnswer && session?.messages) {
      const hasAnswer = session.messages.some(
        (m) => m.role === 'ASSISTANT' && m.content === pendingAnswer.content,
      );
      if (hasAnswer) setPendingAnswer(null);
    }
  }, [session?.messages, pendingAnswer]);

  const send = useCallback(async (question: string) => {
    setLastQuestion(question);
    let sid = sessionId;
    if (!sid) {
      try {
        const s = await createSession(question);
        sid = s.id;
        const scope = scopeFromType(newScopeType, projectId);
        if (scope.type !== 'ALL') {
          await updateSession(s.id, { scope });
        }
        onSessionCreated(s.id);
        void qc.invalidateQueries({ queryKey: knowledgeQueryKeys.sessions });
      } catch {
        setError('创建对话失败，请确认后端服务已启动。');
        return;
      }
    }

    setStreaming(true);
    setStreamingContent('');
    setStreamingCitations([]);
    streamContentRef.current = '';
    streamCitationsRef.current = [];
    setThinkingSteps([]);
    setLastEmptyResult(null);
    setPendingAnswer(null);
    setError(null);
    abortRef.current = new AbortController();

    try {
      const resp = await chatStream(sid, question, abortRef.current.signal);
      if (!resp.ok) {
        const errText = await resp.text().catch(() => '');
        let errMsg = '请确认 DeepSeek API Key 已配置（在 backend/.env 中设置 DEEPSEEK_API_KEY）';
        try {
          const errJson = JSON.parse(errText) as { error?: { message?: string } };
          if (errJson.error?.message) errMsg = errJson.error.message;
        } catch { /* keep default */ }
        setError(`请求失败 (${resp.status})：${errMsg}`);
        return;
      }
      const reader = resp.body!.getReader();
      const decoder = new TextDecoder();
      let content = '';
      const parser = createSseParser((event, parsed) => {
        // Read previously stored/dev-server streams during a rolling local upgrade.
        if (event === 'message') {
          if (Array.isArray(parsed)) {
            const citations = parsed.filter((citation): citation is ChunkCitation =>
              typeof citation === 'object'
              && citation !== null
              && typeof (citation as { documentId?: unknown }).documentId === 'string',
            );
            streamCitationsRef.current = citations;
            setStreamingCitations(citations);
            return;
          }
          if (typeof parsed === 'object' && parsed !== null) {
            const legacy = parsed as {
              content?: unknown;
              phase?: unknown;
              message?: unknown;
              totalFound?: unknown;
              error?: unknown;
            };
            if (typeof legacy.content === 'string') {
              content += legacy.content;
              streamContentRef.current = content;
              setStreamingContent(content);
              return;
            }
            if (typeof legacy.phase === 'string' && typeof legacy.message === 'string') {
              setThinkingSteps((steps) => [
                ...steps,
                { phase: legacy.phase as string, message: legacy.message as string },
              ]);
              if (legacy.phase === 'empty') {
                setLastEmptyResult({
                  message: legacy.message,
                  totalFound: typeof legacy.totalFound === 'number' ? legacy.totalFound : 0,
                });
              }
              return;
            }
            if (typeof legacy.error === 'string') {
              setError(legacy.error);
              return;
            }
          }
        }
        if (event === 'retrieval_started') {
          setThinkingSteps([{ phase: 'searching', message: '正在检索当前范围内的已索引文件…' }]);
          return;
        }
        if (event === 'retrieval_completed' && typeof parsed === 'object' && parsed !== null) {
          const result = parsed as {
            searchedDocumentCount?: unknown;
            relevantCount?: unknown;
            hasEvidence?: unknown;
          };
          const relevantCount = typeof result.relevantCount === 'number' ? result.relevantCount : 0;
          const searched = typeof result.searchedDocumentCount === 'number'
            ? result.searchedDocumentCount
            : 0;
          setThinkingSteps((steps) => [
            ...steps,
            {
              phase: relevantCount > 0 ? 'found' : 'empty',
              message: relevantCount > 0
                ? `已从 ${searched} 个文件中找到 ${relevantCount} 个可引用片段`
                : '当前范围内没有找到可引用的内容',
            },
          ]);
          return;
        }
        if (event === 'answer_delta' && typeof parsed === 'object' && parsed !== null) {
          const delta = (parsed as { text?: unknown }).text;
          if (typeof delta === 'string') {
            content += delta;
            setStreamingContent(content);
            streamContentRef.current = content;
          }
          return;
        }
        if (event === 'citation' && typeof parsed === 'object' && parsed !== null) {
          const citation = parsed as ChunkCitation;
          if (typeof citation.documentId !== 'string') return;
          const key = `${citation.documentId}:${citation.chunkIndex}`;
          if (streamCitationsRef.current.some(
            (item) => `${item.documentId}:${item.chunkIndex}` === key,
          )) return;
          const citations = [...streamCitationsRef.current, citation];
          streamCitationsRef.current = citations;
          setStreamingCitations(citations);
          return;
        }
        if (event === 'failed' && typeof parsed === 'object' && parsed !== null) {
          const streamError = (parsed as { message?: unknown }).message;
          if (typeof streamError === 'string') setError(streamError);
        }
      });

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        parser.push(decoder.decode(value, { stream: true }));
      }
      parser.push(decoder.decode());
      parser.finish();
    } catch (err: unknown) {
      if (err instanceof Error && err.name !== 'AbortError') {
        setError(`连接中断：${err.message}`);
      }
    } finally {
      const finalContent = streamContentRef.current;
      const finalCitations = streamCitationsRef.current;
      if (finalContent) {
        setPendingAnswer({ content: finalContent, citations: finalCitations });
      }
      setStreaming(false);
      abortRef.current = null;
      if (sid) {
        void qc.invalidateQueries({ queryKey: knowledgeQueryKeys.session(sid) });
        void qc.invalidateQueries({ queryKey: knowledgeQueryKeys.sessions });
      }
    }
  }, [newScopeType, onSessionCreated, projectId, qc, sessionId]);

  const changeScope = useCallback(async (value: unknown) => {
    if (!sessionId || typeof value !== 'string') return;
    const scope = scopeFromType(value as 'ALL' | 'RECENT' | 'PROJECT', projectId);
    await updateSession(sessionId, { scope });
    await qc.invalidateQueries({ queryKey: knowledgeQueryKeys.session(sessionId) });
  }, [projectId, qc, sessionId]);

  const stop = useCallback(() => { abortRef.current?.abort(); }, []);

  useEffect(() => () => abortRef.current?.abort(), []);

  useEffect(() => {
    if (activeSessionRef.current && activeSessionRef.current !== sessionId) {
      abortRef.current?.abort();
    }
    activeSessionRef.current = sessionId;
  }, [sessionId]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const text = draft.trim();
      if (text && !streaming) {
        setDraft('');
        void send(text);
      }
    }
  }, [draft, send, streaming]);

  const handleSendClick = useCallback(() => {
    const text = draft.trim();
    if (text && !streaming) {
      setDraft('');
      void send(text);
    }
  }, [draft, send, streaming]);

  const editQuestion = useCallback((question: string) => {
    setDraft(question);
    inputRef.current?.focus();
  }, []);

  const createTaskFromAnswer = useCallback(async (message: KnowledgeMessage) => {
    const firstLine = message.content.split('\n').find((line) => line.trim())?.trim() ?? 'AI 回答行动项';
    try {
      await createTask({
        title: firstLine.slice(0, 80),
        description: message.content,
        ...(session?.scope?.type === 'PROJECT' ? { projectId: session.scope.projectId } : {}),
        sourceType: 'KNOWLEDGE_MESSAGE',
        sourceId: message.id,
      });
      Toast.success('已创建工作项');
      void qc.invalidateQueries({ queryKey: ['tasks'] });
    } catch (taskError) {
      Toast.error(taskError instanceof Error ? taskError.message : '创建工作项失败');
    }
  }, [qc, session?.scope]);

  const suggestions = [
    '总结最近上传的研发资料',
    '有哪些尚未关闭的风险？',
    '整理项目评审中的行动项',
    '对比已有方案的关键差异',
  ];

  // Empty state (no session)
  if (!sessionId) {
    return (
      <div className="kb-chat-main kb-chat-main--empty-state">
        <div className="kb-chat-main__empty">
          <NovaWordmark />
          <div className="kb-chat-composer kb-chat-composer--centered">
            <textarea
              ref={inputRef}
              className="kb-chat-composer__textarea"
              placeholder="输入问题，回车发送..."
              rows={2}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={handleKeyDown}
            />
            <div className="kb-chat-composer__footer">
              <Select
                className="knowledge-assistant__scope-select"
                value={newScopeType}
                onChange={(value) => setNewScopeType(value as typeof newScopeType)}
                optionList={scopeOptions(Boolean(projectId))}
                borderless
              />
              <button
                className="kb-chat-composer__send"
                type="button"
                aria-label="发送问题"
                disabled={!draft.trim()}
                onClick={handleSendClick}
              >
                <IconSend />
              </button>
            </div>
          </div>
          <div className="knowledge-assistant__suggestions">
            {suggestions.map((suggestion) => (
              <button key={suggestion} type="button" onClick={() => void send(suggestion)}>
                {suggestion}
              </button>
            ))}
          </div>
          <p className="kb-chat-main__footnote">新对话将自动创建 · DeepSeek 驱动</p>
        </div>
      </div>
    );
  }

  if (isLoading) return <div className="kb-chat-main"><Spin size="large" style={{ margin: 'auto' }} /></div>;

  const messages = session?.messages ?? [];

  return (
    <div className="kb-chat-main">
      <header className="knowledge-assistant__conversation-header">
        <div>
          <strong>{session?.title || '新对话'}</strong>
          <span>
            检索范围：{scopeLabel(session?.scope?.type)}
            {' · '}
            已索引 {indexStatusQuery.data?.indexedDocuments ?? 0} 个文件
          </span>
        </div>
        <span className="knowledge-assistant__index-state">
          {indexStatusQuery.data?.complete ? '知识索引已就绪' : '知识索引处理中'}
        </span>
      </header>
      <div ref={messagesRef} className="kb-chat-main__messages">
        {messages.length === 0 && !streaming && (
          <div className="kb-chat-main__empty"><p>输入问题开始搜索本地知识库</p></div>
        )}
        {messages.map((msg: KnowledgeMessage, index) => (
          <MessageBubble
            key={msg.id}
            msg={msg}
            highlightTerms={highlightTerms}
            onCitationSelect={onCitationSelect}
            onEdit={msg.role === 'USER' ? () => editQuestion(msg.content) : undefined}
            onRegenerate={msg.role === 'ASSISTANT' ? () => {
              const previousQuestion = messages
                .slice(0, index)
                .reverse()
                .find((candidate) => candidate.role === 'USER')?.content;
              if (previousQuestion) void send(previousQuestion);
            } : undefined}
            onCreateTask={msg.role === 'ASSISTANT'
              ? () => void createTaskFromAnswer(msg)
              : undefined}
          />
        ))}
        {/* Pending answer card (bridges the gap between streaming end and session refetch) */}
        {!streaming && pendingAnswer && (
          <div className="kb-message kb-message--assistant">
            <div className="kb-message__avatar kb-message__avatar--nova">
              <NovaBot compact />
            </div>
            <div className="kb-message__body">
              <div className="kb-message__bubble">
                <KnowledgeMarkdown text={pendingAnswer.content} />
              </div>
              {pendingAnswer.citations.length > 0 && (
                <KnowledgeCitationCard
                  citations={pendingAnswer.citations}
                  highlightTerms={highlightTerms}
                  onSelect={onCitationSelect}
                />
              )}
            </div>
          </div>
        )}

        {/* Persistent empty result card (survives streaming=false) */}
        {!streaming && lastEmptyResult && (
          <div className="kb-message kb-message--assistant">
            <div className="kb-message__avatar kb-message__avatar--nova">
              <NovaBot compact />
            </div>
            <div className="kb-message__body">
              <div className="kb-message__bubble" style={{ background: '#fffbe6', border: '1px solid #ffe58f' }}>
                <div style={{ fontWeight: 600, marginBottom: 8 }}>未找到相关内容</div>
                <div style={{ fontSize: 13, color: '#8f959e' }}>{lastEmptyResult.message}</div>
                {lastEmptyResult.totalFound === 0 && (
                  <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 13, color: '#4e5969' }}>
                    <li>知识库中没有已索引的内容，请先同步本地文件夹</li>
                    <li>在「本地文件夹」页面点击「重新扫描」</li>
                    <li>确认文件格式受支持（.txt .md .docx .pdf .xlsx .csv）</li>
                  </ul>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Streaming bubble */}
        {streaming && (
          <div className="kb-streaming-response">
            <KnowledgeThinkingProcess
              steps={thinkingSteps}
              hasAnswerContent={Boolean(streamingContent)}
            />
            <div className="kb-streaming-response__answer">
              {/* Answer content */}
              {streamingContent && (
                <div className="kb-message__bubble">
                  <KnowledgeMarkdown text={streamingContent} />
                  <span className="kb-streaming-indicator" />
                </div>
              )}
              {streamingCitations.length > 0 && (
                <KnowledgeCitationCard
                  citations={streamingCitations}
                  highlightTerms={highlightTerms}
                  onSelect={onCitationSelect}
                />
              )}
              {/* Empty result warning */}
              {!streamingContent && thinkingSteps.some((s) => s.phase === 'empty') && (
                <div className="kb-message__bubble" style={{ background: '#fffbe6', border: '1px solid #ffe58f' }}>
                  ⚠️ 未找到相关内容。请确认：
                  <ul style={{ margin: '4px 0 0', paddingLeft: 18, fontSize: 13 }}>
                    <li>本地文件夹已完成同步（点击「重新扫描」）</li>
                    <li>文件内容已被正确提取（检查是否有 [需要后端转换] 占位符）</li>
                    <li>搜索词存在于你的文件中</li>
                  </ul>
                </div>
              )}
            </div>
          </div>
        )}
        {/* Error */}
        {error && (
          <div className="kb-message kb-message--error">
            <div className="kb-message__bubble" style={{ background: '#fff3f3', color: '#e65050', border: '1px solid #fdd' }}>
              <span>{error}</span>
              {lastQuestion ? (
                <button type="button" onClick={() => void send(lastQuestion)}>重试</button>
              ) : null}
            </div>
          </div>
        )}
        <div />
      </div>

      {/* Input bar */}
      <div className="kb-chat-composer-dock">
        <div className="kb-chat-composer">
          <textarea ref={inputRef} className="kb-chat-composer__textarea"
          placeholder={streaming ? '等待回复完成...' : '输入问题，Enter 发送，Shift+Enter 换行'}
            rows={2}
            value={draft}
            disabled={streaming}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={handleKeyDown}
          />
          <div className="kb-chat-composer__footer">
            <Select
              value={session?.scope?.type ?? 'ALL'}
              onChange={(value) => void changeScope(value)}
              optionList={scopeOptions(Boolean(projectId))}
              className="knowledge-assistant__scope-select"
              borderless
            />
            {streaming ? (
              <button className="kb-chat-composer__stop" aria-label="停止生成" onClick={stop}>
                <IconStop />
              </button>
            ) : (
              <button
                className="kb-chat-composer__send"
                aria-label="发送问题"
                disabled={!draft.trim()}
                onClick={handleSendClick}
              >
                <IconSend />
              </button>
            )}
          </div>
        </div>
        <small>AI 回答仅依据当前知识库，请通过引用来源核对重要信息。</small>
      </div>

    </div>
  );
}

/** Single message bubble with copy and citations */
function MessageBubble({
  msg,
  highlightTerms,
  onCitationSelect,
  onEdit,
  onRegenerate,
  onCreateTask,
}: {
  msg: KnowledgeMessage;
  highlightTerms: string[];
  onCitationSelect?: (citation: ChunkCitation) => void;
  onEdit?: () => void;
  onRegenerate?: () => void;
  onCreateTask?: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [feedback, setFeedback] = useState<'helpful' | 'unhelpful' | null>(null);
  const isUser = msg.role === 'USER';

  const handleCopy = () => {
    void copyToClipboard(msg.content).then((ok) => {
      if (ok) { setCopied(true); setTimeout(() => setCopied(false), 1500); }
    });
  };

  const handleFeedback = (value: 'helpful' | 'unhelpful') => {
    setFeedback((current) => (current === value ? null : value));
    Toast.success(value === 'helpful' ? '已记录：回答有帮助' : '已记录：回答需要改进');
  };

  return (
    <div className={`kb-message kb-message--${isUser ? 'user' : 'assistant'}`}>
      <div className={`kb-message__avatar${isUser ? '' : ' kb-message__avatar--nova'}`}>
        {isUser ? 'U' : <NovaBot compact />}
      </div>
      <div className="kb-message__body">
        <div className="kb-message__bubble">
          {isUser ? msg.content : <KnowledgeMarkdown text={msg.content} />}
        </div>
        <div
          className="knowledge-assistant__message-actions"
          role={!isUser ? 'toolbar' : undefined}
          aria-label={!isUser ? '回答操作' : undefined}
        >
          {isUser && onEdit ? (
            <button
              className="knowledge-assistant__message-action"
              type="button"
              onClick={onEdit}
            >
              <span className="knowledge-assistant__message-action-icon">
                <IconEdit size="small" />
              </span>
              <span>编辑后再问</span>
            </button>
          ) : null}
          {!isUser ? (
            <>
              <Tooltip content={copied ? '已复制' : '复制回答'}>
                <button
                  className="knowledge-assistant__message-action kb-message__copy-btn"
                  aria-label={copied ? '已复制回答' : '复制回答'}
                  onClick={handleCopy}
                  type="button"
                >
                  <span className="knowledge-assistant__message-action-icon">
                    <IconCopy size="small" />
                  </span>
                  <span>{copied ? '已复制' : '复制'}</span>
                </button>
              </Tooltip>
              {onRegenerate ? (
                <button
                  className="knowledge-assistant__message-action"
                  type="button"
                  aria-label="重新生成回答"
                  onClick={onRegenerate}
                >
                  <span className="knowledge-assistant__message-action-icon">
                    <IconRefresh size="small" />
                  </span>
                  <span>重新生成</span>
                </button>
              ) : null}
              {onCreateTask ? (
                <button
                  className="knowledge-assistant__message-action"
                  type="button"
                  aria-label="转为工作项"
                  onClick={onCreateTask}
                >
                  <span className="knowledge-assistant__message-action-icon">
                    <IconPlusCircle size="small" />
                  </span>
                  <span>转为工作项</span>
                </button>
              ) : null}
              <span className="knowledge-assistant__message-action-divider" aria-hidden="true" />
              <Tooltip content="回答有帮助">
                <button
                  className="knowledge-assistant__message-action knowledge-assistant__message-action--icon-only"
                  type="button"
                  aria-label="回答有帮助"
                  aria-pressed={feedback === 'helpful'}
                  onClick={() => handleFeedback('helpful')}
                >
                  <span className="knowledge-assistant__message-action-icon">
                    <IconLikeThumb size="small" />
                  </span>
                </button>
              </Tooltip>
              <Tooltip content="回答需改进">
                <button
                  className="knowledge-assistant__message-action knowledge-assistant__message-action--icon-only"
                  type="button"
                  aria-label="回答需改进"
                  aria-pressed={feedback === 'unhelpful'}
                  onClick={() => handleFeedback('unhelpful')}
                >
                  <span className="knowledge-assistant__message-action-icon">
                    <IconDislikeThumb size="small" />
                  </span>
                </button>
              </Tooltip>
            </>
          ) : null}
        </div>
        {!isUser && msg.citations && msg.citations.length > 0 && (
          <KnowledgeCitationCard
            citations={msg.citations}
            highlightTerms={highlightTerms}
            onSelect={onCitationSelect}
          />
        )}
      </div>
    </div>
  );
}

function scopeLabel(type?: string) {
  const labels: Record<string, string> = {
    ALL: '全部知识',
    PROJECT: '当前项目',
    SPACE: '知识空间',
    FOLDER: '本地目录',
    DOCUMENTS: '指定文档',
    RECENT: '最近 30 天',
  };
  return labels[type ?? 'ALL'] ?? '全部知识';
}

function scopeOptions(hasProject: boolean) {
  return [
    { label: '全部已索引知识', value: 'ALL' },
    ...(hasProject ? [{ label: '当前项目', value: 'PROJECT' }] : []),
    { label: '最近 30 天', value: 'RECENT' },
  ];
}

function scopeFromType(
  type: 'ALL' | 'RECENT' | 'PROJECT',
  projectId?: string,
): KnowledgeScope {
  if (type === 'PROJECT' && projectId) return { type, projectId };
  if (type === 'RECENT') return { type };
  return { type: 'ALL' };
}
