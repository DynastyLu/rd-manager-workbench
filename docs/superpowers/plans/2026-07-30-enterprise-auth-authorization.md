# Enterprise Authentication and Authorization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add enterprise-grade login, rotating refresh tokens, user/role/permission administration, backend-enforced data scopes, historical ownership migration, and project-scoped progress approval to the existing workbench.

**Architecture:** Add a dedicated NestJS IAM module that authenticates every non-public request and stores the authenticated principal in the existing async request context. Functional authorization uses stable permission codes; record visibility uses centralized scope builders that are applied inside business queries. The React app keeps the access token in memory, restores sessions through an HttpOnly refresh cookie, queues concurrent 401 retries, and renders navigation and actions from the server-issued permission snapshot.

**Tech Stack:** NestJS 10, Prisma 6/PostgreSQL, `@nestjs/jwt`, `@node-rs/argon2`, `@nestjs/throttler`, cookie-parser, React 19, React Router 7, Zustand 5, TanStack Query 5, Semi UI, Vitest, Jest/Supertest, Playwright, Electron.

---

## Delivery rules

- Work directly in `/Users/dynastylu/Desktop/AICode/rd-manager-workbench`; do not create an isolated worktree because the user requires changes to remain visible in the primary workspace.
- Preserve unrelated dirty-worktree changes. Stage and commit only the files listed in the current task.
- Follow test-driven development: failing test, focused implementation, passing focused test, then commit.
- Do not enable ordinary-user login until historical ownership migration reports zero blocking records.
- Do not enforce authorization only in React. Every list, detail, write, download, search, export, Socket and NOVA path must be filtered by the backend.
- Use the one-time bootstrap flow only while the database contains zero users. Never ship a default password.

## File and module map

### Backend IAM boundary

- `backend/src/modules/iam/iam.module.ts`: composes authentication, authorization and administration.
- `backend/src/modules/iam/domain/permission-catalog.ts`: stable permission codes and built-in roles.
- `backend/src/modules/iam/application/password.service.ts`: Argon2id hashing and password policy.
- `backend/src/modules/iam/application/token.service.ts`: access/refresh token issuing, hashing, rotation and replay response.
- `backend/src/modules/iam/application/auth.service.ts`: login, bootstrap, refresh, logout, password change and session revocation.
- `backend/src/modules/iam/application/users.service.ts`: user lifecycle and employee binding.
- `backend/src/modules/iam/application/roles.service.ts`: roles, permission grants and safety invariants.
- `backend/src/modules/iam/application/authorization.service.ts`: functional grants and resolved data scopes.
- `backend/src/modules/iam/application/ownership-migration.service.ts`: historical ownership analysis and assignment.
- `backend/src/modules/iam/interface/http/*.controller.ts`: public auth, current-user and administrator APIs.
- `backend/src/modules/iam/interface/http/*.guard.ts`: global authentication and permission guards.
- `backend/src/modules/iam/interface/http/*.decorator.ts`: `@Public()` and `@RequirePermissions()`.
- `backend/src/modules/iam/interface/http/dto/*.ts`: validated IAM request contracts.
- `backend/src/modules/iam/domain/principal.ts`: authenticated principal and scope types.

### Frontend IAM boundary

- `frontend/src/modules/auth/api.ts`: login, refresh, current user, password and session calls.
- `frontend/src/modules/auth/types.ts`: authenticated user, permissions, roles, scopes and sessions.
- `frontend/src/modules/auth/store.ts`: in-memory access token and authenticated principal.
- `frontend/src/modules/auth/AuthProvider.tsx`: bootstrap refresh and session state.
- `frontend/src/modules/auth/RequireAuth.tsx`: login/first-password/403 route gates.
- `frontend/src/modules/auth/Permission.tsx`: declarative action visibility.
- `frontend/src/modules/auth/pages/*.tsx`: login, first password change and personal security.
- `frontend/src/modules/admin/*.tsx`: users, roles, permissions, audits and ownership migration.
- `frontend/src/lib/http.ts`: bearer token, CSRF header, single-flight refresh and request replay.

### Authorization integration boundary

- `backend/src/shared/kernel/request-context.ts`: adds the authenticated principal.
- `backend/src/infrastructure/context/request-context.service.ts`: exposes `requirePrincipal()`.
- `backend/src/modules/workbench/**`: applies permission decorators and scope-aware Prisma filters.
- `frontend/src/router/routes.ts`: adds public/protected/admin route metadata.
- `frontend/src/components/AppShell/WorkspaceNavigation.tsx`: filters navigation by permission.
- `frontend/src/components/AppShell/WorkspaceHeader.tsx`: account menu and current identity.

## Task 1: Add IAM dependencies and secure configuration

**Files:**
- Modify: `backend/package.json`
- Modify: `backend/src/infrastructure/config/env.schema.ts`
- Modify: `backend/.env.example`
- Test: `backend/test/unit/infrastructure/config/env.schema.spec.ts`

- [ ] **Step 1: Add failing configuration tests**

Add assertions that production rejects a missing or short JWT secret and that local development has explicit token lifetimes:

```ts
it('rejects an unsafe JWT secret outside test', () => {
  expect(() =>
    parseEnvironment({
      NODE_ENV: 'production',
      JWT_ACCESS_SECRET: 'short',
      JWT_ACCESS_TTL_MINUTES: '15',
      JWT_REFRESH_TTL_DAYS: '7',
    }),
  ).toThrow(/JWT_ACCESS_SECRET/);
});

it('parses authentication lifetimes', () => {
  const env = parseEnvironment({
    NODE_ENV: 'test',
    JWT_ACCESS_SECRET: 'test-only-secret-with-at-least-32-characters',
    JWT_ACCESS_TTL_MINUTES: '15',
    JWT_REFRESH_TTL_DAYS: '7',
    JWT_REFRESH_REMEMBER_TTL_DAYS: '30',
  });
  expect(env.JWT_ACCESS_TTL_MINUTES).toBe(15);
  expect(env.JWT_REFRESH_REMEMBER_TTL_DAYS).toBe(30);
});
```

- [ ] **Step 2: Run the focused test and confirm failure**

Run:

```bash
cd backend
pnpm test:unit -- --runInBand test/unit/infrastructure/config/env.schema.spec.ts
```

Expected: FAIL because the authentication environment keys do not exist.

- [ ] **Step 3: Install and configure the dependencies**

Run:

```bash
cd backend
pnpm add @nestjs/jwt@^10 @nestjs/throttler@^6 @node-rs/argon2 cookie-parser helmet
pnpm add -D @types/cookie-parser
```

Add validated environment keys:

```ts
JWT_ACCESS_SECRET: z.string().min(32),
JWT_ACCESS_TTL_MINUTES: z.coerce.number().int().min(5).max(60).default(15),
JWT_REFRESH_TTL_DAYS: z.coerce.number().int().min(1).max(30).default(7),
JWT_REFRESH_REMEMBER_TTL_DAYS: z.coerce.number().int().min(7).max(90).default(30),
AUTH_COOKIE_NAME: z.string().default('rd_refresh'),
AUTH_COOKIE_SECURE: booleanFromEnvironment.default(false),
AUTH_ALLOWED_ORIGINS: z.string().default('http://127.0.0.1:4312,http://localhost:4312'),
```

