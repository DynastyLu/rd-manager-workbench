import { readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from '@jest/globals'

interface BackendPackage {
  scripts: Record<string, string | undefined>
}

const backendRoot = path.resolve(__dirname, '../..')
const workspaceRoot = path.resolve(backendRoot, '../..')

describe('backend bootstrap reproducibility', () => {
  it('ships the single baseline metadata model in the app schema', () => {
    const schema = readFileSync(path.join(backendRoot, 'prisma/schema.prisma'), 'utf8')

    expect(schema).toContain('provider = "prisma-client-js"')
    expect(schema).toContain('provider = "postgresql"')
    expect(schema).toContain('url      = env("DATABASE_URL")')
    expect(schema).toContain('schemas  = ["app"]')
    expect(schema.match(/^model\s/gmu)).toHaveLength(1)
    expect(schema).toContain('model AppMetadata')
    expect(schema).toContain('value     Json')
    expect(schema).toContain('@db.Timestamptz(6)')
    expect(schema).toContain('@@schema("app")')
    expect(schema).toContain('@@map("app_metadata")')
  })

  it('generates Prisma Client before every command that compiles backend code', () => {
    const packageJson = JSON.parse(
      readFileSync(path.join(backendRoot, 'package.json'), 'utf8'),
    ) as BackendPackage

    expect(packageJson.scripts['prisma:generate']).toContain('--schema prisma/schema.prisma')
    expect(packageJson.scripts).toMatchObject({
      prebuild: 'pnpm prisma:generate',
      pretypecheck: 'pnpm prisma:generate',
      'pretest:unit': 'pnpm prisma:generate',
      'pretest:integration': 'pnpm prisma:generate',
      'pretest:e2e': 'pnpm prisma:generate',
    })
  })

  it('documents all non-secret local environment inputs', () => {
    const exampleEnvironment = readFileSync(path.join(workspaceRoot, '.env.example'), 'utf8')

    expect(exampleEnvironment).toContain('NODE_ENV=development')
    expect(exampleEnvironment).toContain('DATABASE_ADMIN_URL=postgresql://dynastylu@127.0.0.1')
    expect(exampleEnvironment).toContain('DATABASE_NAME=rd_manager_workbench')
    expect(exampleEnvironment).toContain('DATABASE_ROLE=rd_manager_workbench_app')
    expect(exampleEnvironment).toContain('INTERNAL_API_TOKEN=development-only-')
    expect(exampleEnvironment).toContain('APP_DATA_DIR=/tmp/rd-manager-workbench')
    expect(exampleEnvironment).toContain('FILES_DIR=/tmp/rd-manager-workbench/files')
    expect(exampleEnvironment).toContain('LOG_LEVEL=info')
    expect(exampleEnvironment).toContain('Electron injects a new random token at runtime')
  })
})
