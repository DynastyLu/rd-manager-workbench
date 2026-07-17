const { spawnSync } = require('node:child_process')
const path = require('node:path')

const DEVELOPMENT_DATABASE_URL =
  'postgresql://rd_manager_workbench_app@127.0.0.1:5432/rd_manager_workbench?schema=app'
const schemaFlagIndex = process.argv.indexOf('--schema')
const schemaArgument = process.argv[schemaFlagIndex + 1]

if (schemaFlagIndex < 0 || !schemaArgument) {
  process.stderr.write('Prisma generation requires an explicit --schema path.\n')
  process.exitCode = 1
} else {
  const prismaCli = require.resolve('prisma/build/index.js')
  const schemaPath = path.resolve(process.cwd(), schemaArgument)
  const result = spawnSync(process.execPath, [prismaCli, 'generate', '--schema', schemaPath], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      DATABASE_URL: process.env.DATABASE_URL || DEVELOPMENT_DATABASE_URL,
    },
    stdio: 'inherit',
  })

  if (result.error) {
    throw result.error
  }

  process.exitCode = result.status ?? 1
}
