import { SearchCandidate, SearchHit, SearchMatch } from './search.types';

const MIN_QUERY_LENGTH = 2;
const MAX_QUERY_LENGTH = 100;
const MAX_SNIPPET_LENGTH = 240;

export function normalizeSearchQuery(value: string): string {
  const normalized = value.trim().replace(/\s+/gu, ' ');
  const length = Array.from(normalized).length;
  if (length < MIN_QUERY_LENGTH || length > MAX_QUERY_LENGTH) {
    throw new Error('Search query must be between 2 and 100 characters');
  }
  return normalized;
}

export function scoreSearchCandidate(input: {
  query: string;
  title: string;
  snippet: string | null;
}): number {
  const query = input.query.toLocaleLowerCase();
  const title = input.title.toLocaleLowerCase();
  const snippet = input.snippet?.toLocaleLowerCase() ?? '';

  let score = 0;
  let matchedFields = 0;
  if (title === query) {
    score += 400;
    matchedFields += 1;
  } else if (title.startsWith(query)) {
    score += 300;
    matchedFields += 1;
  } else if (title.includes(query)) {
    score += 200;
    matchedFields += 1;
  }
  if (snippet.includes(query)) {
    score += 100;
    matchedFields += 1;
  }
  if (matchedFields > 1) score += 10;
  return score;
}

export function buildSearchMatches(query: string, value: string): Array<Omit<SearchMatch, 'field'>> {
  const queryCharacters = Array.from(query.toLocaleLowerCase());
  const valueCharacters = Array.from(value);
  const normalizedValueCharacters = Array.from(value.toLocaleLowerCase());
  if (queryCharacters.length === 0 || normalizedValueCharacters.length !== valueCharacters.length) {
    return [];
  }

  const matches: Array<Omit<SearchMatch, 'field'>> = [];
  for (let index = 0; index <= normalizedValueCharacters.length - queryCharacters.length; ) {
    const isMatch = queryCharacters.every(
      (character, offset) => normalizedValueCharacters[index + offset] === character,
    );
    if (!isMatch) {
      index += 1;
      continue;
    }
    matches.push({ start: index, end: index + queryCharacters.length });
    index += queryCharacters.length;
  }
  return matches;
}

export function buildSearchSnippet(
  query: string,
  values: Array<string | null | undefined>,
): string | null {
  const text = values.filter((value): value is string => Boolean(value?.trim())).join(' · ');
  if (!text) return null;

  const characters = Array.from(text);
  if (characters.length <= MAX_SNIPPET_LENGTH) return text;

  const match = buildSearchMatches(query, text)[0];
  if (!match) return characters.slice(0, MAX_SNIPPET_LENGTH).join('');

  const contextBefore = Math.floor((MAX_SNIPPET_LENGTH - (match.end - match.start)) / 2);
  let start = Math.max(0, match.start - contextBefore);
  let end = Math.min(characters.length, start + MAX_SNIPPET_LENGTH);
  start = Math.max(0, end - MAX_SNIPPET_LENGTH);
  end = Math.min(characters.length, start + MAX_SNIPPET_LENGTH);
  return characters.slice(start, end).join('');
}

export function compareSearchHits(left: SearchHit, right: SearchHit): number {
  if (left.score !== right.score) return right.score - left.score;
  const updatedAtOrder = Date.parse(right.updatedAt) - Date.parse(left.updatedAt);
  if (updatedAtOrder !== 0) return updatedAtOrder;
  const typeOrder = left.type.localeCompare(right.type);
  return typeOrder !== 0 ? typeOrder : left.id.localeCompare(right.id);
}

export function limitSearchCandidates(
  query: string,
  candidates: SearchCandidate[],
  limit = 100,
): SearchCandidate[] {
  return [...candidates]
    .sort((left, right) => {
      const scoreOrder =
        scoreSearchCandidate({ query, title: right.title, snippet: right.snippet }) -
        scoreSearchCandidate({ query, title: left.title, snippet: left.snippet });
      if (scoreOrder !== 0) return scoreOrder;
      const updatedAtOrder = right.updatedAt.getTime() - left.updatedAt.getTime();
      if (updatedAtOrder !== 0) return updatedAtOrder;
      const typeOrder = left.type.localeCompare(right.type);
      return typeOrder !== 0 ? typeOrder : left.id.localeCompare(right.id);
    })
    .slice(0, limit);
}
