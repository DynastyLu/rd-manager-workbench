import { useState, useRef, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, Typography, Spin, Empty } from '@douyinfe/semi-ui';
import { chatStream, createSession, getSession } from '../api';
import { knowledgeQueryKeys } from '../queryKeys';
import { KnowledgeChatInput } from './KnowledgeChatInput';
import { KnowledgeMarkdown } from './KnowledgeMarkdown';
import type { KnowledgeMessage, ChunkCitation } from '../types';

interface SseToken { content: string; index: number }

interface Props { sessionId: string | null; onSessionCreated: (id: string) => void; }

export function KnowledgeChatPanel({ sessionId, onSessionCreated }: Props) {
  const [streamingContent, setStreamingContent] = useState('');
  const [streamingCitations, setStreamingCitations] = useState<ChunkCitation[]>([]);
  const [streaming, setStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const qc = useQueryClient();

  const { data: session, isLoading } = useQuery({
    queryKey: knowledgeQueryKeys.session(sessionId ?? ''),
    queryFn: () => getSession(sessionId!),
    enabled: !!sessionId,
  });

  const send = useCallback(async (question: string) => {
    let sid = sessionId;
    if (!sid) {
      const s = await createSession(question);
      sid = s.id;
      onSessionCreated(s.id);
    }

    setStreaming(true);
    setStreamingContent('');
    setStreamingCitations([]);
    abortRef.current = new AbortController();

    try {
      const resp = await chatStream(sid, question, abortRef.current.signal);
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
          if (line.startsWith('event: ')) continue;
          if (!line.startsWith('data: ')) continue;
          const raw = line.slice(6);
          try {
            const parsed = JSON.parse(raw) as SseToken | ChunkCitation[] | { finished: boolean };
            if (typeof parsed === 'object' && parsed !== null && 'content' in parsed) {
              const token = parsed as unknown as SseToken;
              content += token.content;
              setStreamingContent(content);
            } else if (Array.isArray(parsed) && parsed.length > 0 && 'documentId' in (parsed[0] ?? {})) {
              setStreamingCitations(parsed as unknown as ChunkCitation[]);
            }
          } catch { /* skip unparseable chunks */ }
        }
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name !== 'AbortError') {
        console.error('Chat stream error', err);
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

  const handleSend = useCallback((text: string) => { void send(text); }, [send]);
  const handleStop = useCallback(() => { stop(); }, [stop]);

  if (!sessionId) {
    return (
      <div className="kb-chat-panel" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        <Empty title="知识库问答" description="在左侧新建对话，开始用自然语言提问">
          <KnowledgeChatInput onSend={handleSend} onStop={handleStop} streaming={streaming} />
        </Empty>
      </div>
    );
  }

  if (isLoading) return <Spin />;

  const messages = session?.messages ?? [];

  return (
    <div className="kb-chat-panel">
      <div className="kb-messages" style={{ flex: 1, overflow: 'auto', padding: 16 }}>
        {messages.map((msg: KnowledgeMessage) => (
          <div key={msg.id} style={{ marginBottom: 16, textAlign: msg.role === 'USER' ? 'right' : 'left' }}>
            <Card
              style={{
                display: 'inline-block', maxWidth: '80%', textAlign: 'left',
                background: msg.role === 'USER' ? 'var(--semi-color-primary-light-default)' : undefined,
              }}
            >
              <Typography.Text>{msg.role === 'USER' ? '你' : 'AI'}</Typography.Text>
              <KnowledgeMarkdown text={msg.content} />
              {msg.citations?.map((c, i) => (
                <Typography.Text key={i} size="small" type="tertiary" style={{ display: 'block' }}>
                  参考：{c.title}
                </Typography.Text>
              ))}
            </Card>
          </div>
        ))}
        {streaming && (
          <div style={{ marginBottom: 16, textAlign: 'left' }}>
            <Card style={{ display: 'inline-block', maxWidth: '80%' }}>
              <Typography.Text>AI</Typography.Text>
              <KnowledgeMarkdown text={streamingContent} />
              {streamingCitations.map((c, i) => (
                <Typography.Text key={i} size="small" type="tertiary" style={{ display: 'block' }}>
                  参考：{c.title}
                </Typography.Text>
              ))}
              <Spin size="small" style={{ marginLeft: 8 }} />
            </Card>
          </div>
        )}
      </div>
      <div style={{ padding: 12, borderTop: '1px solid var(--semi-color-border)' }}>
        <KnowledgeChatInput onSend={handleSend} onStop={handleStop} streaming={streaming} />
      </div>
    </div>
  );
}
