import { execSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const rootDir = process.cwd()
const outputDir = process.argv[2] ?? 'dist'
const packageJsonPath = resolve(rootDir, 'package.json')
const versionJsonPath = resolve(rootDir, outputDir, 'version.json')

const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'))

function readGitSha() {
  if (process.env.GITHUB_SHA) {
    return process.env.GITHUB_SHA.slice(0, 12)
  }

  try {
    return execSync('git rev-parse --short=12 HEAD', {
      cwd: rootDir,
      stdio: ['ignore', 'pipe', 'ignore'],
      encoding: 'utf8',
    }).trim()
  } catch {
    return 'unknown'
  }
}

const buildInfo = {
  version: packageJson.version ?? '0.0.0',
  commit: readGitSha(),
  buildTime: new Date().toISOString(),
}

mkdirSync(resolve(rootDir, outputDir), { recursive: true })
writeFileSync(versionJsonPath, `${JSON.stringify(buildInfo, null, 2)}\n`)
