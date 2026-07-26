import { useState, useRef, useCallback, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Spin } from '@douyinfe/semi-ui';
import { chatStream, createSession, getSession } from '../api';
import { knowledgeQueryKeys } from '../queryKeys';
import { KnowledgeMarkdown } from './KnowledgeMarkdown';
import type { KnowledgeMessage, ChunkCitation } from '../types';

interface Props { sessionId: string | null; onSessionCreated: (id: string) => void; }

export function KnowledgeChatPanel({ sessionId, onSessionCreated }: Props) {
  const [streamingContent, setStreamingContent] = useState('');
  const [streamingCitations, setStreamingCitations] = useState<ChunkCitation[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const qc = useQueryClient();

  const { data: session, isLoading } = useQuery({
    queryKey: knowledgeQueryKeys.session(sessionId ?? ''),
    queryFn: () => getSession(sessionId!),
    enabled: !!sessionId,
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [session?.messages, streamingContent]);

  const send = useCallback(async (question: string) => {
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
      let buf = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() || '';
        for (const line of lines) {
          if (line.startsWith('event: ')) {
            const eventType = line.slice(7).trim();
            if (eventType === 'error') {
              // The error data will be on the next data: line
              // We don't break here because there might be more events in the buffer
            }
            continue;
          }
          if (!line.startsWith('data: ')) continue;
          const raw = line.slice(6);
          try {
            const parsed: unknown = JSON.parse(raw);
            if (typeof parsed === 'object' && parsed !== null) {
              const obj = parsed as Record<string, unknown>;
              if (typeof obj.error === 'string') {
                setError(obj.error);
                return;
              }
              if (typeof obj.content === 'string' && typeof obj.index === 'number') {
                content += obj.content;
                setStreamingContent(content);
              }
            }
            if (Array.isArray(parsed) && parsed.length > 0) {
              const first = parsed[0] as Record<string, unknown> | null;
              if (first && typeof first.documentId === 'string') {
                setStreamingCitations(parsed as unknown as ChunkCitation[]);
              }
            }
          } catch { /* skip */ }
        }
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name !== 'AbortError') {
        setError(`连接中断：${err.message}`);
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
      const finalSid = sid;
      void qc.invalidateQueries({ queryKey: knowledgeQueryKeys.session(finalSid) });
      void qc.invalidateQueries({ queryKey: knowledgeQueryKeys.sessions });
    }
  }, [sessionId, onSessionCreated, qc]);

  const stop = useCallback(() => { abortRef.current?.abort(); }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const el = inputRef.current;
      if (!el) return;
      const text = el.value.trim();
      if (text && !streaming) {
        el.value = '';
        void send(text);
      }
    }
  }, [send, streaming]);

  const handleSendClick = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    const text = el.value.trim();
    if (text && !streaming) {
      el.value = '';
      void send(text);
    }
  }, [send, streaming]);

  if (!sessionId) {
    return (
      <div className="kb-chat-main">
        <div className="kb-chat-main__empty">
          <div style={{ fontSize: 48, marginBottom: 8 }}>💬</div>
          <h2>知识库 AI 问答</h2>
          <p>在左侧新建或选择一个对话，基于你的本地文档获取答案</p>
          <textarea
            ref={inputRef}
            className="kb-chat-input-bar__textarea"
            style={{ width: 400, marginTop: 16 }}
            placeholder="输入问题，回车发送..."
            rows={2}
            onKeyDown={handleKeyDown}
          />
          <p style={{ fontSize: 12, color: '#bbb', marginTop: 8 }}>
            新对话将自动创建 · DeepSeek 驱动
          </p>
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
          <div className="kb-chat-main__empty">
            <p>开始提问吧</p>
          </div>
        )}
        {messages.map((msg: KnowledgeMessage) => (
          <div key={msg.id} className={`kb-message kb-message--${msg.role === 'USER' ? 'user' : 'assistant'}`}>
            <div className="kb-message__avatar">{msg.role === 'USER' ? 'U' : 'AI'}</div>
            <div>
              <div className="kb-message__bubble">
                <KnowledgeMarkdown text={msg.content} />
              </div>
              {msg.citations && msg.citations.length > 0 && (
                <div className="kb-message__citations">
                  {msg.citations.map((c, i) => (
                    <span key={i} className="kb-message__citation" role="button" tabIndex={0}
                      onClick={() => { window.location.hash = `#/docs?documentId=${encodeURIComponent(c.documentId)}`; }}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); window.location.hash = `#/docs?documentId=${encodeURIComponent(c.documentId)}`; } }}>
                      {c.title}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        {streaming && (
          <div className="kb-message kb-message--assistant">
            <div className="kb-message__avatar">AI</div>
            <div>
              <div className="kb-message__bubble">
                <KnowledgeMarkdown text={streamingContent || '思考中...'} />
                {streamingContent && <span className="kb-streaming-indicator" />}
              </div>
              {streamingCitations.length > 0 && (
                <div className="kb-message__citations">
                  {streamingCitations.map((c, i) => (
                    <span key={i} className="kb-message__citation" role="button" tabIndex={0}
                      onClick={() => { window.location.hash = `#/docs?documentId=${encodeURIComponent(c.documentId)}`; }}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); window.location.hash = `#/docs?documentId=${encodeURIComponent(c.documentId)}`; } }}>
                      {c.title}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
        {error && (
          <div className="kb-message kb-message--assistant">
            <div className="kb-message__bubble" style={{ background: '#fff3f3', color: '#e65050', border: '1px solid #fdd' }}>
              {error}
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>
      <div className="kb-chat-input-bar">
        <textarea
          ref={inputRef}
          className="kb-chat-input-bar__textarea"
          placeholder={streaming ? '等待回复完成...' : '输入问题，Enter 发送，Shift+Enter 换行'}
          rows={1}
          disabled={streaming}
          onKeyDown={handleKeyDown}
        />
        {streaming ? (
          <button className="kb-chat-input-bar__stop" onClick={stop} style={{
            padding: '8px 18px', borderRadius: 8, border: '1px solid #e65050',
            background: '#fff', color: '#e65050', cursor: 'pointer', fontWeight: 500,
          }}>
            停止
          </button>
        ) : (
          <button className="kb-chat-input-bar__send" onClick={handleSendClick} style={{
            padding: '8px 18px', borderRadius: 8, border: 0,
            background: '#1456f0', color: '#fff', cursor: 'pointer', fontWeight: 500,
          }}>
            发送
          </button>
        )}
      </div>
    </div>
  );
}
