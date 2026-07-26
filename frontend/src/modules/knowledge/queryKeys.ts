export const knowledgeQueryKeys = {
  all: ['knowledge'] as const,
  sessions: ['knowledge', 'sessions'] as const,
  session: (id: string) => ['knowledge', 'session', id] as const,
  indexStatus: ['knowledge', 'index-status'] as const,
};
