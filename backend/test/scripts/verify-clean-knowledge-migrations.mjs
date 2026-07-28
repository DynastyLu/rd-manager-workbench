import { execFile } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { userInfo } from 'node:os'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const SAFE_DATABASE_PREFIX = 'rdmw_verify_'

async function applicationDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL
  const envText = await readFile(new URL('../../.env', import.meta.url), 'utf8')
  const line = envText.split(/\r?\n/).find((entry) => entry.trim().startsWith('DATABASE_URL='))
  if (!line) throw new Error('DATABASE_URL is required')
  const rawValue = line.slice(line.indexOf('=') + 1).trim()
  return rawValue.replace(/^(['"])(.*)\1$/, '$2')
}

function databaseConnection(sourceUrl, databaseName) {
  const url = new URL(sourceUrl)
  url.pathname = `/${databaseName}`
  url.searchParams.delete('schema')
  return url.toString()
}

function localAdminConnection(sourceUrl) {
  const url = new URL(sourceUrl)
  url.username = userInfo().username
  url.password = ''
  return url.toString()
}

async function psql(connectionUrl, sql) {
  const result = await execFileAsync('psql', [
    connectionUrl,
    '--no-psqlrc',
    '--tuples-only',
    '--no-align',
    '--set',
    'ON_ERROR_STOP=1',
    '--command',
    sql,
  ], { maxBuffer: 10 * 1024 * 1024 })
  return result.stdout.trim()
}

const sourceUrl = await applicationDatabaseUrl()
const source = new URL(sourceUrl)
const databaseOwner = decodeURIComponent(source.username)
if (!/^[A-Za-z0-9_]{1,63}$/.test(databaseOwner)) {
  throw new Error('DATABASE_URL must contain a safe PostgreSQL owner role')
}
const databaseName = `${SAFE_DATABASE_PREFIX}${Date.now()}_${randomBytes(4).toString('hex')}`
if (!databaseName.startsWith(SAFE_DATABASE_PREFIX)) {
  throw new Error('Refusing to manage a database outside the verifier namespace')
}
const isLocalDatabase = ['127.0.0.1', 'localhost', ''].includes(source.hostname)
const adminSourceUrl = process.env.DATABASE_ADMIN_URL
  || (isLocalDatabase ? localAdminConnection(sourceUrl) : sourceUrl)
const adminDatabaseUrl = databaseConnection(adminSourceUrl, 'postgres')
const verificationDatabaseUrl = databaseConnection(adminSourceUrl, databaseName)

try {
  await psql(adminDatabaseUrl, `CREATE DATABASE "${databaseName}" OWNER "${databaseOwner}"`)
  await execFileAsync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
    cwd: new URL('../..', import.meta.url),
    env: { ...process.env, DATABASE_URL: verificationDatabaseUrl },
    maxBuffer: 20 * 1024 * 1024,
  })

  const extensions = (await psql(
    verificationDatabaseUrl,
    "SELECT extname FROM pg_extension WHERE extname IN ('vector', 'pg_trgm') ORDER BY extname",
  )).split('\n').filter(Boolean)
  if (!extensions.includes('vector') || !extensions.includes('pg_trgm')) {
    throw new Error(`Missing knowledge extensions: ${extensions.join(', ')}`)
  }

  const vectorType = await psql(
    verificationDatabaseUrl,
    `SELECT format_type(a.atttypid, a.atttypmod)
     FROM pg_attribute a
     JOIN pg_class c ON c.oid = a.attrelid
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'app' AND c.relname = 'document_chunks'
       AND a.attname = 'embedding' AND NOT a.attisdropped`,
  )
  if (vectorType !== 'vector(384)') {
    throw new Error(`Unexpected embedding column type: ${vectorType || 'missing'}`)
  }

  const hnswIndex = await psql(
    verificationDatabaseUrl,
    `SELECT indexname FROM pg_indexes
     WHERE schemaname = 'app' AND tablename = 'document_chunks'
       AND indexdef ILIKE '%USING hnsw%' LIMIT 1`,
  )
  if (!hnswIndex) throw new Error('Knowledge HNSW index is missing')

  const jobColumns = (await psql(
    verificationDatabaseUrl,
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = 'app' AND table_name = 'knowledge_index_jobs'
     ORDER BY column_name`,
  )).split('\n').filter(Boolean)
  for (const required of ['status', 'total_files', 'processed_files', 'failed_files', 'errors']) {
    if (!jobColumns.includes(required)) throw new Error(`Knowledge job column is missing: ${required}`)
  }

  console.log(`Clean knowledge migration verification passed (${databaseName})`)
} finally {
  if (!databaseName.startsWith(SAFE_DATABASE_PREFIX)) {
    throw new Error('Refusing to drop a database outside the verifier namespace')
  }
  await psql(
    adminDatabaseUrl,
    `SELECT pg_terminate_backend(pid) FROM pg_stat_activity
     WHERE datname = '${databaseName}' AND pid <> pg_backend_pid()`,
  )
  await psql(adminDatabaseUrl, `DROP DATABASE IF EXISTS "${databaseName}"`)
}
