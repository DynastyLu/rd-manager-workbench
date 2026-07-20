import { Fragment, type ReactNode } from 'react'

import type { SearchMatch, SearchMatchField } from '@/modules/workbench/api/search'

interface SearchHighlightProps {
  text: string
  field: SearchMatchField
  matches: SearchMatch[]
}

interface Range {
  start: number
  end: number
}

function normalizedRanges(
  textLength: number,
  field: SearchMatchField,
  matches: SearchMatch[]
): Range[] {
  const ranges = matches
    .filter((match) => match.field === field && match.start < textLength && match.end > match.start)
    .map((match) => ({ start: Math.max(0, match.start), end: Math.min(textLength, match.end) }))
    .sort((left, right) => left.start - right.start || left.end - right.end)

  const merged: Range[] = []
  for (const range of ranges) {
    const previous = merged[merged.length - 1]
    if (previous && range.start <= previous.end) {
      previous.end = Math.max(previous.end, range.end)
    } else {
      merged.push({ ...range })
    }
  }
  return merged
}

export function SearchHighlight({ text, field, matches }: SearchHighlightProps) {
  const characters = Array.from(text)
  const ranges = normalizedRanges(characters.length, field, matches)
  if (ranges.length === 0) return text

  const content: ReactNode[] = []
  let cursor = 0
  for (const range of ranges) {
    if (range.start > cursor) {
      content.push(
        <Fragment key={`text-${cursor}`}>{characters.slice(cursor, range.start).join('')}</Fragment>
      )
    }
    content.push(
      <mark
        key={`mark-${range.start}`}
        className="rounded-sm bg-[var(--semi-color-warning-light-default)] px-0.5 text-inherit"
      >
        {characters.slice(range.start, range.end).join('')}
      </mark>
    )
    cursor = range.end
  }
  if (cursor < characters.length) {
    content.push(<Fragment key={`text-${cursor}`}>{characters.slice(cursor).join('')}</Fragment>)
  }
  return content
}