Document each key in `.env.example`; use a non-secret placeholder for the secret and state that production must replace it.

- [ ] **Step 4: Run tests and build**

Run:

```bash
cd backend
pnpm test:unit -- --runInBand test/unit/infrastructure/config/env.schema.spec.ts
pnpm build
```

Expected: focused tests PASS and Nest build exits 0.

- [ ] **Step 5: Commit**

```bash
git add backend/package.json backend/pnpm-lock.yaml backend/.env.example \
  backend/src/infrastructure/config/env.schema.ts \
  backend/test/unit/infrastructure/config/env.schema.spec.ts
git commit -m "chore: add secure authentication dependencies"
```

## Task 2: Create the IAM Prisma schema and migration

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/20260730020000_enterprise_iam/migration.sql`
- Test: `backend/test/integration/prisma/enterprise-iam-catalog.spec.ts`

- [ ] **Step 1: Write the migration catalog test**

The test must query `information_schema` and assert the following tables and constraints:

```ts
expect(tableNames).toEqual(
  expect.arrayContaining([
    'users',
    'roles',
    'permissions',
    'user_roles',
    'role_permissions',
    'auth_sessions',
    'login_audits',
  ]),
);
expect(uniqueConstraints).toEqual(
  expect.arrayContaining([
    'users_username_key',
    'users_employee_no_key',
    'users_resource_profile_id_key',
    'roles_code_key',
    'permissions_code_key',
  ]),
);
```

- [ ] **Step 2: Run the catalog test and confirm failure**

Run:

```bash
cd backend
pnpm test:integration -- --runInBand test/integration/prisma/enterprise-iam-catalog.spec.ts
```

Expected: FAIL because the IAM tables do not exist.

- [ ] **Step 3: Add enums and models**

Define Prisma enums:

```prisma
enum UserStatus {
  PENDING
  ACTIVE
  DISABLED
  LOCKED
  @@schema("app")
}

enum DataScope {
  SELF
  INVOLVED
  DEPARTMENT
  PROJECT
  ALL
  @@schema("app")
}
```

Add `User`, `Role`, `Permission`, `UserRole`, `RolePermission`, `AuthSession` and `LoginAudit` with:

- a one-to-one `User.resourceProfileId -> ResourceProfile.id` relation;
- unique normalized username, employee number, role code and permission code;
- composite unique keys for `UserRole(userId, roleId)` and `RolePermission(roleId, permissionId)`;
- refresh-token hash and token-family indexes;
- restrictive deletes for users/roles and cascading deletes only for join rows;
- timestamps in `app` schema using the project’s existing conventions.

- [ ] **Step 4: Generate and validate the migration**

Run:

```bash
cd backend
pnpm prisma:generate
pnpm prisma:migrate:deploy
pnpm test:integration -- --runInBand test/integration/prisma/enterprise-iam-catalog.spec.ts
```

Expected: Prisma generation succeeds, migration deploys once, and the catalog test PASSes.

- [ ] **Step 5: Commit**

```bash
git add backend/prisma/schema.prisma \
  backend/prisma/migrations/20260730020000_enterprise_iam \
  backend/test/integration/prisma/enterprise-iam-catalog.spec.ts
git commit -m "feat: add enterprise IAM schema"
```

## Task 3: Implement password policy and token rotation

**Files:**
- Create: `backend/src/modules/iam/domain/principal.ts`
- Create: `backend/src/modules/iam/application/password.service.ts`
- Create: `backend/src/modules/iam/application/token.service.ts`
- Test: `backend/test/unit/modules/iam/password.service.spec.ts`
- Test: `backend/test/unit/modules/iam/token.service.spec.ts`

- [ ] **Step 1: Write password and token tests**

Cover Argon2id, password rejection, access claims, refresh hash storage, rotation and replay:

```ts
it('hashes and verifies a valid password without retaining plaintext', async () => {
  const hash = await service.hash('Enterprise123');
  expect(hash).not.toContain('Enterprise123');
  await expect(service.verify(hash, 'Enterprise123')).resolves.toBe(true);
});

it('rejects a reused refresh token after rotation', async () => {
  const first = await tokens.issueSession(user);
  await tokens.rotate(first.rawRefreshToken, csrfToken, requestMeta);
  await expect(tokens.rotate(first.rawRefreshToken, csrfToken, requestMeta))
    .rejects.toMatchObject({ code: 'AUTH_REFRESH_REPLAYED' });
});
```

- [ ] **Step 2: Run tests and confirm failure**

Run:

```bash
cd backend
pnpm test:unit -- --runInBand \
  test/unit/modules/iam/password.service.spec.ts \
  test/unit/modules/iam/token.service.spec.ts
```

Expected: FAIL because the services do not exist.

- [ ] **Step 3: Implement focused services**

`PasswordService` must:

```ts
validate(value: string): void
hash(value: string): Promise<string>
verify(hash: string, value: string): Promise<boolean>
```

Use `Algorithm.Argon2id`, memory cost 19456 KiB, time cost 2 and parallelism 1. Reject passwords shorter than 10 characters or missing a letter or digit.

`TokenService` must:

```ts
issueAccessToken(principal: AuthenticatedPrincipal): Promise<string>
createSession(userId: string, rememberMe: boolean, meta: SessionMeta): Promise<IssuedSession>
rotate(rawToken: string, csrfToken: string, meta: SessionMeta): Promise<IssuedSession>
revokeSession(sessionId: string, actorUserId: string, reason: string): Promise<void>
revokeAllForUser(userId: string, reason: string): Promise<number>
```

Use a random 256-bit refresh token, store only SHA-256, rotate transactionally, and revoke the entire family when a previously rotated token is reused.

- [ ] **Step 4: Run tests**

Run the command from Step 2.

Expected: both suites PASS with no plaintext token in Prisma mocks or logs.

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/iam/domain/principal.ts \
  backend/src/modules/iam/application/password.service.ts \
  backend/src/modules/iam/application/token.service.ts \
  backend/test/unit/modules/iam/password.service.spec.ts \
  backend/test/unit/modules/iam/token.service.spec.ts
git commit -m "feat: add password and token security services"
```

## Task 4: Build one-time administrator bootstrap and authentication APIs

**Files:**
- Create: `backend/src/modules/iam/iam.module.ts`
- Create: `backend/src/modules/iam/application/auth.service.ts`
- Create: `backend/src/modules/iam/application/bootstrap.service.ts`
- Create: `backend/src/modules/iam/domain/permission-catalog.ts`
- Create: `backend/src/modules/iam/interface/http/auth.controller.ts`
- Create: `backend/src/modules/iam/interface/http/dto/auth.dto.ts`
- Modify: `backend/src/app.module.ts`
- Modify: `backend/src/main.ts`
- Test: `backend/test/integration/modules/iam/auth.controller.spec.ts`

- [ ] **Step 1: Write authentication integration tests**

Cover:

- bootstrap status is required when zero users exist;
- bootstrap lists existing active employees only while zero users exist;
- bootstrap transaction creates one super admin and cannot run twice;
- login accepts username or employee number;
- five failures lock for 15 minutes;
- first login returns `mustChangePassword: true`;
- refresh rotates the cookie;
- logout revokes the session.

Use assertions:

```ts
await request(app.getHttpServer())
  .post('/api/auth/bootstrap')
  .send({ resourceProfileId, username: 'admin', employeeNo: 'RD-001', password: 'Enterprise123' })
  .expect(201);

await request(app.getHttpServer())
  .post('/api/auth/bootstrap')
  .send({ resourceProfileId, username: 'second', password: 'Enterprise123' })
  .expect(409);
```

- [ ] **Step 2: Run and confirm failure**

Run:

```bash
cd backend
pnpm test:integration -- --runInBand test/integration/modules/iam/auth.controller.spec.ts
```

Expected: FAIL with missing `/api/auth/*` routes.

- [ ] **Step 3: Implement the public authentication contract**

Expose:

```text
GET    /api/auth/bootstrap/status
GET    /api/auth/bootstrap/employees
POST   /api/auth/bootstrap
GET    /api/auth/csrf
POST   /api/auth/login
POST   /api/auth/refresh
POST   /api/auth/logout
GET    /api/auth/me
POST   /api/auth/change-password
GET    /api/auth/sessions
DELETE /api/auth/sessions/:id
DELETE /api/auth/sessions
```

Login response:

```ts
interface LoginResponse {
  accessToken: string;
  csrfToken: string;
  user: CurrentUser;
  mustChangePassword: boolean;
}
```

Set the refresh cookie with `HttpOnly`, configured `Secure`, `SameSite=Lax`, path `/api/auth`, and the selected expiry. Configure `cookieParser()`, `helmet()` and credentials-aware local CORS in `main.ts`.

- [ ] **Step 4: Run integration tests and build**

Run:

```bash
cd backend
pnpm test:integration -- --runInBand test/integration/modules/iam/auth.controller.spec.ts
pnpm build
```

Expected: auth integration suite PASSes and build exits 0.

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/iam backend/src/app.module.ts backend/src/main.ts \
  backend/test/integration/modules/iam/auth.controller.spec.ts
git commit -m "feat: add secure login and session APIs"
```

## Task 5: Add the global identity guard and request principal

**Files:**
- Modify: `backend/src/shared/kernel/request-context.ts`
- Modify: `backend/src/infrastructure/context/request-context.service.ts`
- Create: `backend/src/modules/iam/interface/http/public.decorator.ts`
- Create: `backend/src/modules/iam/interface/http/authentication.guard.ts`
- Create: `backend/src/modules/iam/interface/http/current-user.decorator.ts`
- Modify: `backend/src/modules/iam/iam.module.ts`
- Test: `backend/test/unit/modules/iam/authentication.guard.spec.ts`
- Create: `backend/test/helpers/authenticated-request.ts`

- [ ] **Step 1: Write guard tests**

```ts
it('allows a public endpoint without credentials', async () => {
  reflector.getAllAndOverride.mockReturnValue(true);
  await expect(guard.canActivate(context)).resolves.toBe(true);
});

it('stores a verified principal in request context', async () => {
  request.headers.authorization = `Bearer ${accessToken}`;
  await expect(guard.canActivate(context)).resolves.toBe(true);
  expect(contextService.requirePrincipal()).toMatchObject({ userId, employeeId });
});
```

Also assert missing, expired and revoked credentials produce stable `AUTH_REQUIRED` or `AUTH_SESSION_REVOKED` codes.

- [ ] **Step 2: Run and confirm failure**

Run:

```bash
cd backend
pnpm test:unit -- --runInBand test/unit/modules/iam/authentication.guard.spec.ts
```

Expected: FAIL because the global guard and principal do not exist.

- [ ] **Step 3: Implement identity propagation**

Extend `RequestContext`:

```ts
export interface RequestContext {
  traceId: string;
  sourceIp?: string;
  requestHeaders: Record<string, string | string[] | undefined>;
  principal?: AuthenticatedPrincipal;
}
```

Add:

```ts
requirePrincipal(): AuthenticatedPrincipal {
  const principal = this.requireContext().principal;
  if (!principal) throw new UnauthorizedException('Authentication required');
  return principal;
}
```

Register `AuthenticationGuard` with `APP_GUARD`. Mark only auth bootstrap/login/refresh/logout and health endpoints with `@Public()`.

- [ ] **Step 4: Add authenticated integration request helper**

`authenticatedRequest(app, prisma, roleCode)` must create or reuse a fixture employee/user, issue a real access token through `AuthService`, and return:

```ts
{
  user,
  employee,
  agent: request(app.getHttpServer()).set('Authorization', `Bearer ${accessToken}`),
}
```

Update one representative project integration test to use the helper, proving the global guard works before the remaining integration suites are migrated.

- [ ] **Step 5: Run focused tests**

Run:

```bash
cd backend
pnpm test:unit -- --runInBand test/unit/modules/iam/authentication.guard.spec.ts
pnpm test:integration -- --runInBand test/integration/modules/workbench/projects.controller.spec.ts
```

Expected: both suites PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/src/shared/kernel/request-context.ts \
  backend/src/infrastructure/context/request-context.service.ts \
  backend/src/modules/iam backend/test/helpers/authenticated-request.ts \
  backend/test/integration/modules/workbench/projects.controller.spec.ts
git commit -m "feat: require authenticated request principals"
```

## Task 6: Implement permission catalog, roles and authorization guards

**Files:**
- Create: `backend/src/modules/iam/application/authorization.service.ts`
- Create: `backend/src/modules/iam/application/roles.service.ts`
- Create: `backend/src/modules/iam/interface/http/permissions.decorator.ts`
- Create: `backend/src/modules/iam/interface/http/permission.guard.ts`
- Create: `backend/src/modules/iam/interface/http/admin-roles.controller.ts`
- Create: `backend/src/modules/iam/interface/http/admin-permissions.controller.ts`
- Create: `backend/src/modules/iam/interface/http/dto/roles.dto.ts`
- Modify: `backend/src/modules/iam/domain/permission-catalog.ts`
- Test: `backend/test/unit/modules/iam/authorization.service.spec.ts`
- Test: `backend/test/integration/modules/iam/roles.controller.spec.ts`

- [ ] **Step 1: Write authorization tests**

Assert:

```ts
expect(await authorization.hasPermission(superAdmin, 'project.delete')).toBe(true);
expect(await authorization.hasPermission(employee, 'project.delete')).toBe(false);
expect(await authorization.resolveScope(manager, 'employee.read')).toEqual({
  kinds: ['DEPARTMENT'],
  departmentNames: ['研发部'],
});
```

Integration tests must prove a role can be copied and edited, system roles cannot be deleted, the last super admin cannot lose `SUPER_ADMIN`, and deleting a role with users returns 409.

- [ ] **Step 2: Run and confirm failure**

Run:

```bash
cd backend
pnpm test:unit -- --runInBand test/unit/modules/iam/authorization.service.spec.ts
pnpm test:integration -- --runInBand test/integration/modules/iam/roles.controller.spec.ts
```

Expected: FAIL because role APIs and guards do not exist.

- [ ] **Step 3: Implement the permission catalog**

Export literal permission codes and built-in grants:

```ts
export const PERMISSIONS = {
  USER_READ: 'user.read',
  USER_MANAGE: 'user.manage',
  ROLE_READ: 'role.read',
  ROLE_MANAGE: 'role.manage',
  EMPLOYEE_READ: 'employee.read',
  EMPLOYEE_MANAGE: 'employee.manage',
  PROJECT_READ: 'project.read',
  PROJECT_MANAGE: 'project.manage',
  DOCUMENT_READ: 'document.read',
  DOCUMENT_MANAGE: 'document.manage',
  SYSTEM_CONFIGURE: 'system.configure',
} as const;
```

