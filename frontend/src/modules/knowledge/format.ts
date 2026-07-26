/** Extract 2+ character terms from a question for highlighting */
export function extractHighlightTerms(question: string): string[] {
  const matched = String(question || '').match(/[一-龥A-Za-z0-9-]{2,}/g) || [];
  return Array.from(new Set(matched)).sort((a, b) => b.length - a.length);
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export interface TextSegment { text: string; highlight: boolean }

/** Split text by highlight terms. Returns segments with highlight flag. */
export function highlightTextSegments(text: string, terms: string[]): TextSegment[] {
  if (!text || !terms.length) return [{ text, highlight: false }];
  const regex = new RegExp(`(${terms.map(escapeRegExp).join('|')})`, 'gi');
  const parts = text.split(regex);
  return parts.filter(Boolean).map((part) => ({
    text: part,
    highlight: terms.some((t) => t.toLowerCase() === part.toLowerCase()),
  }));
}

/** Copy text to clipboard and call onCopied callback on success */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback for older browsers
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  }
}
