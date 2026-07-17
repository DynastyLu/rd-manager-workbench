export const APPROVED_DATABASE_NAMES = [
  'rd_manager_workbench',
  'rd_manager_workbench_test',
] as const

export const APPROVED_DATABASE_ROLE = 'rd_manager_workbench_app'
export const APPROVED_DATABASE_SCHEMA = 'app'

export type ApprovedDatabaseName = (typeof APPROVED_DATABASE_NAMES)[number]

export interface BootstrapPlan {
  databaseName: ApprovedDatabaseName
  roleName: typeof APPROVED_DATABASE_ROLE
  schemaName: typeof APPROVED_DATABASE_SCHEMA
}

interface BootstrapPlanInput {
  databaseName: string
  roleName: string
}

const SAFE_IDENTIFIER_PATTERN = /^[a-z][a-z0-9_]*$/

export function createBootstrapPlan(input: BootstrapPlanInput): BootstrapPlan {
  if (!isApprovedDatabaseName(input.databaseName)) {
    throw new Error('Unapproved database name')
  }

  if (input.roleName !== APPROVED_DATABASE_ROLE) {
    throw new Error('Unapproved database role')
  }

  return {
    databaseName: input.databaseName,
    roleName: APPROVED_DATABASE_ROLE,
    schemaName: APPROVED_DATABASE_SCHEMA,
  }
}

export function quoteIdentifier(identifier: string): string {
  if (!SAFE_IDENTIFIER_PATTERN.test(identifier)) {
    throw new Error('Unsafe SQL identifier')
  }

  return `"${identifier}"`
}

function isApprovedDatabaseName(databaseName: string): databaseName is ApprovedDatabaseName {
  return APPROVED_DATABASE_NAMES.some((approvedName) => approvedName === databaseName)
}