The seed routine must upsert the complete catalog and built-in roles idempotently. Super admin resolution bypasses individual grant enumeration but remains subject to “at least one active super admin”.

- [ ] **Step 4: Implement APIs and global permission guard**

Expose:

```text
GET    /api/admin/permissions
GET    /api/admin/roles
POST   /api/admin/roles
POST   /api/admin/roles/:id/copy
PATCH  /api/admin/roles/:id
PUT    /api/admin/roles/:id/permissions
DELETE /api/admin/roles/:id
```

`@RequirePermissions('project.read')` stores metadata consumed by `PermissionGuard`. Missing grants return 403 with `PERMISSION_DENIED`.

- [ ] **Step 5: Run tests and build**

Run the Step 2 commands, then:

```bash
cd backend
pnpm build
```

Expected: all focused suites PASS and build exits 0.

- [ ] **Step 6: Commit**

```bash
git add backend/src/modules/iam \
  backend/test/unit/modules/iam/authorization.service.spec.ts \
  backend/test/integration/modules/iam/roles.controller.spec.ts
git commit -m "feat: add role and permission authorization"
```

## Task 7: Implement user administration and security audit

**Files:**
- Create: `backend/src/modules/iam/application/users.service.ts`
- Create: `backend/src/modules/iam/application/security-audit.service.ts`
- Create: `backend/src/modules/iam/interface/http/admin-users.controller.ts`
- Create: `backend/src/modules/iam/interface/http/admin-audits.controller.ts`
- Create: `backend/src/modules/iam/interface/http/dto/users.dto.ts`
- Test: `backend/test/integration/modules/iam/users.controller.spec.ts`
- Test: `backend/test/integration/modules/iam/security-audits.controller.spec.ts`

- [ ] **Step 1: Write lifecycle tests**

Cover create-and-bind, duplicate employee binding, role assignment, reset password, disable, enable, force logout, pagination and audit:

```ts
await admin.post('/api/admin/users').send({
  resourceProfileId: employee.id,
  username: 'zhangsan',
  employeeNo: 'RD-002',
  roleIds: [employeeRole.id],
  temporaryPassword: 'Enterprise123',
}).expect(201);

await admin.post(`/api/admin/users/${user.id}/disable`).expect(200);
await expectSessionRevoked(user.id);
```

- [ ] **Step 2: Run and confirm failure**

Run:

```bash
cd backend
pnpm test:integration -- --runInBand \
  test/integration/modules/iam/users.controller.spec.ts \
  test/integration/modules/iam/security-audits.controller.spec.ts
```

Expected: FAIL with missing admin routes.

- [ ] **Step 3: Implement user and audit endpoints**

Expose:

```text
GET    /api/admin/users
POST   /api/admin/users
GET    /api/admin/users/:id
PATCH  /api/admin/users/:id
POST   /api/admin/users/:id/enable
POST   /api/admin/users/:id/disable
POST   /api/admin/users/:id/reset-password
POST   /api/admin/users/:id/revoke-sessions
GET    /api/admin/users/:id/sessions
DELETE /api/admin/users/:id
GET    /api/admin/security-audits
```

Permanent account deletion is allowed only after disabling the account, revoking sessions and confirming no unresolved ownership references. Employee history remains intact.

- [ ] **Step 4: Run tests**

Run the Step 2 command.

Expected: both integration suites PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/iam \
  backend/test/integration/modules/iam/users.controller.spec.ts \
  backend/test/integration/modules/iam/security-audits.controller.spec.ts
git commit -m "feat: add user administration and security audit"
```

## Task 8: Add frontend session bootstrap and single-flight token refresh

**Files:**
- Create: `frontend/src/modules/auth/types.ts`
- Create: `frontend/src/modules/auth/api.ts`
- Create: `frontend/src/modules/auth/store.ts`
- Create: `frontend/src/modules/auth/AuthProvider.tsx`
- Modify: `frontend/src/lib/http.ts`
- Modify: `frontend/src/main.tsx`
- Test: `frontend/src/modules/auth/__tests__/store.test.ts`
- Test: `frontend/src/lib/__tests__/http-auth.test.ts`
- Test: `frontend/src/modules/auth/__tests__/AuthProvider.test.tsx`

- [ ] **Step 1: Write refresh queue tests**

Mock two simultaneous protected requests returning 401, one refresh response, then successful retries:

```ts
const [first, second] = await Promise.all([
  request('/projects'),
  request('/tasks'),
]);
expect(fetchMock.calls('/api/auth/refresh')).toHaveLength(1);
expect(first).toEqual(projectsPayload);
expect(second).toEqual(tasksPayload);
```

Also assert disabled-account and replay errors clear auth state without a second refresh attempt.

- [ ] **Step 2: Run and confirm failure**

Run:

```bash
cd frontend
pnpm test --run \
  src/lib/__tests__/http-auth.test.ts \
  src/modules/auth/__tests__/store.test.ts \
  src/modules/auth/__tests__/AuthProvider.test.tsx
```

Expected: FAIL because auth store and refresh coordinator do not exist.

- [ ] **Step 3: Implement in-memory auth state**

The Zustand store exposes:

```ts
interface AuthState {
  status: 'BOOTSTRAPPING' | 'AUTHENTICATED' | 'ANONYMOUS';
  accessToken?: string;
  csrfToken?: string;
  user?: CurrentUser;
  setSession(session: LoginResponse): void;
  clearSession(): void;
  updateUser(user: CurrentUser): void;
}
```

Do not use Zustand persistence for tokens.

- [ ] **Step 4: Implement HTTP authentication**

`request()` and `download()` must:

- set `credentials: 'include'`;
- attach `Authorization: Bearer <memory-token>`;
- attach `X-CSRF-Token` on refresh/logout;
- run one refresh promise for concurrent 401s;
- retry each original request once;
- preserve `FormData`, abort signals and download filenames;
- throw stable `ApiError` codes without infinite loops.

- [ ] **Step 5: Implement provider bootstrap**

On app start:

1. fetch CSRF;
2. call refresh;
3. set the session or mark anonymous;
4. render a neutral loading shell until complete;
5. clear TanStack Query cache on logout or user change.

- [ ] **Step 6: Run tests, typecheck and build**

Run:

```bash
cd frontend
pnpm test --run \
  src/lib/__tests__/http-auth.test.ts \
  src/modules/auth/__tests__/store.test.ts \
  src/modules/auth/__tests__/AuthProvider.test.tsx
pnpm typecheck
pnpm build
```

Expected: tests PASS, typecheck and build exit 0.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/modules/auth frontend/src/lib/http.ts \
  frontend/src/lib/__tests__/http-auth.test.ts frontend/src/main.tsx
git commit -m "feat: add frontend session bootstrap and token refresh"
```

## Task 9: Build login, first-run bootstrap, password and route guards

