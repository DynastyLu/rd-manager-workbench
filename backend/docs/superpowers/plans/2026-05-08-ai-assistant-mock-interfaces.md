# AI Assistant Mock Interfaces Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add same-address mock endpoints for the visual-workbench AI assistant knowledge base and conversation APIs.

**Architecture:** Add a focused NestJS mock module under `src/modules/system/ai-assistant-mock`. The `/sys/...` routes return the exact `{ code, data, msg }` response shape expected by visual-workbench and bypass the platform-wide `{ success, data }` interceptor by writing through the raw Express response.

**Tech Stack:** NestJS 10, TypeScript, Jest e2e tests.

---

### Task 1: Route Contract Tests

**Files:**
- Modify: `backend-core-platform/test/e2e/app.spec.ts`

- [ ] **Step 1: Write failing tests**

Add e2e checks for:
- `POST /sys/knowledge/getList` returns `code: 200`, `data.list[]`, `idKey`, `knowledgeName`, `knowledgeType`.
- `POST /sys/knowledgeFile/getList` returns file pagination and file fields.
- `POST /sys/knowledge/fileSearch` returns `text`, `files[]`, `searchDocs[]`.
- `POST /sys/knowledgeSession/getList`, `POST /sys/knowledgeSession/addSession`, `GET /sys/knowledgeSession/getSessionDetail`, and `GET /sys/knowledgeSession/clear` return frontend-compatible payloads.

- [ ] **Step 2: Verify RED**

Run: `pnpm test:e2e -- app.spec.ts`

Expected: FAIL because `/sys/...` routes are not registered.

### Task 2: Mock Module

**Files:**
- Create: `backend-core-platform/src/modules/system/ai-assistant-mock/ai-assistant-mock.data.ts`
- Create: `backend-core-platform/src/modules/system/ai-assistant-mock/ai-assistant-mock.service.ts`
- Create: `backend-core-platform/src/modules/system/ai-assistant-mock/interface/http/ai-assistant-mock.controller.ts`
- Create: `backend-core-platform/src/modules/system/ai-assistant-mock/ai-assistant-mock.module.ts`
- Modify: `backend-core-platform/src/app.module.ts`

- [ ] **Step 1: Implement minimal mock state and service**

Use in-memory arrays for knowledge bases, files, sessions, and deterministic search references.

- [ ] **Step 2: Implement raw-response controller**

Each endpoint calls `response.status(200).json({ code: 200, data, msg: "success" })` so visual-workbench sees the business envelope directly.

- [ ] **Step 3: Register module**

Import `AiAssistantMockModule` in `AppModule`.

### Task 3: Same-Address `/sys` Routes

**Files:**
- Modify: `backend-core-platform/src/main.ts`
- Modify: `backend-core-platform/test/e2e/app.spec.ts`

- [ ] **Step 1: Exclude `/sys/(.*)` from the global `/api` prefix**

Use Nest's global prefix exclude option in both runtime bootstrap and e2e app setup.

- [ ] **Step 2: Verify GREEN**

Run: `pnpm test:e2e -- app.spec.ts`

Expected: PASS.

- [ ] **Step 3: Type/lint verification**

Run: `pnpm test -- ai-assistant`

Expected: PASS or no matching tests. Then run a broader targeted check if needed.
