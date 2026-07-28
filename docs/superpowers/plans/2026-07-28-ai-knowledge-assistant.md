# AI Knowledge Assistant Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current basic knowledge chat with a traceable three-pane assistant that searches only selected local/uploaded knowledge and previews citations without leaving the conversation.

**Architecture:** Persist each session's search scope and presentation metadata, pass that scope into parameterized RAG queries, and expose typed streaming lifecycle events. Split the React UI into session navigation, conversation/composer, and a responsive citation drawer so each area has one responsibility.

**Tech Stack:** NestJS 10, Prisma 6, PostgreSQL/pgvector/pg_trgm, Server-Sent Events, React 19, TanStack Query, Semi UI, Vitest, Playwright.

---

## File map

- `backend/prisma/schema.prisma`: session scope, favorite/pin and message question-link fields.
- `backend/prisma/migrations/20260728100000_ai_assistant_workspace/migration.sql`: additive chat migration.
- `backend/src/modules/workbench/knowledge/domain/knowledge-scope.ts`: scope normalization and Prisma/SQL filters.
- `backend/src/modules/workbench/knowledge/application/session.service.ts`: session search, rename, pin and scope persistence.
- `backend/src/modules/workbench/knowledge/application/rag.service.ts`: scoped retrieval and no-evidence behavior.
- `backend/src/modules/workbench/knowledge/interface/http/knowledge.controller.ts`: typed streaming lifecycle.
- `backend/src/modules/workbench/knowledge/interface/http/dto/knowledge.dto.ts`: session/scope DTOs.
- `frontend/src/modules/knowledge/types.ts`, `api.ts`, `sse.ts`: typed client contracts.
- `frontend/src/modules/knowledge/components/KnowledgeAssistantWorkspace.tsx`: three-pane shell.
- `frontend/src/modules/knowledge/components/KnowledgeSessionList.tsx`: searchable session navigation.
- `frontend/src/modules/knowledge/components/KnowledgeChatPanel.tsx`: message orchestration and generation state.
- `frontend/src/modules/knowledge/components/KnowledgeChatInput.tsx`: scope-aware composer.
- `frontend/src/modules/knowledge/components/KnowledgeCitationDrawer.tsx`: anchored source preview.
- `frontend/src/pages/KnowledgeHomePage.tsx` and `.less`: route integration and responsive layout.

### Task 1: Persist session scope and management metadata

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/20260728100000_ai_assistant_workspace/migration.sql`
- Create: `backend/test/integration/prisma/knowledge-assistant-catalog.spec.ts`

- [ ] **Step 1: Write the failing catalog test**

Assert that `knowledge_sessions` contains `scope_type`, `scope_value`, `is_pinned`, and `archived_at`, and `knowledge_messages` contains `reply_to_message_id`.

- [ ] **Step 2: Verify failure**

```bash
cd backend
pnpm test:integration -- --runInBand test/integration/prisma/knowledge-assistant-catalog.spec.ts
```

Expected: FAIL on missing columns.

- [ ] **Step 3: Extend Prisma**

Add:

```prisma
enum KnowledgeScopeType {
  ALL
  PROJECT
  SPACE
  FOLDER
  DOCUMENTS
  RECENT
  @@schema("app")
}
```

Extend `KnowledgeSession`:

```prisma
scopeType  KnowledgeScopeType @default(ALL) @map("scope_type")
scopeValue Json?              @map("scope_value")
isPinned  Boolean            @default(false) @map("is_pinned")
archivedAt DateTime?         @map("archived_at") @db.Timestamptz(6)
```

Extend `KnowledgeMessage` with `replyToMessageId String? @map("reply_to_message_id")`.

- [ ] **Step 4: Add the migration**

Create enum and columns additively, map legacy `status = 'ARCHIVED'` sessions to `archived_at = updated_at`, and add indexes on `(archived_at, is_pinned, updated_at)` and `(scope_type)`.

- [ ] **Step 5: Generate, migrate and test**

```bash
cd backend
pnpm prisma:generate
pnpm prisma:migrate:deploy
pnpm test:integration -- --runInBand test/integration/prisma/knowledge-assistant-catalog.spec.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations/20260728100000_ai_assistant_workspace backend/test/integration/prisma/knowledge-assistant-catalog.spec.ts
git commit -m "feat: add knowledge assistant session metadata"
```

### Task 2: Implement session management APIs

**Files:**
- Modify: `backend/src/modules/workbench/knowledge/application/session.service.ts`
- Modify: `backend/src/modules/workbench/knowledge/interface/http/knowledge.controller.ts`
- Modify: `backend/src/modules/workbench/knowledge/interface/http/dto/knowledge.dto.ts`
- Modify: `backend/test/integration/modules/workbench/knowledge.controller.spec.ts`
- Create: `backend/test/unit/modules/workbench/knowledge/session.service.spec.ts`

- [ ] **Step 1: Write failing tests**

Cover:

```ts
await service.list({ search: '评审' });
expect(prisma.knowledgeSession.findMany).toHaveBeenCalledWith(expect.objectContaining({
  where: { archivedAt: null, title: { contains: '评审', mode: 'insensitive' } },
  orderBy: [{ isPinned: 'desc' }, { updatedAt: 'desc' }],
}));

