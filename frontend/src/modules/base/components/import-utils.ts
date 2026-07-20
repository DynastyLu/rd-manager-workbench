export function uniqueImportFieldKey(existing: Set<string>, base: string) {
  if (!existing.has(base)) return base
  for (let suffix = 2; ; suffix += 1) {
    const candidate = `${base}_${suffix}`
    if (!existing.has(candidate)) return candidate
  }
}
