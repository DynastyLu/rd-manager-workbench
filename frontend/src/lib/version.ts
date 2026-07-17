/** Version injected at build time by vite.config.ts define.__APP_VERSION__ */
const CURRENT_VERSION: string = __APP_VERSION__

interface VersionFile {
  version: string
  buildTime: string
}

/**
 * Fetches /version.json and compares with current build version.
 * Returns true if a newer version is deployed.
 */
export async function checkForUpdate(): Promise<boolean> {
  try {
    const res = await fetch(`/version.json?t=${Date.now()}`)
    if (!res.ok) return false
    const { version } = (await res.json()) as VersionFile
    return version !== CURRENT_VERSION
  } catch {
    return false
  }
}