await service.update('s1', {
  title: '项目行动项',
  isPinned: true,
  scope: { type: 'PROJECT', projectId: 'p1' },
});
```

Verify archive is idempotent and `get` returns scope plus ordered messages.

- [ ] **Step 2: Run and verify failure**

```bash
cd backend
pnpm test:unit -- --runInBand test/unit/modules/workbench/knowledge/session.service.spec.ts
pnpm test:integration -- --runInBand test/integration/modules/workbench/knowledge.controller.spec.ts
```

Expected: FAIL on unsupported query/update fields.

- [ ] **Step 3: Add DTOs**

Define discriminated scope input validation:

```ts
type KnowledgeScopeInput =
  | { type: 'ALL' }
  | { type: 'PROJECT'; projectId: string }
  | { type: 'SPACE'; spaceId: string }
  | { type: 'FOLDER'; folderWatchId: string }
  | { type: 'DOCUMENTS'; documentIds: string[] }
  | { type: 'RECENT' };
```

Add list query `search?: string` and update fields `title?: string`, `isPinned?: boolean`, `scope?: KnowledgeScopeInput`.

- [ ] **Step 4: Implement service methods**

Implement `list`, `get`, `update`, and `archive` with active-record checks. Trim titles, cap them at 60 characters, deduplicate document IDs, and reject empty `DOCUMENTS` scopes.

- [ ] **Step 5: Add routes**

- `GET /knowledge/sessions?search=`
- `PATCH /knowledge/sessions/:id`
- `DELETE /knowledge/sessions/:id`

Keep the existing create/get paths compatible.

- [ ] **Step 6: Run tests and build**

```bash
cd backend
pnpm test:unit -- --runInBand test/unit/modules/workbench/knowledge/session.service.spec.ts
pnpm test:integration -- --runInBand test/integration/modules/workbench/knowledge.controller.spec.ts
pnpm build
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/src/modules/workbench/knowledge backend/test/unit/modules/workbench/knowledge/session.service.spec.ts backend/test/integration/modules/workbench/knowledge.controller.spec.ts
git commit -m "feat: manage knowledge assistant sessions"
```

### Task 3: Scope RAG retrieval and enforce evidence

**Files:**
- Create: `backend/src/modules/workbench/knowledge/domain/knowledge-scope.ts`
- Create: `backend/test/unit/modules/workbench/knowledge/knowledge-scope.spec.ts`
- Modify: `backend/src/modules/workbench/knowledge/application/rag.service.ts`
- Modify: `backend/test/unit/modules/workbench/knowledge/knowledge-file.service.spec.ts`

- [ ] **Step 1: Write failing scope and RAG tests**

Verify the normalized scope produces parameterized predicates:

```ts
expect(buildScopeFilter({ type: 'DOCUMENTS', documentIds: ['d1', 'd1', 'd2'] }))
  .toEqual({ sql: 'AND cd.id = ANY($scopeDocumentIds)', params: { scopeDocumentIds: ['d1', 'd2'] } });
