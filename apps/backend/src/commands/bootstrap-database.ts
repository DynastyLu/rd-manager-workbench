import path from 'node:path'

import {
  BootstrapEnvironmentError,
  loadBootstrapEnvironment,
} from '../infrastructure/database/bootstrap-env'
import { bootstrapDatabase } from '../infrastructure/database/bootstrap-database'

export async function runDatabaseBootstrap(): Promise<void> {
  const environment = loadBootstrapEnvironment({
    workspaceRoot: path.resolve(__dirname, '../../../..'),
    processEnvironment: process.env,
  })

  await bootstrapDatabase({
    databaseAdminUrl: environment.DATABASE_ADMIN_URL,
    databaseUrl: environment.DATABASE_URL,
    databaseName: environment.DATABASE_NAME,
    roleName: environment.DATABASE_ROLE,
  })
}

export function formatBootstrapFailure(error: unknown): string {
  const errorCode = error instanceof BootstrapEnvironmentError ? error.code : 'BOOTSTRAP_FAILED'
  return `Database bootstrap failed [${errorCode}].`
}

if (require.main === module) {
  void runDatabaseBootstrap()
    .then(() => {
      process.stdout.write('Database bootstrap completed.\n')
    })
    .catch((error: unknown) => {
      process.stderr.write(`${formatBootstrapFailure(error)}\n`)
      process.exitCode = 1
    })
}
