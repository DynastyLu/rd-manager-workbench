export function buildLocalSearchResultLink(currentHref: string, path: string): string {
  const url = new URL(currentHref)
  url.hash = path
  return url.toString()
}