```

Verify `PROJECT`, `SPACE`, `FOLDER`, `RECENT`, and `ALL`; verify only `index_status = 'READY'` documents are eligible; verify no relevant chunks returns `hasEvidence: false` without calling the model.

- [ ] **Step 2: Verify failure**

```bash
cd backend
pnpm test:unit -- --runInBand test/unit/modules/workbench/knowledge/knowledge-scope.spec.ts
```

Expected: FAIL because scope filtering does not exist.

- [ ] **Step 3: Implement scope normalization**

Use `Prisma.sql` and bound parameters, not string interpolation or `$queryRawUnsafe`. Map:

- `PROJECT` through `content_documents.project_id`.
- `SPACE` through `content_documents.space_id`.
- `FOLDER` through `folder_files.document_id`.
- `DOCUMENTS` through a bounded ID array.
- `RECENT` to documents updated in the last 30 days.

- [ ] **Step 4: Refactor RagService**

Change `ask` to accept:

```ts
{
  question: string;
  history: Array<{ role: string; content: string }>;
  scope: KnowledgeScope;
}
```

Return retrieval metadata:

```ts
{
  stream: ReadableStream<Uint8Array> | null;
  citations: ChunkCitation[];
  totalFound: number;
  relevantCount: number;
  searchedDocumentCount: number;
  hasEvidence: boolean;
}
```

If `relevantCount === 0`, return `stream: null` and do not call DeepSeek. The controller emits the fixed no-evidence response.

- [ ] **Step 5: Run tests and build**

```bash
cd backend
pnpm test:unit -- --runInBand test/unit/modules/workbench/knowledge/knowledge-scope.spec.ts
pnpm build
```

Expected: PASS and no `$queryRawUnsafe` remains in `rag.service.ts`.

- [ ] **Step 6: Commit**

```bash
git add backend/src/modules/workbench/knowledge/domain/knowledge-scope.ts backend/src/modules/workbench/knowledge/application/rag.service.ts backend/test/unit/modules/workbench/knowledge
git commit -m "feat: scope knowledge retrieval"
```

### Task 4: Provide typed streaming lifecycle events

**Files:**
- Modify: `backend/src/modules/workbench/knowledge/interface/http/knowledge.controller.ts`
- Modify: `backend/test/unit/modules/workbench/knowledge-sse.contract.spec.ts`
- Modify: `frontend/src/modules/knowledge/sse.ts`
- Modify: `frontend/src/modules/knowledge/__tests__/sse.test.ts`

- [ ] **Step 1: Write failing SSE contract tests**

Expect this sequence:

```text
event: retrieval_started
event: retrieval_completed
event: answer_delta
event: citation
event: completed
```

On no evidence, expect `retrieval_completed` with `relevantCount: 0`, one fixed `answer_delta`, and `completed`. On failure, expect `failed` with a stable code and retryability flag.

- [ ] **Step 2: Run tests and verify failure**

```bash
cd backend
pnpm test:unit -- --runInBand test/unit/modules/workbench/knowledge-sse.contract.spec.ts
cd ../frontend
pnpm test -- src/modules/knowledge/__tests__/sse.test.ts
```

Expected: FAIL because current events are `status`, `token`, `citations`, `done`, and `error`.

- [ ] **Step 3: Implement backend lifecycle**

Create a local `writeEvent(name, payload)` helper. Emit stable JSON objects:

```ts
writeEvent('retrieval_started', { scope: session.scopeType });
writeEvent('retrieval_completed', { searchedDocumentCount, totalFound, relevantCount });
writeEvent('answer_delta', { text });
writeEvent('citation', citation);
writeEvent('completed', { messageId, tokenCount });
writeEvent('failed', { code, message, retryable });
```

Save the assistant message before `completed`.

- [ ] **Step 4: Update the frontend parser**

Replace the event union with:

```ts
export type KnowledgeSseEvent =
  | 'retrieval_started'
  | 'retrieval_completed'
  | 'answer_delta'
  | 'citation'
  | 'completed'
  | 'failed';
```

Keep chunk buffering and CRLF handling.

- [ ] **Step 5: Run tests**

Run the commands from Step 2.

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/src/modules/workbench/knowledge/interface/http/knowledge.controller.ts backend/test/unit/modules/workbench/knowledge-sse.contract.spec.ts frontend/src/modules/knowledge/sse.ts frontend/src/modules/knowledge/__tests__/sse.test.ts
git commit -m "feat: stream knowledge assistant lifecycle"
```

### Task 5: Update frontend API and session navigation

**Files:**
- Modify: `frontend/src/modules/knowledge/types.ts`
- Modify: `frontend/src/modules/knowledge/api.ts`
- Modify: `frontend/src/modules/knowledge/__tests__/api.test.ts`
- Modify: `frontend/src/modules/knowledge/components/KnowledgeSessionList.tsx`
- Modify: `frontend/src/modules/knowledge/__tests__/KnowledgeSessionList.test.tsx`

