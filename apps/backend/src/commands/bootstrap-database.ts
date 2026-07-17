import { parseEnvironment } from '../infrastructure/config/env.schema'
import { bootstrapDatabase } from '../infrastructure/database/bootstrap-database'

export async function runDatabaseBootstrap(): Promise<void> {
  const environment = parseEnvironment(process.env)

  await bootstrapDatabase({
    databaseAdminUrl: environment.DATABASE_ADMIN_URL,
    databaseUrl: environment.DATABASE_URL,
    databaseName: environment.DATABASE_NAME,
    roleName: environment.DATABASE_ROLE,
  })
}

if (require.main === module) {
  void runDatabaseBootstrap()
    .then(() => {
      process.stdout.write('Database bootstrap completed.\n')
    })
    .catch(() => {
      process.stderr.write('Database bootstrap failed.\n')
      process.exitCode = 1
    })
}