**Files:**
- Create: `frontend/src/modules/auth/RequireAuth.tsx`
- Create: `frontend/src/modules/auth/Permission.tsx`
- Create: `frontend/src/modules/auth/pages/LoginPage.tsx`
- Create: `frontend/src/modules/auth/pages/LoginPage.less`
- Create: `frontend/src/modules/auth/pages/BootstrapAdminPage.tsx`
- Create: `frontend/src/modules/auth/pages/FirstPasswordChangePage.tsx`
- Create: `frontend/src/modules/auth/pages/ForbiddenPage.tsx`
- Create: `frontend/src/modules/auth/pages/PersonalSecurityPage.tsx`
- Modify: `frontend/src/constants/routes.ts`
- Modify: `frontend/src/router/routes.ts`
- Modify: `frontend/src/main.tsx`
- Test: `frontend/src/modules/auth/__tests__/auth-pages.test.tsx`
- Test: `frontend/src/router/__tests__/auth-routes.test.tsx`

- [ ] **Step 1: Write route and form tests**

Assert:

- anonymous users reach `/login`;
- first database run reaches `/setup-admin`;
- authenticated users return to the original route;
- `mustChangePassword` forces `/change-password`;
- 403 renders without redirect loops;
- password fields have correct labels, validation and autocomplete values.

- [ ] **Step 2: Run and confirm failure**

Run:

```bash
cd frontend
pnpm test --run \
  src/modules/auth/__tests__/auth-pages.test.tsx \
  src/router/__tests__/auth-routes.test.tsx
```

Expected: FAIL because pages and routes do not exist.

- [ ] **Step 3: Implement the route structure**

Add:

```ts
LOGIN: '/login',
SETUP_ADMIN: '/setup-admin',
CHANGE_PASSWORD: '/change-password',
FORBIDDEN: '/forbidden',
PERSONAL_SECURITY: '/settings/security',
```

Public routes render outside `AppShell`. Protected routes render through `RequireAuth`; admin routes additionally require their permission code.

- [ ] **Step 4: Build Feishu-style white authentication pages**

Use Semi `Form`, `Input`, `Checkbox`, `Button`, `Banner`, `Modal` and `Table`; no native date/select controls. Login errors distinguish invalid credentials, locked, disabled and expired session without revealing whether an unknown account exists.

- [ ] **Step 5: Run tests and UI checks**

Run:

```bash
cd frontend
pnpm test --run \
  src/modules/auth/__tests__/auth-pages.test.tsx \
  src/router/__tests__/auth-routes.test.tsx
pnpm lint
pnpm typecheck
```

Expected: focused tests, lint and typecheck PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/modules/auth frontend/src/constants/routes.ts \
  frontend/src/router/routes.ts frontend/src/router/__tests__/auth-routes.test.tsx \
  frontend/src/main.tsx
git commit -m "feat: add login and protected application routes"
```

## Task 10: Build system management frontend

**Files:**
- Create: `frontend/src/modules/admin/api.ts`
- Create: `frontend/src/modules/admin/types.ts`
- Create: `frontend/src/modules/admin/AdminLayout.tsx`
- Create: `frontend/src/modules/admin/UsersPage.tsx`
- Create: `frontend/src/modules/admin/UserEditor.tsx`
- Create: `frontend/src/modules/admin/RolesPage.tsx`
- Create: `frontend/src/modules/admin/RolePermissionMatrix.tsx`
- Create: `frontend/src/modules/admin/PermissionsPage.tsx`
- Create: `frontend/src/modules/admin/SecurityAuditsPage.tsx`
- Create: `frontend/src/modules/admin/AdminPages.less`
- Modify: `frontend/src/constants/routes.ts`
- Modify: `frontend/src/router/routes.ts`
- Modify: `frontend/src/components/AppShell/WorkspaceNavigation.tsx`
- Modify: `frontend/src/components/AppShell/WorkspaceHeader.tsx`
- Test: `frontend/src/modules/admin/__tests__/admin-pages.test.tsx`
- Test: `frontend/src/components/AppShell/__tests__/WorkspaceNavigation.test.tsx`

- [ ] **Step 1: Write admin UI tests**

Cover permission-hidden navigation, creating a bound user, reset password confirmation, disable and force logout, role copying, scope selection, system-role protection and paginated audits.

```ts
expect(screen.queryByRole('link', { name: '系统管理' })).not.toBeInTheDocument();
authStore.setState({ user: superAdmin });
expect(screen.getByRole('link', { name: '系统管理' })).toBeInTheDocument();
```

- [ ] **Step 2: Run and confirm failure**

Run:

```bash
cd frontend
pnpm test --run \
  src/modules/admin/__tests__/admin-pages.test.tsx \
  src/components/AppShell/__tests__/WorkspaceNavigation.test.tsx
```

Expected: FAIL because the administration module does not exist.

- [ ] **Step 3: Implement administration pages**

Add protected routes:

```text
/admin/users
/admin/roles
/admin/permissions
/admin/security-audits
```

Use a two-level white workspace layout: administration tabs on top, filter/action row, then data table or permission matrix. Dangerous actions use confirmation dialogs and never rely on color alone.

- [ ] **Step 4: Add account controls to the header**

Display avatar/name, role summary, personal security, logout and administrator management entry. A normal employee must not receive links to inaccessible pages.

- [ ] **Step 5: Run tests, typecheck and build**

Run:

```bash
cd frontend
pnpm test --run \
  src/modules/admin/__tests__/admin-pages.test.tsx \
  src/components/AppShell/__tests__/WorkspaceNavigation.test.tsx
pnpm typecheck
pnpm build
```

Expected: tests PASS and production build exits 0.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/modules/admin frontend/src/constants/routes.ts \
  frontend/src/router/routes.ts frontend/src/components/AppShell
git commit -m "feat: add user role and permission management UI"
```

## Task 11: Add ownership relations and scope query builders

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/20260730030000_business_ownership/migration.sql`
- Create: `backend/src/modules/iam/application/data-scope.service.ts`
- Create: `backend/src/modules/iam/domain/data-scope.ts`
- Test: `backend/test/unit/modules/iam/data-scope.service.spec.ts`
- Test: `backend/test/integration/prisma/business-ownership-catalog.spec.ts`

- [ ] **Step 1: Write scope and catalog tests**

Test Prisma where-builders:

```ts
expect(scope.projects(employeePrincipal)).toEqual({
  OR: [
    { ownerUserId: employeePrincipal.userId },
    { members: { some: { userId: employeePrincipal.userId } } },
  ],
});
expect(scope.projects(superAdminPrincipal)).toEqual({});
```

Catalog tests must assert ownership columns, foreign keys and participant/share join tables.

- [ ] **Step 2: Run and confirm failure**

Run:

```bash
cd backend
pnpm test:unit -- --runInBand test/unit/modules/iam/data-scope.service.spec.ts
pnpm test:integration -- --runInBand test/integration/prisma/business-ownership-catalog.spec.ts
```

Expected: FAIL because ownership schema and builders do not exist.

- [ ] **Step 3: Add ownership schema**

Add semantically appropriate ownership to:

- `Project`, `WorkTask`, milestones, risks, issues, decisions and progress;
- `EmployeeWorkItem`, `EmployeeWeekPlanItem` and reminders;
- meetings and action items;
- `ContentDocument`, `KnowledgeSpace`, `DataTable` and saved views;
- intelligence, non-project R&D and application cases.

Create explicit `ProjectMember`, `DocumentUserShare`, `DocumentRoleShare`, `KnowledgeSpaceMember` relations rather than storing security-critical identities in string arrays. Retain legacy name columns during migration for display compatibility.

- [ ] **Step 4: Implement centralized builders**

Provide typed methods:

```ts
projects(principal: AuthenticatedPrincipal): Prisma.ProjectWhereInput
tasks(principal: AuthenticatedPrincipal): Prisma.WorkTaskWhereInput
employees(principal: AuthenticatedPrincipal): Prisma.ResourceProfileWhereInput
employeeWork(principal: AuthenticatedPrincipal): Prisma.EmployeeWorkItemWhereInput
meetings(principal: AuthenticatedPrincipal): Prisma.MeetingWhereInput
documents(principal: AuthenticatedPrincipal): Prisma.ContentDocumentWhereInput
knowledge(principal: AuthenticatedPrincipal): Prisma.KnowledgeChunkWhereInput
```

Builders return `{}` only for `ALL`. Every other scope returns a restrictive predicate.

- [ ] **Step 5: Deploy migration and run tests**

Run:

```bash
cd backend
pnpm prisma:generate
pnpm prisma:migrate:deploy
pnpm test:unit -- --runInBand test/unit/modules/iam/data-scope.service.spec.ts
pnpm test:integration -- --runInBand test/integration/prisma/business-ownership-catalog.spec.ts
```

Expected: migration deploys and both suites PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/prisma backend/src/modules/iam/application/data-scope.service.ts \
  backend/src/modules/iam/domain/data-scope.ts \
  backend/test/unit/modules/iam/data-scope.service.spec.ts \
  backend/test/integration/prisma/business-ownership-catalog.spec.ts
git commit -m "feat: add business ownership and data scopes"
```

