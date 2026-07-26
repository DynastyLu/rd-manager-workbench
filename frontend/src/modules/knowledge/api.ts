import { request } from '@/lib/http';
import type { KnowledgeSession, IndexStatus } from './types';

const API_BASE = import.meta.env.DEV ? 'http://127.0.0.1:4311/api' : '';

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
  return fetch(`${API_BASE}/knowledge/chat/${sessionId}/messages`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question }), signal,
  });
}
export function getIndexStatus() { return request<IndexStatus>('/knowledge/reindex/status'); }
export function triggerReindex() {
  return request<{ jobId: string }>('/knowledge/reindex', { method: 'POST' });
}
