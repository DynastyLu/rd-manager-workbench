export const SEARCH_TYPES = [
  'PROJECT',
  'TASK',
  'APPLICATION_CASE',
  'MEETING',
  'DOCUMENT',
  'FILE',
  'RISK',
  'ISSUE',
  'DECISION',
  'PARTNER',
  'COMMUNICATION',
  'NON_PROJECT_RD',
  'INTELLIGENCE_ITEM',
  'BASE_RECORD',
] as const;

export type SearchType = (typeof SEARCH_TYPES)[number];

export type SearchAction =
  | 'OPEN'
  | 'COPY_LINK'
  | 'COMPLETE_TASK'
  | 'REOPEN_TASK'
  | 'TOGGLE_DOCUMENT_FAVORITE'
  | 'CLOSE_RISK';

export interface SearchMatch {
  field: 'title' | 'snippet';
  start: number;
  end: number;
}

export interface SearchCandidate {
  type: SearchType;
  id: string;
  title: string;
  snippet: string | null;
  path: string;
  updatedAt: Date;
  actions?: SearchAction[];
}

export interface SearchHit {
  type: SearchType;
  id: string;
  title: string;
  snippet: string | null;
  path: string;
  updatedAt: string;
  score: number;
  matches: SearchMatch[];
  actions: SearchAction[];
}

export interface SearchAdapter {
  readonly types: readonly SearchType[];
  search(query: string, types: readonly SearchType[]): Promise<SearchCandidate[]>;
}

export interface SearchGroup {
  type: SearchType;
  count: number;
}

export interface SearchPartialFailure {
  types: SearchType[];
  code: 'SEARCH_PARTIAL_FAILURE';
  message: string;
}

export interface GlobalSearchResult {
  data: SearchHit[];
  groups: SearchGroup[];
  meta: { page: number; pageSize: number; total: number };
  partialFailures: SearchPartialFailure[];
}