## Task 12: Enforce employee, personal work and project authorization

**Files:**
- Modify: `backend/src/modules/workbench/employees/interface/http/employees.controller.ts`
- Modify: `backend/src/modules/workbench/employees/application/employees.service.ts`
- Modify: `backend/src/modules/workbench/employees/application/employee-progress-query.service.ts`
- Modify: `backend/src/modules/workbench/employees/application/employee-week-plans.service.ts`
- Modify: `backend/src/modules/workbench/projects/interface/http/projects.controller.ts`
- Modify: `backend/src/modules/workbench/projects/application/projects.service.ts`
- Modify: `backend/src/modules/workbench/tasks/interface/http/tasks.controller.ts`
- Modify: `backend/src/modules/workbench/tasks/application/tasks.service.ts`
- Modify: `backend/src/modules/workbench/calendar/application/calendar.service.ts`
- Modify: `backend/src/modules/workbench/notifications/application/notifications.service.ts`
- Modify: `frontend/src/pages/EmployeesPage.tsx`
- Test: `frontend/src/pages/__tests__/EmployeesPage.test.tsx`
- Test: `backend/test/integration/modules/workbench/authorization-core.spec.ts`

- [ ] **Step 1: Write cross-user authorization tests**

Create admin, employee A, employee B, project manager and department manager fixtures. Assert:

```ts
await employeeA.get(`/api/employees/${employeeB.employee.id}`).expect(403);
await employeeA.get(`/api/projects/${projectB.id}`).expect(403);
await projectManager.get(`/api/projects/${managedProject.id}`).expect(200);
await projectManager.patch(`/api/projects/${unrelatedProject.id}`).send(update).expect(403);
await admin.patch(`/api/employees/${employeeB.employee.id}`).send(update).expect(200);
```

Also cover employee work export, project team progress, reminders and calendar aggregation.
Employee archive tests must assert that the caller explicitly chooses whether to disable the bound account; permanent employee deletion must fail until the account is disabled/deleted and ownership references are reassigned.

- [ ] **Step 2: Run and confirm failure**

Run:

```bash
cd backend
pnpm test:integration -- --runInBand \
  test/integration/modules/workbench/authorization-core.spec.ts
```

Expected: FAIL because unrelated data is still returned.

- [ ] **Step 3: Add permission decorators and scoped queries**

- `employee.read`/`employee.manage` on employee APIs.
- `project.read`/`project.manage` on project APIs.
- `task.read`/`task.manage` on task APIs.
- self-scoped calendar, reminders, week plans and work items.
- admin operations retain `ALL`.
- employee archive UI displays the bound account status and sends `disableBoundAccount: true|false`; permanent deletion displays unresolved account/ownership blockers.

Creation methods set `createdByUserId` and `ownerUserId` from the authenticated principal rather than accepting them from an untrusted request body.

- [ ] **Step 4: Run focused and existing module tests**

Run:

```bash
cd backend
pnpm test:integration -- --runInBand \
  test/integration/modules/workbench/authorization-core.spec.ts \
  test/integration/modules/workbench/employees.controller.spec.ts \
  test/integration/modules/workbench/employee-progress.controller.spec.ts \
  test/integration/modules/workbench/projects.controller.spec.ts \
  test/integration/modules/workbench/tasks.controller.spec.ts
cd ../frontend
pnpm test --run src/pages/__tests__/EmployeesPage.test.tsx
```

Expected: all listed suites PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/workbench/employees \
  backend/src/modules/workbench/projects backend/src/modules/workbench/tasks \
  backend/src/modules/workbench/calendar backend/src/modules/workbench/notifications \
  backend/test/integration/modules/workbench/authorization-core.spec.ts \
  frontend/src/pages/EmployeesPage.tsx frontend/src/pages/__tests__/EmployeesPage.test.tsx
