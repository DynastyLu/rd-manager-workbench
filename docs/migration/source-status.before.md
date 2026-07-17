# Source Status Snapshot (Before Import)

Captured immediately before the framework copy using:

```sh
git -C <source> status --short --branch --untracked-files=normal
git -C <source> status --porcelain=v1 --untracked-files=normal | shasum -a 256
```

## `/Users/dynastylu/Desktop/AICode/treasure-box`

- Branch and HEAD: `master` at `87c7ad0a34cc83f150a82f102736699a510d3dcc`
- Porcelain SHA-256: `613a57b2e541f64937611419ab94a9501bc2c454a015c81724d3049196efc743`

```text
## master
 M README.md
 D backend/.env.example
 D backend/.gitignore
 D backend/db/database.js
 D backend/middleware/adminMiddleware.js
 D backend/middleware/authMiddleware.js
 D backend/package-lock.json
 D backend/package.json
 D backend/routes/auth.js
 D backend/routes/ocr.js
 D backend/server.js
 D backend/services/__tests__/excelService.test.js
 D backend/services/authService.js
 D backend/services/claudeService.js
 D backend/services/excelService.js
 D backend/tests/auth.test.js
 D backend/tests/authService.test.js
 D backend/tests/claudeService.test.js
 D backend/tests/excelService.test.js
 D backend/tests/routes.test.js
 D backend/tests/setup.js
 D backend/tests/users.test.js
 D backend/vitest.config.js
 D docs/superpowers/specs/2026-03-23-tab-router-design.md
 D docs/superpowers/specs/2026-03-24-user-management-design.md
 D frontend/.gitignore
 D frontend/README.md
 D frontend/eslint.config.js
 D frontend/index.html
 D frontend/package-lock.json
 D frontend/package.json
 D frontend/pnpm-lock.yaml
 D frontend/public/favicon.svg
 D frontend/public/icons.svg
 D frontend/public/mockServiceWorker.js
 D frontend/src/App.css
 D frontend/src/App.jsx
 D frontend/src/assets/hero.png
 D frontend/src/assets/react.svg
 D frontend/src/assets/vite.svg
 D frontend/src/components/EditableTable.jsx
 D frontend/src/components/Header/Header.jsx
 D frontend/src/components/Header/Header.less
 D frontend/src/components/ImageUploader.jsx
 D frontend/src/components/Layout/__tests__/Layout.test.jsx
 D frontend/src/components/LoadingOverlay.jsx
 D frontend/src/components/OcrTool/BatchBar.jsx
 D frontend/src/components/OcrTool/DropZone.jsx
 D frontend/src/components/OcrTool/FileCard.jsx
 D frontend/src/components/OcrTool/__tests__/BatchBar.test.jsx
 D frontend/src/components/OcrTool/__tests__/DropZone.test.jsx
 D frontend/src/components/OcrTool/__tests__/FileCard.test.jsx
 D frontend/src/components/ProtectedRoute.jsx
 D frontend/src/components/Sidebar/Sidebar.jsx
 D frontend/src/components/__tests__/EditableTable.test.jsx
 D frontend/src/components/__tests__/ImageUploader.test.jsx
 D frontend/src/components/__tests__/ProtectedRoute.test.jsx
 D frontend/src/context/AuthContext.jsx
 D frontend/src/context/__tests__/AuthContext.test.jsx
 D frontend/src/index.css
 D frontend/src/lib/authFetch.js
 D frontend/src/main.jsx
 D frontend/src/main.tsx
 D frontend/src/mocks/browser.ts
 D frontend/src/mocks/handlers/auth.ts
 D frontend/src/mocks/handlers/index.ts
 D frontend/src/mocks/handlers/ocr.ts
 D frontend/src/mocks/handlers/users.ts
 D frontend/src/mocks/server.ts
 D frontend/src/pages/AdminUsers.jsx
 D frontend/src/pages/Login.jsx
 D frontend/src/pages/OcrTool.jsx
 D frontend/src/pages/__tests__/Login.test.jsx
 D frontend/src/router/routes.js
 D frontend/src/stores/__tests__/auth.integration.test.tsx
 D frontend/src/test-setup.ts
 D frontend/tsconfig.json
 D frontend/vite.config.js
 D frontend/vite.config.ts
?? .commitlintrc.json
?? .dockerignore
?? .env.example
?? .github/
?? .gitignore
?? .husky/
?? .lintstagedrc.json
?? .prettierignore
?? .prettierrc
?? .storybook/
?? Dockerfile
?? components.json
?? docs/GUIDE.md
?? docs/superpowers/plans/
?? e2e/
?? eslint.config.js
?? index.html
?? nginx.conf
?? package.json
?? playwright.config.ts
?? pnpm-lock.yaml
?? public/
?? renovate.json
?? scripts/
?? src/
?? tsconfig.json
?? tsconfig.node.json
?? vite.config.ts
```

## `/Users/dynastylu/Desktop/AICode/backend-core-platform`

- Branch and HEAD: `main` at `b7c1885cf03ea7e3869483bae42ca8f7a9797611`
- Porcelain SHA-256: `5dd1d001e6390187d7ad92b19dbe16c4a3a5b0c9c25ab1cc3a8afc68ccb7badd`

```text
## main
 M .env.example
 M nest-cli.json
 M package.json
 M pnpm-lock.yaml
 M prisma/schema.prisma
 M src/app.module.ts
 M src/infrastructure/config/env.schema.ts
 M src/infrastructure/logger/app-logger.service.ts
 M src/infrastructure/prisma/platform-prisma.service.ts
 M src/main.ts
 M src/modules/platform/tenant/tenant.module.ts
 M src/modules/system/health/health.module.ts
 M src/modules/system/health/interface/http/health.controller.ts
 M test/e2e/app.spec.ts
 M test/integration/config/app-config.module.spec.ts
 M test/jest-e2e.json
 M test/unit/infrastructure/config/env.schema.spec.ts
?? .dockerignore
?? Dockerfile
?? docker-compose.yml
?? docs/superpowers/
?? findings.md
?? prisma/migrations/
?? progress.md
?? scripts/
?? src/bootstrap/
?? src/infrastructure/queue/
?? src/infrastructure/storage/
?? src/modules/platform/tenant/infrastructure/prisma-tenant.repository.ts
?? src/modules/system/ai-assistant-mock/
?? src/modules/system/jobs/
?? src/modules/system/metrics/
?? src/modules/system/queue-admin/
?? src/modules/tag-management-mock/
?? src/modules/tools/
?? src/shared/contracts/jobs/
?? src/workers/
?? task_plan.md
?? test/e2e/helpers/
?? test/e2e/operations.spec.ts
?? test/e2e/paper-auth.spec.ts
?? test/e2e/tag-management.spec.ts
?? test/e2e/tools-ocr.spec.ts
?? test/integration/infrastructure/queue/
?? test/integration/infrastructure/storage/
?? test/unit/infrastructure/prisma/platform-prisma.service.spec.ts
?? test/unit/infrastructure/storage/
?? test/unit/modules/system/
?? test/unit/scripts/
?? test/unit/shared/contracts/
?? test/unit/workers/
?? var/
```
