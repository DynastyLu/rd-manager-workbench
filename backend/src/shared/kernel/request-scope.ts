export const requestScopes = ['platform', 'tenant'] as const;

export type RequestScope = (typeof requestScopes)[number];

export function isRequestScope(value: unknown): value is RequestScope {
  return typeof value === 'string' && (requestScopes as readonly string[]).includes(value);
}
