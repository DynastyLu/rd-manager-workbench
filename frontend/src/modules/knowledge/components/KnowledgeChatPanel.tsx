import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Spin, Tooltip } from '@douyinfe/semi-ui';
import { IconCopy, IconStop } from '@douyinfe/semi-icons';
import { chatStream, createSession, getSession } from '../api';
import { knowledgeQueryKeys } from '../queryKeys';
import { KnowledgeMarkdown } from './KnowledgeMarkdown';
import { KnowledgeCitationCard } from './KnowledgeCitationCard';
import { copyToClipboard, extractHighlightTerms } from '../format';
import { createSseParser } from '../sse';
import type { KnowledgeMessage, ChunkCitation } from '../types';

interface Props { sessionId: string | null; onSessionCreated: (id: string) => void; }

export function KnowledgeChatPanel({ sessionId, onSessionCreated }: Props) {
  const [streamingContent, setStreamingContent] = useState('');
  const [streamingCitations, setStreamingCitations] = useState<ChunkCitation[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastQuestion, setLastQuestion] = useState('');
  const [thinkingSteps, setThinkingSteps] = useState<Array<{ phase: string; message: string }>>([]);
  const [lastEmptyResult, setLastEmptyResult] = useState<{ message: string; totalFound: number } | null>(null);
  // Hold streaming result briefly so it doesn't disappear before the session refetch
  const [pendingAnswer, setPendingAnswer] = useState<{ content: string; citations: ChunkCitation[] } | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const streamContentRef = useRef('');       // capture streaming content for finally
  const streamCitationsRef = useRef<ChunkCitation[]>([]);
  const qc = useQueryClient();

  const { data: session, isLoading } = useQuery({
    queryKey: knowledgeQueryKeys.session(sessionId ?? ''),
    queryFn: () => getSession(sessionId!),
    enabled: !!sessionId,
  });

  const highlightTerms = useMemo(() => extractHighlightTerms(lastQuestion), [lastQuestion]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
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
        if (event === 'status' && typeof parsed === 'object' && parsed !== null) {
          const statusData = parsed as { phase?: unknown; message?: unknown; totalFound?: unknown };
          if (typeof statusData.phase === 'string' && typeof statusData.message === 'string') {
            const step = { phase: statusData.phase, message: statusData.message };
            setThinkingSteps((prev) => [...prev, step]);
            if (statusData.phase === 'empty') {
              setLastEmptyResult({
                message: statusData.message,
                totalFound: typeof statusData.totalFound === 'number' ? statusData.totalFound : 0,
              });
            }
          }
          return;
        }

        if (event === 'token' && typeof parsed === 'object' && parsed !== null) {
          const token = parsed as { content?: unknown; index?: unknown };
          if (typeof token.content === 'string' && typeof token.index === 'number') {
            content += token.content;
            setStreamingContent(content);
            streamContentRef.current = content;
          }
          return;
        }

        if (event === 'citations' && Array.isArray(parsed)) {
          const citations = parsed.filter((citation): citation is ChunkCitation =>
            typeof citation === 'object'
            && citation !== null
            && typeof (citation as { documentId?: unknown }).documentId === 'string',
          );
          setStreamingCitations(citations);
          streamCitationsRef.current = citations;
          return;
        }

        if (event === 'error' && typeof parsed === 'object' && parsed !== null) {
          const streamError = (parsed as { error?: unknown }).error;
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
  }, [sessionId, onSessionCreated, qc]);

  const stop = useCallback(() => { abortRef.current?.abort(); }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const el = inputRef.current;
      if (!el) return;
      const text = el.value.trim();
      if (text && !streaming) { el.value = ''; void send(text); }
    }
  }, [send, streaming]);

  const handleSendClick = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    const text = el.value.trim();
    if (text && !streaming) { el.value = ''; void send(text); }
  }, [send, streaming]);

  // Empty state (no session)
  if (!sessionId) {
    return (
      <div className="kb-chat-main">
        <div className="kb-chat-main__empty">
          <div style={{ fontSize: 48, marginBottom: 8 }}>💬</div>
          <h2>知识库 AI 问答</h2>
          <p>基于本地文档的智能问答，自动检索相关内容</p>
          <textarea ref={inputRef} className="kb-chat-input-bar__textarea" style={{ width: 400, marginTop: 16 }}
            placeholder="输入问题，回车发送..." rows={2} onKeyDown={handleKeyDown} />
          <p style={{ fontSize: 12, color: '#bbb', marginTop: 8 }}>新对话将自动创建 · DeepSeek 驱动</p>
        </div>
      </div>
    );
  }

  if (isLoading) return <div className="kb-chat-main"><Spin size="large" style={{ margin: 'auto' }} /></div>;

  const messages = session?.messages ?? [];

  return (
    <div className="kb-chat-main">
      <div className="kb-chat-main__messages">
        {messages.length === 0 && !streaming && (
          <div className="kb-chat-main__empty"><p>输入问题开始搜索本地知识库</p></div>
        )}
        {messages.map((msg: KnowledgeMessage) => (
          <MessageBubble key={msg.id} msg={msg} highlightTerms={highlightTerms} />
        ))}
        {/* Pending answer card (bridges the gap between streaming end and session refetch) */}
        {!streaming && pendingAnswer && (
          <div className="kb-message kb-message--assistant">
            <div className="kb-message__avatar">AI</div>
            <div className="kb-message__body">
              <div className="kb-message__bubble">
                <KnowledgeMarkdown text={pendingAnswer.content} />
              </div>
              {pendingAnswer.citations.length > 0 && (
                <KnowledgeCitationCard citations={pendingAnswer.citations} highlightTerms={highlightTerms} />
              )}
            </div>
          </div>
        )}

        {/* Persistent empty result card (survives streaming=false) */}
        {!streaming && lastEmptyResult && (
          <div className="kb-message kb-message--assistant">
            <div className="kb-message__avatar">AI</div>
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
          <div className="kb-message kb-message--assistant">
            <div className="kb-message__avatar">AI</div>
            <div className="kb-message__body">
              {/* Thinking steps */}
              {thinkingSteps.length > 0 && (
                <div className="kb-thinking">
                  {thinkingSteps.map((step, i) => (
                    <div key={i} className={`kb-thinking__step kb-thinking__step--${step.phase}`}>
                      <span className="kb-thinking__dot" />
                      <span>{step.message}</span>
                    </div>
                  ))}
                </div>
              )}
              {/* Answer content */}
              {streamingContent && (
                <div className="kb-message__bubble">
                  <KnowledgeMarkdown text={streamingContent} />
                  <span className="kb-streaming-indicator" />
                </div>
              )}
              {streamingCitations.length > 0 && (
                <KnowledgeCitationCard citations={streamingCitations} highlightTerms={highlightTerms} />
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
              {error}
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input bar */}
      <div className="kb-chat-input-bar">
        <textarea ref={inputRef} className="kb-chat-input-bar__textarea"
          placeholder={streaming ? '等待回复完成...' : '输入问题，Enter 发送，Shift+Enter 换行'}
          rows={1} disabled={streaming} onKeyDown={handleKeyDown} />
        {streaming ? (
          <button className="kb-chat-input-bar__stop" onClick={stop}>
            <IconStop size="small" style={{ marginRight: 4 }} />停止
          </button>
        ) : (
          <button className="kb-chat-input-bar__send" onClick={handleSendClick}>发送</button>
        )}
      </div>

      <style>{`
        .kb-chat-main { flex: 1; display: flex; flex-direction: column; height: 100%; min-width: 0; }
        .kb-chat-main__empty {
          flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center;
          color: #8f959e; text-align: center; padding: 40px;
        }
        .kb-chat-main__empty h2 { margin: 0 0 8px; font-size: 20px; color: #4e5969; }
        .kb-chat-main__messages { flex: 1; overflow-y: auto; padding: 16px 20px; }

        .kb-message { display: flex; gap: 10px; margin-bottom: 20px; }
        .kb-message--user { flex-direction: row-reverse; }
        .kb-message--assistant { flex-direction: row; }
        .kb-message__avatar {
          flex-shrink: 0; width: 32px; height: 32px; border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          font-size: 12px; font-weight: 700;
        }
        .kb-message--user .kb-message__avatar { background: #1456f0; color: #fff; }
        .kb-message--assistant .kb-message__avatar { background: #e8f0fe; color: #1456f0; }
        .kb-message__body { flex: 1; min-width: 0; }
        .kb-message__bubble {
          padding: 10px 14px; border-radius: 12px; font-size: 14px; line-height: 1.7;
          word-break: break-word;
        }
        .kb-message--user .kb-message__bubble { background: #e8f0fe; }
        .kb-message--assistant .kb-message__bubble { background: #f5f6f8; }
        .kb-message__copy-btn {
          display: inline-flex; align-items: center; gap: 4px; margin-top: 6px;
          font-size: 12px; color: #8f959e; border: 0; background: none; cursor: pointer;
        }
        .kb-message__copy-btn:hover { color: #1456f0; }

        .kb-chat-input-bar {
          display: flex; gap: 10px; align-items: flex-end;
          padding: 16px 20px; border-top: 1px solid #e5e6eb; background: #fff;
        }
        .kb-chat-input-bar__textarea {
          flex: 1; border: 1px solid #ddd; border-radius: 12px; padding: 10px 16px;
          font-size: 14px; resize: none; line-height: 1.5; min-height: 44px; max-height: 150px;
          font-family: inherit;
        }
        .kb-chat-input-bar__textarea:focus { border-color: #1456f0; }
        .kb-chat-input-bar__send, .kb-chat-input-bar__stop {
          padding: 10px 20px; border-radius: 10px; border: 0; cursor: pointer; font-weight: 500; font-size: 14px;
          white-space: nowrap;
        }
        .kb-chat-input-bar__send { background: #1456f0; color: #fff; }
        .kb-chat-input-bar__stop { background: #fff; color: #e65050; border: 1px solid #e65050; }
        .kb-streaming-indicator {
          display: inline-block; width: 8px; height: 16px; background: #1456f0;
          animation: kb-blink 0.8s infinite; vertical-align: text-bottom; margin-left: 2px; border-radius: 2px;
        }
        @keyframes kb-blink { 0%,100%{opacity:1} 50%{opacity:0} }

        .kb-thinking { margin-bottom: 8px; }
        .kb-thinking__step {
          display: flex; align-items: center; gap: 8px;
          padding: 6px 0; font-size: 13px; color: #4e5969;
        }
        .kb-thinking__dot {
          width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0;
        }
        .kb-thinking__step--searching .kb-thinking__dot { background: #1456f0; animation: kb-pulse 1s infinite; }
        .kb-thinking__step--found .kb-thinking__dot { background: #52c41a; }
        .kb-thinking__step--empty .kb-thinking__dot { background: #faad14; }
        .kb-thinking__step--thinking .kb-thinking__dot { background: #1456f0; animation: kb-pulse 0.6s infinite; }
        @keyframes kb-pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }
      `}</style>
    </div>
  );
}

/** Single message bubble with copy and citations */
function MessageBubble({ msg, highlightTerms }: {
  msg: KnowledgeMessage;
  highlightTerms: string[];
}) {
  const [copied, setCopied] = useState(false);
  const isUser = msg.role === 'USER';

  const handleCopy = () => {
    void copyToClipboard(msg.content).then((ok) => {
      if (ok) { setCopied(true); setTimeout(() => setCopied(false), 1500); }
    });
  };

  return (
    <div className={`kb-message kb-message--${isUser ? 'user' : 'assistant'}`}>
      <div className="kb-message__avatar">{isUser ? 'U' : 'AI'}</div>
      <div className="kb-message__body">
        <div className="kb-message__bubble">
          {isUser ? msg.content : <KnowledgeMarkdown text={msg.content} />}
        </div>
        {!isUser && (
          <Tooltip content={copied ? '已复制' : '复制回答'}>
            <button className="kb-message__copy-btn" onClick={handleCopy} type="button">
              <IconCopy size="small" style={{ marginRight: 2 }} />
              {copied ? '已复制' : '复制'}
            </button>
          </Tooltip>
        )}
        {!isUser && msg.citations && msg.citations.length > 0 && (
          <KnowledgeCitationCard citations={msg.citations} highlightTerms={highlightTerms} />
        )}
      </div>
    </div>
  );
}