git commit -m "feat: enforce employee and project data access"
```

## Task 13: Enforce meeting, document, knowledge, Base, search and NOVA authorization

**Files:**
- Modify: `backend/src/modules/workbench/management/**`
- Modify: `backend/src/modules/workbench/content/**`
- Modify: `backend/src/modules/workbench/knowledge/**`
- Modify: `backend/src/modules/workbench/base/**`
- Modify: `backend/src/modules/workbench/search/**`
- Modify: `backend/src/modules/workbench/activity/**`
- Test: `backend/test/integration/modules/workbench/authorization-content.spec.ts`
- Test: `backend/test/integration/modules/workbench/knowledge-authorization.spec.ts`

- [ ] **Step 1: Write content leakage tests**

Prove employee A cannot:

- list or open employee B’s private meeting;
- download employee B’s private attachment;
- receive private documents from global search;
- retrieve private knowledge chunks in NOVA;
- open an unshared Base;
- receive private objects through activity timelines.

Prove explicitly shared users and roles can read but cannot edit unless granted.

- [ ] **Step 2: Run and confirm failure**

Run:

```bash
cd backend
pnpm test:integration -- --runInBand \
  test/integration/modules/workbench/authorization-content.spec.ts \
  test/integration/modules/workbench/knowledge-authorization.spec.ts
```

Expected: FAIL with cross-user content visible.

- [ ] **Step 3: Apply scope at source**

- Filter meeting lists and detail operations by organizer/participant/share.
- Authorize file metadata and the actual byte-stream endpoint before reading storage.
- Filter content documents and knowledge chunks before ranking.
- Pass the principal scope into embedding retrieval and NOVA citation construction.
- Filter Base tables, records and views by ownership/share/project.
- Apply the same predicates to global search adapters and activity unions.

- [ ] **Step 4: Run content and knowledge tests**

Run the Step 2 command, then:

```bash
cd backend
pnpm test:integration -- --runInBand \
  test/integration/modules/workbench/content.controller.spec.ts \
  test/integration/modules/workbench/knowledge.controller.spec.ts \
  test/integration/modules/workbench/base.controller.spec.ts \
  test/integration/modules/workbench/search.controller.spec.ts
```

Expected: all suites PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/workbench/management \
  backend/src/modules/workbench/content backend/src/modules/workbench/knowledge \
  backend/src/modules/workbench/base backend/src/modules/workbench/search \
  backend/src/modules/workbench/activity \
  backend/test/integration/modules/workbench/authorization-content.spec.ts \
  backend/test/integration/modules/workbench/knowledge-authorization.spec.ts
git commit -m "feat: secure collaborative content and NOVA retrieval"
```

## Task 14: Enforce reporting, governance, intelligence, extensions and audit authorization

**Files:**
- Modify: `backend/src/modules/workbench/reporting/**`
- Modify: `backend/src/modules/workbench/governance/**`
- Modify: `backend/src/modules/workbench/intelligence/**`
- Modify: `backend/src/modules/workbench/operations/**`
- Modify: `backend/src/modules/workbench/applications/**`
- Modify: `backend/src/modules/workbench/extensions/**`
- Test: `backend/test/integration/modules/workbench/authorization-administration.spec.ts`

- [ ] **Step 1: Write sensitive-operation tests**

Assert:

- employee reports contain only employee data;
- department manager reports contain department data;
- export uses the same scope as list;
- ordinary employees receive 403 for backup, restore, system settings and extension credentials;
- authorized operators can run the operation and create an audit event.

- [ ] **Step 2: Run and confirm failure**

Run:

```bash
cd backend
pnpm test:integration -- --runInBand \
  test/integration/modules/workbench/authorization-administration.spec.ts
```

Expected: FAIL because administrative endpoints are not restricted.

- [ ] **Step 3: Add permissions and scoped aggregation**

Add permission codes for reporting, export, governance, intelligence, applications, extensions, backup, restore and audit. Every SQL aggregation must include the resolved ownership scope before grouping; do not filter aggregate rows after calculating totals.

- [ ] **Step 4: Run focused tests**

Run the Step 2 command plus existing reporting and governance integration suites.

Expected: PASS with employee/department/admin totals matching fixtures.

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/workbench/reporting \
  backend/src/modules/workbench/governance backend/src/modules/workbench/intelligence \
  backend/src/modules/workbench/operations backend/src/modules/workbench/applications \
  backend/src/modules/workbench/extensions \
  backend/test/integration/modules/workbench/authorization-administration.spec.ts
git commit -m "feat: secure reports governance and system operations"
```

## Task 15: Add real-time permission changes and authenticated Socket/SSE connections

**Files:**
- Modify: `backend/src/modules/workbench/notifications/notifications.gateway.ts`
- Create: `backend/src/modules/iam/application/connection-ticket.service.ts`
- Create: `backend/src/modules/iam/interface/http/connection-ticket.controller.ts`
- Modify: `backend/src/modules/workbench/knowledge/interface/http/knowledge.controller.ts`
- Modify: `frontend/src/modules/workbench/realtime/notificationSocket.ts`
- Modify: `frontend/src/modules/knowledge/api.ts`
- Modify: `frontend/src/modules/auth/AuthProvider.tsx`
- Test: `backend/test/unit/modules/iam/connection-ticket.service.spec.ts`
- Test: `frontend/src/modules/auth/__tests__/permission-sync.test.tsx`

- [ ] **Step 1: Write ticket and live-revocation tests**

Tickets are one-time, audience-bound and expire after 60 seconds:

```ts
const ticket = await service.issue(principal, 'knowledge-sse');
await expect(service.consume(ticket, 'knowledge-sse')).resolves.toMatchObject({ userId });
await expect(service.consume(ticket, 'knowledge-sse')).rejects.toMatchObject({
  code: 'AUTH_CONNECTION_TICKET_INVALID',
});
```

Frontend test asserts `auth.permissions.changed` refetches `/auth/me`, invalidates query caches, and logs out when account status becomes disabled.

- [ ] **Step 2: Run and confirm failure**

Run:

```bash
cd backend
pnpm test:unit -- --runInBand test/unit/modules/iam/connection-ticket.service.spec.ts
cd ../frontend
pnpm test --run src/modules/auth/__tests__/permission-sync.test.tsx
```

Expected: both suites FAIL.

- [ ] **Step 3: Implement authenticated live channels**

- Socket handshake verifies Access Token and joins `user:<id>`.
- SSE obtains a one-time `knowledge-sse` ticket through an authenticated POST.
- Role/user changes emit `auth.permissions.changed`.
- Disable/revoke emits `auth.session.revoked` and disconnects the client.
- The client reconnects with a fresh access token after normal refresh.

- [ ] **Step 4: Run tests**

Run the Step 2 commands.

Expected: both suites PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/iam backend/src/modules/workbench/notifications \
  backend/src/modules/workbench/knowledge frontend/src/modules/workbench/realtime \
  frontend/src/modules/knowledge/api.ts frontend/src/modules/auth
git commit -m "feat: authenticate live connections and permission updates"
```

## Task 16: Migrate historical ownership and provide correction UI

**Files:**
- Create: `backend/src/modules/iam/application/ownership-migration.service.ts`
- Create: `backend/src/modules/iam/interface/http/admin-ownership.controller.ts`
- Create: `backend/src/modules/iam/interface/http/dto/ownership.dto.ts`
- Create: `frontend/src/modules/admin/OwnershipMigrationPage.tsx`
- Modify: `frontend/src/modules/admin/api.ts`
- Modify: `frontend/src/router/routes.ts`
- Test: `backend/test/integration/modules/iam/ownership-migration.spec.ts`
- Test: `frontend/src/modules/admin/__tests__/OwnershipMigrationPage.test.tsx`

- [ ] **Step 1: Write migration analysis tests**

Fixtures must include:

- exact employee ID ownership;
- unique legacy employee name;
- ambiguous duplicate legacy name;
- missing owner;
- project participant name mapping.

Assert exact/unique matches are assigned, ambiguous/missing records are assigned to the bootstrap super admin with `NEEDS_REVIEW`, and record counts remain unchanged.

- [ ] **Step 2: Run and confirm failure**

Run:

```bash
cd backend
pnpm test:integration -- --runInBand test/integration/modules/iam/ownership-migration.spec.ts
cd ../frontend
pnpm test --run src/modules/admin/__tests__/OwnershipMigrationPage.test.tsx
```

Expected: FAIL because analysis and correction features do not exist.

- [ ] **Step 3: Implement resumable ownership migration**

Expose:

```text
GET  /api/admin/ownership-migration/status
POST /api/admin/ownership-migration/analyze
POST /api/admin/ownership-migration/apply
GET  /api/admin/ownership-migration/unresolved
PUT  /api/admin/ownership-migration/assignments
POST /api/admin/ownership-migration/complete
```

Use batches with stable cursors, idempotency keys and audit entries. `complete` rejects while blocking unresolved records remain.

- [ ] **Step 4: Build correction UI**

Show module, record title, legacy owner value, suggested user, confidence and bulk assignment. Ordinary-user login remains disabled until the migration is complete.

- [ ] **Step 5: Run tests**

Run the Step 2 commands.

Expected: both suites PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/src/modules/iam frontend/src/modules/admin \
  frontend/src/router/routes.ts \
  backend/test/integration/modules/iam/ownership-migration.spec.ts
git commit -m "feat: migrate and correct historical data ownership"
```

## Task 17: Move project progress drafts into project approval

**Files:**
- Modify: `frontend/src/pages/EmployeesPage.tsx`
- Modify: `frontend/src/pages/ProjectWorkspacePage.tsx`
- Modify: `frontend/src/pages/ProjectWorkspacePage.less`
- Modify: `frontend/src/modules/employees/components/ProjectProgressDrafts.tsx`
- Modify: `frontend/src/modules/employees/api.ts`
- Modify: `backend/src/modules/workbench/employees/interface/http/employees.controller.ts`
- Modify: `backend/src/modules/workbench/employees/application/project-progress-draft.service.ts`
- Test: `frontend/src/pages/__tests__/EmployeesPage.test.tsx`
- Test: `frontend/src/pages/__tests__/ProjectWorkspacePage.test.tsx`
- Test: `backend/test/integration/modules/workbench/project-progress-authorization.spec.ts`

- [ ] **Step 1: Write relocation and authorization tests**

Assert:

- employee tabs no longer include “进展草稿”;
- project progress displays pending count and suggestions;
- contributors can view their own contribution but cannot publish;
- project owner and `project.progress.publish` roles can edit/adopt/ignore;
- super admin can perform all actions.

- [ ] **Step 2: Run and confirm failure**

Run:

```bash
cd frontend
pnpm test --run \
  src/pages/__tests__/EmployeesPage.test.tsx \
  src/pages/__tests__/ProjectWorkspacePage.test.tsx
cd ../backend
pnpm test:integration -- --runInBand \
  test/integration/modules/workbench/project-progress-authorization.spec.ts
```

Expected: FAIL because drafts still live in Employees and actor fields are accepted from DTOs.

- [ ] **Step 3: Move the UI and remove spoofable actors**

- Remove the employee-level tab.
- Render grouped pending suggestions inside project `progress`.
- Resolve adopter/ignorer from `RequestContextService.requirePrincipal()`.
- Remove `actorId` and `actorName` from public DTOs.
- Preserve existing draft records and history.

- [ ] **Step 4: Run tests and browser smoke**

Run Step 2 commands, then Playwright:

```bash
cd frontend
pnpm test:e2e --project=chromium e2e/employee-work-progress.spec.ts
```

Expected: all tests PASS and project progress approval works in Chromium.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/EmployeesPage.tsx frontend/src/pages/ProjectWorkspacePage.tsx \
  frontend/src/pages/ProjectWorkspacePage.less frontend/src/modules/employees \
  backend/src/modules/workbench/employees \
  backend/test/integration/modules/workbench/project-progress-authorization.spec.ts
git commit -m "feat: move progress approval into project workspace"
```

## Task 18: Update all integration fixtures for authenticated defaults

**Files:**
- Modify: `backend/test/integration/modules/workbench/*.spec.ts`
- Modify: `backend/test/e2e/workbench.spec.ts`
- Modify: `frontend/src/test-setup.ts`
- Modify: `frontend/e2e/*.spec.ts`
- Test: all backend integration, frontend unit and Playwright suites

- [ ] **Step 1: Enumerate unauthenticated requests**

Run:

```bash
cd backend
rg -n "request\\(.*getHttpServer|supertest|\\.get\\('/api|\\.post\\('/api|\\.patch\\('/api|\\.delete\\('/api" \
  test/integration test/e2e
```

Classify every request as public auth/health or authenticated business access. No business request remains anonymous.

- [ ] **Step 2: Update fixtures**

- Backend integration tests use `authenticatedRequest()` with the smallest required role.
- Frontend component tests seed AuthProvider with a test principal rather than bypassing route guards.
- Playwright bootstrap creates the super admin once, logs in through the UI, and saves storage state without persisting the access token outside the test process.
- Add explicit employee-vs-admin fixtures for access-control assertions.

- [ ] **Step 3: Run complete application gates**

Run:

```bash
cd backend
pnpm lint
pnpm build
pnpm test:unit -- --runInBand
pnpm test:integration -- --runInBand
pnpm test:e2e -- --runInBand
pnpm verify:migrations:clean

cd ../frontend
pnpm lint
pnpm typecheck
pnpm typecheck:contracts
pnpm test --run
pnpm build
pnpm test:e2e --project=chromium

cd ../desktop
pnpm test
pnpm typecheck
```

Expected: every command exits 0. Record exact suite/test counts in `progress.md`.

- [ ] **Step 4: Commit**

```bash
git add backend/test frontend/src/test-setup.ts frontend/e2e desktop/src \
  progress.md task_plan.md findings.md
git commit -m "test: validate enterprise identity and data isolation"
```

## Task 19: Perform security and browser acceptance

**Files:**
- Modify: `README.md`
- Modify: `backend/README.md`
- Modify: `frontend/README.md`
- Modify: `task_plan.md`
- Modify: `findings.md`
- Modify: `progress.md`

- [ ] **Step 1: Run an authorization matrix**

For super admin, employee A, employee B, project manager and department manager, verify list/detail/create/update/delete/download/search/export/NOVA behavior. Record every checked endpoint and expected 200/403 outcome in `progress.md`.

- [ ] **Step 2: Verify token behavior in a real browser**

Use Chromium to verify:

- first-run administrator setup;
- first-password change;
- access expiry and invisible refresh;
- two simultaneous 401 requests cause one refresh;
- refresh expiry returns to login and restores the route;
- account disable ejects the active browser;
- permission edit updates navigation without a full reload.

- [ ] **Step 3: Verify Electron and Windows boundaries**

- Confirm Electron sends and retains HttpOnly cookies.
- Confirm packaged frontend uses the runtime API origin and allowed-origin configuration.
- Run Windows CI to rebuild `@node-rs/argon2` for Windows and create NSIS.
- Do not report Windows success until the Windows runner completes startup, login, refresh and logout smoke tests.

- [ ] **Step 4: Document operations**

Document:

- how to perform one-time bootstrap;
- how to rotate JWT secrets with active-session revocation;
- how to reset a password;
- how to recover when the last administrator is locked;
- how to inspect and revoke sessions;
- how to run ownership migration;
- how to back up IAM tables before deployment.

- [ ] **Step 5: Final commit**

```bash
git add README.md backend/README.md frontend/README.md \
  task_plan.md findings.md progress.md
git commit -m "docs: operate enterprise authentication and permissions"
```

## Completion criteria

Implementation is complete only when all of the following are true:

- No non-public backend route is callable anonymously.
- Super admin can access and edit all in-scope business data.
- A normal employee cannot read or mutate another employee’s unrelated data through UI, URL, API, search, download, export, Socket, SSE or NOVA.
- Access-token expiration is invisible during normal use and refresh replay revokes the token family.
- Password reset, account disable and session revocation invalidate old credentials immediately.
- User, role, permission, session, audit and ownership-correction pages are functional.
- Historical record counts are unchanged and unresolved ownership is visible.
- Project progress suggestions live in project progress, not the employee directory.
- Backend, frontend, Electron, migration and Chromium gates pass.
- Windows success is claimed only after a native Windows runner validates the packaged build.