- [ ] **Step 1: Write failing API and navigation tests**

Verify list search encoding, session patch requests, pin ordering, rename, search filtering, active selection, new chat and delete confirmation.

- [ ] **Step 2: Run tests and verify failure**

```bash
cd frontend
pnpm test -- src/modules/knowledge/__tests__/api.test.ts src/modules/knowledge/__tests__/KnowledgeSessionList.test.tsx
```

Expected: FAIL on missing API and controls.

- [ ] **Step 3: Update contracts and API**

Add `KnowledgeScope`, `KnowledgeScopeType`, `isPinned`, `scope`, and `archivedAt`. Add:

```ts
listSessions(search?: string)
updateSession(id: string, input: { title?: string; isPinned?: boolean; scope?: KnowledgeScope })
archiveSession(id: string)
```

Change `chatStream` body to `{ question, scope }`.

- [ ] **Step 4: Rebuild KnowledgeSessionList**

Use Semi UI `Input`, `Button`, `Dropdown`, `Modal.confirm`, and icons. Keep local search text debounced by 250ms; use query keys `['knowledge-sessions', search]`. Pin and rename update the list optimistically with rollback on error.

- [ ] **Step 5: Run tests, typecheck and lint**

```bash
cd frontend
pnpm test -- src/modules/knowledge/__tests__/api.test.ts src/modules/knowledge/__tests__/KnowledgeSessionList.test.tsx
pnpm typecheck
pnpm lint
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/modules/knowledge
git commit -m "feat: improve knowledge session navigation"
```

### Task 6: Build the three-pane assistant workspace

**Files:**
- Create: `frontend/src/modules/knowledge/components/KnowledgeAssistantWorkspace.tsx`
- Create: `frontend/src/modules/knowledge/components/KnowledgeCitationDrawer.tsx`
- Create: `frontend/src/modules/knowledge/__tests__/KnowledgeAssistantWorkspace.test.tsx`
- Create: `frontend/src/modules/knowledge/__tests__/KnowledgeCitationDrawer.test.tsx`
- Modify: `frontend/src/modules/knowledge/components/KnowledgeCitationCard.tsx`
- Modify: `frontend/src/pages/KnowledgeHomePage.tsx`
- Modify: `frontend/src/pages/KnowledgeHomePage.less`
- Modify: `frontend/src/pages/__tests__/KnowledgeHomePage.test.tsx`

- [ ] **Step 1: Write failing layout tests**

Verify:

- desktop has session navigation, conversation and citation pane.
- clicking `[1]` opens the matching citation without changing `window.location.hash`.
- closing the source pane preserves messages.
- widths below 1100px render citations in a Semi UI `SideSheet`.
- no inline `<style>` elements are rendered.

- [ ] **Step 2: Run tests and verify failure**

```bash
cd frontend
pnpm test -- src/modules/knowledge/__tests__/KnowledgeAssistantWorkspace.test.tsx src/modules/knowledge/__tests__/KnowledgeCitationDrawer.test.tsx src/pages/__tests__/KnowledgeHomePage.test.tsx
```

Expected: FAIL against the current two-pane chat and route-changing citation card.

- [ ] **Step 3: Build KnowledgeCitationDrawer**

Accept `citation`, `open`, `onClose`, `onOpenDocument`, and `onDownload`. Render title, type, location label, text excerpt and keyword highlight. Do not embed the full Office preview.

- [ ] **Step 4: Build KnowledgeAssistantWorkspace**

Compose `KnowledgeSessionList`, `KnowledgeChatPanel`, and `KnowledgeCitationDrawer`. Hold only selected session and selected citation in the shell. Use CSS grid on desktop and a SideSheet on narrow screens.

- [ ] **Step 5: Integrate KnowledgeHomePage**

Replace the current chat-tab inline layout with:

```tsx
<KnowledgeAssistantWorkspace
  sessionId={chatSessionId}
  onSessionChange={handleChatSelect}
/>
```

Move all component CSS from inline `<style>` blocks into `KnowledgeHomePage.less` with `knowledge-assistant__*` names.

- [ ] **Step 6: Run focused tests and checks**

