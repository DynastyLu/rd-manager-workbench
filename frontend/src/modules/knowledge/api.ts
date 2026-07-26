import { request, apiUrl } from '@/lib/http';
import type { KnowledgeSession, IndexStatus } from './types';

export function listSessions() { return request<KnowledgeSession[]>('/knowledge/sessions'); }
export function createSession(question: string) {
  return request<KnowledgeSession>('/knowledge/sessions', { method: 'POST', body: JSON.stringify({ question }) });
}
export function getSession(id: string) {
  return request<KnowledgeSession>(`/knowledge/sessions/${encodeURIComponent(id)}`);
}
export function archiveSession(id: string) {
  return request<void>(`/knowledge/sessions/${encodeURIComponent(id)}`, { method: 'DELETE' });
}
export function chatStream(sessionId: string, question: string, signal?: AbortSignal) {
  return fetch(apiUrl(`/knowledge/chat/${sessionId}/messages`), {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question }), signal,
  });
}
export function getIndexStatus() { return request<IndexStatus>('/knowledge/reindex/status'); }
export function triggerReindex() {
  return request<{ jobId: string }>('/knowledge/reindex', { method: 'POST' });
}
