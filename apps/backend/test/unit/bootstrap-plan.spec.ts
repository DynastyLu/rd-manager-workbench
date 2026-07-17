import fs from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from '@jest/globals'

import {
  APPROVED_DATABASE_NAMES,
  APPROVED_DATABASE_ROLE,
  createBootstrapPlan,
  quoteIdentifier,
} from '../../src/infrastructure/database/bootstrap-plan'

describe('createBootstrapPlan', () => {
  it.each(APPROVED_DATABASE_NAMES)(
    'builds the fixed app schema plan for approved database %s',
    (databaseName) => {
      expect(
        createBootstrapPlan({
          databaseName,
          roleName: APPROVED_DATABASE_ROLE,
        }),
      ).toEqual({
        databaseName,
        roleName: 'rd_manager_workbench_app',
        schemaName: 'app',
      })
    },
  )

  it.each([
    'postgres;delete database postgres',
    'bad-name',
    '',
    'postgres',
    'rd_manager_workbench_staging',
    'RD_MANAGER_WORKBENCH',
  ])('rejects unapproved database identifier %s', (databaseName) => {
    expect(() => createBootstrapPlan({ databaseName, roleName: APPROVED_DATABASE_ROLE })).toThrow(
      'database',
    )
  })

  it.each(['postgres', 'rd_manager_workbench_owner', '', 'role;select 1'])(
    'rejects unapproved role identifier %s',
    (roleName) => {
      expect(() =>
        createBootstrapPlan({ databaseName: 'rd_manager_workbench', roleName }),
      ).toThrow()
    },
  )

  it('requires the only approved test database to use the test suffix', () => {
    expect(APPROVED_DATABASE_NAMES.filter((name) => name.endsWith('_test'))).toEqual([
      'rd_manager_workbench_test',
    ])
  })
})

describe('quoteIdentifier', () => {
  it('quotes a validated lowercase snake case identifier', () => {
    expect(quoteIdentifier('rd_manager_workbench_app')).toBe('"rd_manager_workbench_app"')
  })

  it.each(['MixedCase', 'contains-hyphen', 'semi;colon', 'has space', '', '_leading'])(
    'rejects unsafe identifier %s',
    (identifier) => {
      expect(() => quoteIdentifier(identifier)).toThrow('identifier')
    },
  )
})

describe('database bootstrap command safety', () => {
  it('does not contain destructive database or role commands', () => {
    const backendRoot = path.resolve(__dirname, '../..')
    const sourceFiles = [
      ...collectFiles(path.join(backendRoot, 'src')),
      ...collectFiles(path.join(backendRoot, 'scripts')),
      ...collectFiles(path.join(backendRoot, 'prisma')),
      path.join(backendRoot, 'package.json'),
      path.resolve(backendRoot, '../../package.json'),
    ]
    const forbiddenFragments = [
      ['DROP', 'DATABASE'].join(' '),
      ['DROP', 'ROLE'].join(' '),
      ['db', 'push'].join(' '),
      ['migrate', 'reset'].join(' '),
    ]

    for (const filePath of sourceFiles) {
      const contents = fs.readFileSync(filePath, 'utf8').toLowerCase()

      for (const fragment of forbiddenFragments) {
        expect(contents).not.toContain(fragment.toLowerCase())
      }
    }
  })
})

function collectFiles(directoryPath: string): string[] {
  if (!fs.existsSync(directoryPath)) {
    return []
  }

  return fs.readdirSync(directoryPath, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directoryPath, entry.name)
    return entry.isDirectory() ? collectFiles(entryPath) : [entryPath]
  })
}
