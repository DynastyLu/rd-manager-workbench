export function estimateTokens(text: string): number {
  const chineseChars = (text.match(/[一-鿿]/g) || []).length;
  const otherChars = text.length - chineseChars;
  return Math.ceil(chineseChars / 1.5 + otherChars / 4);
}

export function splitByParagraphs(text: string): string[] {
  return text.split(/\n\n+/).filter((p) => p.trim().length > 0);
}