```bash
cd frontend
pnpm test -- src/modules/knowledge/__tests__/KnowledgeAssistantWorkspace.test.tsx src/modules/knowledge/__tests__/KnowledgeCitationDrawer.test.tsx src/pages/__tests__/KnowledgeHomePage.test.tsx
pnpm typecheck
pnpm lint
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/modules/knowledge frontend/src/pages/KnowledgeHomePage.tsx frontend/src/pages/KnowledgeHomePage.less frontend/src/pages/__tests__/KnowledgeHomePage.test.tsx
git commit -m "feat: add three-pane knowledge assistant"
```

### Task 7: Complete the conversation interaction

**Files:**
- Modify: `frontend/src/modules/knowledge/components/KnowledgeChatPanel.tsx`
- Modify: `frontend/src/modules/knowledge/components/KnowledgeChatInput.tsx`
- Modify: `frontend/src/modules/knowledge/components/KnowledgeMessageBubble.tsx`
- Modify: `frontend/src/modules/knowledge/__tests__/KnowledgeChatPanel.test.tsx`
- Modify: `frontend/src/modules/knowledge/__tests__/KnowledgeMessageBubble.test.tsx`

- [ ] **Step 1: Write failing interaction tests**

Cover:

- scope and indexed-document count are visible.
- empty state has four suggested questions.
- `Enter` sends and `Shift+Enter` inserts a newline.
- generation can be stopped with `AbortController`.
- retrieval status changes to answer streaming.
- copy, retry, regenerate and edit-question actions work.
- no-evidence and retryable errors have distinct messages.
- a citation click calls `onCitationSelect`.

- [ ] **Step 2: Run tests and verify failure**

```bash
cd frontend
pnpm test -- src/modules/knowledge/__tests__/KnowledgeChatPanel.test.tsx src/modules/knowledge/__tests__/KnowledgeMessageBubble.test.tsx
```

Expected: FAIL on missing controls and states.

- [ ] **Step 3: Implement the state machine**

Use:

```ts
type GenerationState =
  | { type: 'idle' }
  | { type: 'retrieving'; searchedDocuments?: number }
  | { type: 'streaming'; text: string }
  | { type: 'failed'; message: string; retryable: boolean };
```

Keep one active `AbortController`. Abort on stop, session switch and unmount. Accumulate only `answer_delta` into the current assistant bubble and append citations by stable `(documentId, chunkIndex)`.

- [ ] **Step 4: Implement composer and message actions**

Use Semi UI controls. Autosize the text area, disable send when scope has zero indexed files, preserve failed questions for retry, and expose callbacks for copy/regenerate/edit/create-task.

- [ ] **Step 5: Run tests and checks**

```bash
cd frontend
pnpm test -- src/modules/knowledge/__tests__/KnowledgeChatPanel.test.tsx src/modules/knowledge/__tests__/KnowledgeMessageBubble.test.tsx
pnpm typecheck
pnpm lint
pnpm build
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/modules/knowledge/components frontend/src/modules/knowledge/__tests__
git commit -m "feat: complete knowledge assistant interactions"
```

### Task 8: End-to-end and regression verification

**Files:**
- Modify: `frontend/e2e/knowledge-rag.spec.ts`
- Modify: `backend/test/integration/modules/workbench/knowledge.controller.spec.ts`

- [ ] **Step 1: Expand the RAG end-to-end scenario**

The scenario must:

1. Select the current-project scope.
2. Ask a question found in an indexed local/uploaded file.
3. Observe retrieval status and streamed answer.
4. Click citation `[1]`.
5. Assert the right pane shows the exact source title and location without route change.
6. Ask a follow-up and confirm the same session is used.
7. Switch to an empty scope and assert the no-evidence response contains no fabricated citation.

- [ ] **Step 2: Run backend verification**

```bash
cd backend
pnpm test:unit -- --runInBand
pnpm test:integration -- --runInBand
pnpm lint
pnpm build
```

Expected: all commands exit 0.

- [ ] **Step 3: Run frontend verification**

```bash
cd frontend
pnpm test
pnpm typecheck
pnpm lint
pnpm build
pnpm test:e2e -- knowledge-rag.spec.ts
```

Expected: all commands exit 0 and the RAG scenario passes.

- [ ] **Step 4: Commit**

```bash
git add frontend/e2e/knowledge-rag.spec.ts backend/test/integration/modules/workbench/knowledge.controller.spec.ts
git commit -m "test: verify knowledge assistant workspace"
```
