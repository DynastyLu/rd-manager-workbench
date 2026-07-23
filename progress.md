# 进度日志

## 2026-07-22：P0 交互基础统一启动

- 按用户确认的优先级直接在当前工作区开始 P0，不创建隔离工作树。
- 已保护上一批项目管理闭环未提交改动，并完成 UI 组件、原生控件、页面地标、焦点动画和 URL 状态基线审计。
- 新增 P0 设计规格与实施计划；下一步先扩展静态失败测试，再建立 Semi 公共组件层。
- 已扩充工作台变量、弹窗遮罩/安全间距、焦点环和 reduced-motion；清除 7 处 `outline: none` / `transition: all`。
- 已新增 WorkspaceSelect、WorkspaceFormSelect、WorkspaceFormActions、SaveStatus 和 SemiCompat；生产 53 处原生下拉与 14 个旧 Shadcn 消费者均完成迁移。
- 已修复迁移暴露的表单提交、非受控输入、任务状态选项和兼容弹窗无标题问题；风险/问题/决策提交与弹窗可访问名称已由测试和 Chromium 验证。
- 已修复知识库、多维表格和情报简报重复 `main`；静态约束阻止重复主地标、原生控件、旧 UI 导入和不安全焦点/动画规则回流。
- 已新增 URL 状态工具并接入项目、我的工作、日历、知识库、多维表格和搜索；默认值精简、非法值回退、未知参数保留，刷新后恢复主要视图与筛选。
- 知识库和多维表格新增统一保存状态，保存中、未保存、已保存和失败对用户明确可见。
- 验证：typecheck、contracts、ESLint、production build、`git diff --check` 通过；关键 P0 单元组 51/53 通过，剩余 1 项为 Semi 组件耗时超过旧 5 秒阈值、1 项旧选择交互已改为组件可访问性验证；单独运行均通过。真实 Chromium smoke 11/11 通过。
- 已完成全量 Semi 交互测试迁移：182 个测试套件、413 项测试全部通过，0 失败。
- 已修复知识库自动保存竞态，旧请求不再把新编辑误标为已保存；URL 连续更新不再丢参数。
- 日历 URL 同步已移出 FullCalendar 渲染回调，页面切换不再被旧日历状态覆盖；旧 `/knowledge` 跳转 `/docs` 时保留收藏、搜索等查询参数。
- Playwright 默认验收端口对齐项目本地端口 `4312`，不再因 `4174` 被后端 CORS 拒绝；Chromium 完整 12/12 通过。
- 最终门禁：`typecheck`、`typecheck:contracts`、ESLint、production build、`git diff --check` 和 Chromium E2E 全部通过。

## 会话：2026-07-20（组件库控件与项目资料排版复核）

- 用户指出日历仍出现浏览器原生日期面板，并报告项目详情“文档与资料”附件区排版错乱。
- 真实 Chromium 已确认日历创建弹窗为 3 个原生 datetime-local、1 个原生 select、0 个 Semi DatePicker。
- 静态扫描已列出全部原生 date/datetime-local/select 使用点；将优先消除所有业务日期原生弹层，并处理截图中的日历项目下拉。
- 项目资料排版根因是共享 `FileAttachments` 样式寄居在知识库页面 Less，且附件内容没有项目卡片的 18px 水平内边距。
- 新增统一 `DateTimePickerField`，将通知中心、多维表单、行业日报、问题、会议、非项目研发、合作方协议/沟通、资源负荷中的 17 组原生日期/时间控件全部迁移到 Semi DatePicker。
- 日历创建弹窗的项目下拉迁移为 Semi Select；浏览器实测弹窗包含 3 个 Semi DatePicker、2 个 Semi Select，原生日期与原生下拉均为 0，Semi 日期弹层可正常展开。
- `FileAttachments` 获得组件专属 Less；项目资料页浏览器实测四边 padding 均为 18px，标题、说明、上传按钮和空状态已对齐。
- 新增生产源码静态控件契约测试，阻止后续重新引入浏览器原生日期/时间输入。
- 验证通过：前端 83 files / 392 tests、typecheck、lint、production build、Chromium E2E 7/7、`git diff --check`；原生 select 余量为 53 处/18 文件，已记录为后续独立迁移范围。

## 会话：2026-07-20（全项目弹窗底部操作区复核）

- 用户报告项目详情“新建项目工作项”保存按钮贴弹窗底边，要求检查全部同类问题。
- 静态检索已覆盖前端全部 Modal、footer 和内部 action 容器；确认大量业务弹窗采用 `footer={null}`。
- 真实 Chromium 盒模型审计确认根因：Modal content 仅有左右 24px padding，body 无 padding；只有 footer 提供上下 24px margin。
- 下一步按 TDD 增加无 footer 弹窗底部安全间距用例，再实施一处全局修复并复跑全量门禁。
- 已先增加项目工作项真实浏览器用例并确认 RED：保存按钮底部间距实测仅 `1px`，期望至少 `24px`。
- 在全局 workspace token 中为 `.semi-modal-content > .semi-modal-body:last-child` 增加 `24px` 底部安全区，避免逐页面补丁；同一用例转为 GREEN。
- 浏览器端已同时验收标准 footer、无 footer 和旧 Radix Dialog 三类结构，6 个 smoke 场景全部通过；修复后的项目弹窗按钮右侧/底部均为 `25px`。
- 最终门禁：前端 82 个测试文件 / 390 项测试全部通过；ESLint、TypeScript、生产构建通过。

## 会话：2026-07-18（飞书式全功能交付重新分期）

- 用户确认以飞书式项目、任务日程、业务对象库、会议资料、知识库和自动化数据为本地单人产品方向，并要求前后端完整实现。
- 新版工作空间路由、AppShell 和目录入口已直接提交到 `main`：`3d8fdd3`、`973943e`、`1435df8` 等。前端质量门禁在合并前为 29 个测试文件、73 项测试、lint、typecheck 和生产构建通过；目录页合并后实现代理报告 31 个文件、80 项测试与构建通过，待下一阶段开始前再次复验。
- 新总规格：`docs/superpowers/specs/2026-07-18-feishu-style-rd-platform-delivery-design.md`。交付按五阶段依赖推进，第一阶段为项目空间与我的工作。
- 用户要求后续功能实现直接写入主目录而非只停留在隔离工作区；已确认后续通过验证的原子提交直接进入 `main`。
- 用户进一步收敛产品目标为：项目管理、日常工作整理、会议记录、文档/知识保存、日历提醒和多维表格。已新增完整需求规格 `docs/product/2026-07-18-local-feishu-style-rd-workbench-requirements.md`，作为后续替代旧菜单式需求的唯一功能依据。

> **当前工程基线（2026-07-18）：** 直接工程迁移 Tasks 1–4 均已完成。当前代码与命令位于 `frontend/` 和 `backend/`；旧根 pnpm workspace、`apps/`、`packages/` 及其命令仅是以下日志中的历史记录，不应继续执行。

| 直接迁移任务 | 状态 | 工程落点 |
|---|---|---|
| Task 1：建立可追溯的真实工程副本 | complete | `frontend/`、`backend/`、`docs/migration/` |
| Task 2：前端旧业务替换 | complete | `frontend/` |
| Task 3：后端旧业务替换与 PostgreSQL 接入 | complete | `backend/` |
| Task 4：删除错误自建结构与独立运行验证 | complete | 根元数据；实际命令在 `frontend/`、`backend/` |

## 会话：2026-07-18（全量业务实施恢复）

### 阶段 4：MVP 功能实现
- **状态：** in_progress
- 项目执行 P0 已直接合并至 `main`：项目、里程碑、任务及依赖、进展上报、项目健康度和首页驾驶舱均已接通 API；后端单元/集成/E2E、前后端 lint、类型检查和构建已在合并前验证。
- 当前进入申报认定 P0：采用通用可配置流程，依次交付案件、条件、材料与不可覆盖版本、证据、节点完成校验、补正和提交快照。
- 申报认定 P0 已直接合并至 `main`：Prisma 前向迁移已部署到本机库；流程模板、案件、节点、条件、材料追加版本、证据、补正和提交 API 与案件工作台均已接通。节点完成会校验前置节点、必需条件和必需材料；案件与项目关联为必填。合并后前端 25 个文件/56 项测试、lint、类型检查、生产构建通过；后端单元 14 套件/32 项、集成 9 套件/31 项、E2E 2 项、lint 与 Nest build 通过；运行中服务的申报模板和案件列表接口返回正常。
- 已修复前后端分别监听 4312/4311 时的跨域拦截：根因是后端未处理浏览器预检 OPTIONS；新增仅允许 `http://127.0.0.1:4312` 的 CORS 配置与 E2E 回归，运行中服务已验证 OPTIONS 204 与实际 GET 响应头。
- 用户授权继续完成全部剩余功能；管理闭环 P0、行业情报 P0 与数据治理 P0 计划任务已并行启动。P1/P2 将在现有执行槽释放后接续，并继续直接合并到 `main`。
- 用户确认体验定位调整为“本地单人、飞书式研发工作台”；新增设计基线规定工作台/项目空间/申报/管理闭环/情报/数据中心的信息架构，明确不实现多人协作与云端能力。
- 已在 `feature/full-prd-implementation` 隔离分支创建工作区：`/Users/dynastylu/Desktop/AICode/rd-manager-workbench/.worktrees/full-prd-implementation`。
- 前端依赖安装后 `pnpm test` 通过：12 个文件、28 个测试。
- 后端全新安装需先执行既有的 `pnpm prisma:generate`；生成后 `pnpm test:unit` 可运行。此为当前框架生成前置条件，后续计划在每项后端验证前显式执行。
- 已将完整规格拆为七份可独立交付的计划队列；当前写入 `docs/superpowers/plans/2026-07-18-project-execution-p0.md`，先实现项目、里程碑、任务、进展和首页驾驶舱。
- 项目执行数据模型质量审查发现：全局查询需要额外索引，已在数据模型任务中以仅新增索引的前向迁移修复；任务与里程碑跨项目一致性将在下一项 `TasksService` 写入校验中强制，实施计划已明确该不变量。
- 已合并项目执行数据模型、测试库前向迁移、前端本地 API 契约与质量门禁至 `feature/full-prd-implementation`。测试库当前 4 份迁移均已部署；后端单元 8/19、集成 5/7、lint/build 通过，前端 `pnpm check`（含 31 项测试、契约编译、Vite/Storybook 构建）通过。
- 已合并项目健康度、项目 CRUD/软归档 API、驾驶舱首页和项目列表/表单。两轮审查修复了健康度数量、DTO `null`、完成里程碑可见性、归档更新竞态、编辑详情缓存失效和标题语义。集成后：后端单元 10/23、集成 6/12、lint/build 通过；前端 `pnpm check` 通过（39 项测试、契约编译、Vite/Storybook 构建）。

## 会话：2026-07-17

### 阶段 1：需求设计与范围确认
- **状态：** complete
- **开始时间：** 2026-07-17
- 执行的操作：
  - 完整读取并渲染 6 页需求文档。
  - 提取全部标题、段落、表格、优先级和验收标准。
  - 只读检查 treasure-box 与 backend-core-platform 的技术栈、目录和 Git 状态。
  - 对比 Electron、Tauri 和 Wails，确定 Electron 更匹配现有 React + NestJS 技术栈。
  - 用户确认新工作区、Electron、本机 PostgreSQL 和重新建库。
  - 只读确认本机 PostgreSQL 17.9 正常运行，默认角色为 `dynastylu`，5432 端口可连接。
  - 用户确认全量功能边界并授权开始编码，同时要求使用子代理完成准备工作。
  - 已派出前端、后端/PostgreSQL、Electron 三个只读准备代理。
  - 已读取并采用并行代理、子代理驱动开发、实施计划、TDD、代码规范、代码评审和完成前验证流程。
  - 用户确认全量功能边界和交付分期。
  - 前端准备代理完成只读审计，确认以当前 treasure-box 根工程为来源，并给出保留、删除、改造和质量门禁清单。
  - Electron 准备代理完成只读审计，给出 workspace、Utility Process、随机端口、安全协议、Prisma 打包和 electron-builder 方案。
  - 后端准备代理完成只读审计，确认保留 config/context/logger/Prisma/storage/health，删除租户、IAM、Redis/BullMQ、S3 与旧业务模块。
  - 完成第一子项目实施计划初稿并自检，修正工作树初始化、根测试脚本、格式化步骤和打包依赖遗漏。
  - 读取并采用编码规范、前端设计、shadcn、React 性能与 API 设计技能；确定“科研档案台”视觉方向和语义组件规则。
  - 完整复核上述技能说明，确认 TDD、组件组合、无原始 IPC 暴露、REST 资源命名和 React bundle 约束。
- 创建/修改的文件：
  - `task_plan.md`
  - `findings.md`
  - `progress.md`

### 阶段 2：设计规格与实施计划
- **状态：** complete
- 执行的操作：
  - 写入并自检完整设计规格，覆盖架构、生命周期、功能域、数据模型、错误处理、安全和测试。
  - 完成并自检工程骨架实施计划，用户已选择子代理驱动执行。
- 创建/修改的文件：
  - `docs/superpowers/specs/2026-07-17-rd-manager-workbench-design.md`

### 阶段 3：新工作区与基座提纯
- **状态：** in_progress
- **Task 1：** complete
- 执行的操作：
  - 重新捕获 treasure-box 与 backend-core-platform 的 Git 状态到 `/tmp/rd-workbench-*-status.before`，源仓库保持只读。
  - 确认隔离工作树分支为 `feature/bootstrap`。
  - 初始化根 pnpm workspace、TypeScript、ESLint、Prettier、Vitest 与本机 PostgreSQL 环境示例配置。
  - 使用 pnpm 9.15.1 安装根依赖并生成唯一的根 `pnpm-lock.yaml`。
  - 将 Vitest 4 配置迁移到标准 `vitest.config.ts`，使用受支持的 `test.projects`，并为 `scripts/**/*.spec.ts` 保留命名 root project。
  - Task 2 已完成；后续 backend、renderer 与 desktop 任务按实施计划继续推进。
- 创建/修改的 Task 1 文件：
  - `.gitignore`
  - `.npmrc`
  - `.prettierignore`
  - `.prettierrc`
  - `.env.example`
  - `package.json`
  - `pnpm-lock.yaml`
  - `pnpm-workspace.yaml`
  - `tsconfig.base.json`
  - `eslint.config.mjs`
  - `vitest.config.ts`
  - `progress.md`

- **Task 2：** complete
- 执行的操作：
  - 按 TDD 先创建 contracts 包与测试，并确认因 `backend-protocol`、`runtime-config` 模块尚不存在而 RED。
  - 新增严格的后端 ready/failed 判别联合协议；端口限定为 1024–65535，nonce 最少 8 字符。
  - 新增只包含 `apiBaseUrl`、`sessionToken`、`appVersion`、`platform` 四字段的严格运行时配置；API 仅允许 `http://127.0.0.1:<1024-65535>`，会话令牌最少 32 字符。
  - preload 公共契约仅暴露异步 `getRuntimeConfig()`，未暴露原始 IPC。
  - 使用精确版本 Zod 4.4.3，并生成可被后续 workspace 包消费的 ESM JavaScript 与声明文件。
  - 完成 GREEN、包级 lint/typecheck/build、根 `pnpm check` 与 `git diff --check`。
  - 审查修复：将类型入口和 development 条件指向源码，生产/default/import 条件继续指向构建产物；在无 `dist` 时完成包名测试、包 typecheck 和临时 workspace 消费端 NodeNext typecheck。
  - 审查修复：build 跨平台清理旧 `dist`，关闭 source/declaration map；确认构建与 `npm pack --dry-run` 均不包含 `.map`，并在打包白名单中包含公开源码类型入口。
- 创建/修改的 Task 2 文件：
  - `packages/contracts/package.json`
  - `packages/contracts/tsconfig.json`
  - `packages/contracts/tsconfig.build.json`
  - `packages/contracts/vitest.config.ts`
  - `packages/contracts/src/backend-protocol.ts`
  - `packages/contracts/src/backend-protocol.spec.ts`
  - `packages/contracts/src/runtime-config.ts`
  - `packages/contracts/src/runtime-config.spec.ts`
  - `packages/contracts/src/preload-api.ts`
  - `packages/contracts/src/index.ts`
  - `packages/contracts/src/package-entry.spec.ts`
  - `pnpm-lock.yaml`
  - `progress.md`

- **Task 3：** complete
- 执行的操作：
  - 按 TDD 先创建环境校验与 health E2E 测试，分别确认因 `parseEnvironment` 和 Nest/Prisma 应用骨架缺失而 RED。
  - 新增仅允许 `127.0.0.1`、支持随机端口 0、严格 PostgreSQL URL、32 字符内部令牌、绝对数据目录与默认关闭 Swagger 的 Zod 环境校验。
  - 新增 NestJS 10.4.8 应用骨架、全局 `/api` 前缀、严格 ValidationPipe、统一成功响应与保留 HTTP 状态码的安全错误响应。
  - 新增 Prisma 6.19.3 生命周期服务；ready 使用 `x-workbench-token` 的常量时间摘要比较并执行 `SELECT 1`，数据库错误返回 503 且不泄露异常、堆栈或令牌。
  - 新增无需令牌的 live 探针，以及监听 `127.0.0.1:PORT` 并返回实际端口的可复用 `startBackend()`。
  - 自审按 TDD 新增错误路径不回显 query secret 的回归测试，确认 RED 后改用不含查询串的 `request.path` 并得到 GREEN。
  - Prisma CLI 作为运行时依赖；用临时无模型 schema 完成客户端生成验证后删除，正式 schema 与迁移仍由 Task 4 创建。
  - 完成 backend 单元/E2E、lint、typecheck、build 和无 source map 检查；阶段 3 与后续后端功能仍保持进行中。
- 创建/修改的 Task 3 文件：
  - `apps/backend/package.json`
  - `apps/backend/nest-cli.json`
  - `apps/backend/tsconfig.json`
  - `apps/backend/tsconfig.build.json`
  - `apps/backend/src/app.module.ts`
  - `apps/backend/src/bootstrap/create-backend-app.ts`
  - `apps/backend/src/main.ts`
  - `apps/backend/src/infrastructure/config/env.schema.ts`
  - `apps/backend/src/infrastructure/prisma/prisma.module.ts`
  - `apps/backend/src/infrastructure/prisma/prisma.service.ts`
  - `apps/backend/src/shared/filters/http-exception.filter.ts`
  - `apps/backend/src/shared/interceptors/response.interceptor.ts`
  - `apps/backend/src/modules/system/health/health.module.ts`
  - `apps/backend/src/modules/system/health/health.controller.ts`
  - `apps/backend/test/unit/env.schema.spec.ts`
  - `apps/backend/test/e2e/health.spec.ts`
  - `apps/backend/test/jest-unit.config.cjs`
  - `apps/backend/test/jest-e2e.config.cjs`
  - `apps/backend/test/setup-environment.cjs`
  - `pnpm-lock.yaml`
  - `progress.md`

- **Task 3 审查修复：** complete
- 执行的操作：
  - 复核设计规格后确认初始骨架缺少约定的 trace ID、请求上下文、结构化日志和 `LOG_LEVEL` 配置。
  - 按 TDD 先确认环境测试因 `LOG_LEVEL` 不存在而 RED，成功/错误 health 响应因无 traceId 而 RED，请求上下文与 logger 测试因模块缺失而 RED。
  - 新增全局 AsyncLocalStorage 请求上下文，每个请求始终生成本地 UUID；上下文严格只含 traceId、sourceIp、startedAt，并忽略外部 `x-request-id`。
  - 错误响应包含 UUID traceId，不同错误请求使用不同 trace；成功响应严格保持 `{ success: true, data }`，请求 trace 继续供 logger 关联，错误路径继续去除查询串。
  - 新增默认 `info` 的 debug/info/warn/error 日志级别校验，以及按级别过滤的 JSON 行 logger；字段白名单包含 timestamp、level、service、message、context 和可选 traceId。
  - logger 不序列化异常正文、stack 或对象，并对内部令牌、配置数据库 URL、其他 PostgreSQL URL 和具名 secret 进行脱敏。
  - Nest bootstrap 在替换为 AppLoggerService 后显式刷新缓冲日志；未引入 tenant、user 或旧业务上下文。
  - 复审按 TDD 先确认 live/ready 因成功响应多出 traceId 而 RED，再移除成功拦截器中的 traceId；错误响应和 logger 的 traceId 保持不变。
- 创建/修改的审查修复文件：
  - `apps/backend/src/app.module.ts`
  - `apps/backend/src/bootstrap/create-backend-app.ts`
  - `apps/backend/src/infrastructure/config/env.schema.ts`
  - `apps/backend/src/infrastructure/context/request-context.module.ts`
  - `apps/backend/src/infrastructure/context/request-context.middleware.ts`
  - `apps/backend/src/infrastructure/context/request-context.service.ts`
  - `apps/backend/src/infrastructure/logger/app-logger.service.ts`
  - `apps/backend/src/infrastructure/logger/logger.module.ts`
  - `apps/backend/src/shared/filters/http-exception.filter.ts`
  - `apps/backend/src/shared/interceptors/response.interceptor.ts`
  - `apps/backend/test/e2e/health.spec.ts`
  - `apps/backend/test/unit/app-logger.service.spec.ts`
  - `apps/backend/test/unit/env.schema.spec.ts`
  - `apps/backend/test/unit/request-context.service.spec.ts`
  - `progress.md`

- **Task 3 可重复构建修复：** complete
- 执行的操作：
  - 按 TDD 新增可重复启动契约测试，先确认最小 Prisma schema、显式生成路径/前置钩子和完整环境示例均缺失而 RED。
  - 新增仅含 `prisma-client-js` generator、PostgreSQL datasource 和 `app` schema 的无模型生成基线；业务模型与迁移仍由 Task 4 实现。
  - `prisma:generate` 通过跨平台 Node 包装器显式接收 `--schema prisma/schema.prisma`；仅在环境缺失时注入无密码 loopback 占位 URL，生成过程不连接数据库。
  - build、typecheck、unit 和 E2E 均通过生命周期前置钩子先生成 Prisma Client，避免依赖共享 node_modules 中的残留产物。
  - 补全 `.env.example` 的 NODE_ENV、development-only INTERNAL_API_TOKEN、APP_DATA_DIR、FILES_DIR 和 LOG_LEVEL，并明确正式令牌由 Electron 随机注入。
  - 将实施计划 Task 4 的 Prisma schema 操作由 Create 改为 Modify，并注明本阶段不含业务表。
  - 在 `/tmp` 临时副本排除 node_modules/构建产物后执行 frozen、ignore-scripts 全新安装；先确认 client absent，再无 DATABASE_URL 生成 client、完成 typecheck，并删除临时副本。
- 创建/修改的可重复构建文件：
  - `.env.example`
  - `apps/backend/package.json`
  - `apps/backend/prisma/schema.prisma`
  - `apps/backend/scripts/generate-prisma-client.cjs`
  - `apps/backend/test/unit/bootstrap-reproducibility.spec.ts`
  - `docs/superpowers/plans/2026-07-17-workbench-bootstrap.md`
  - `progress.md`

- **Task 4：** complete
- 执行的操作：
  - 按 TDD 先创建 bootstrap plan、环境一致性和命令安全测试；确认计划模块缺失、4 项环境约束未生效后进入 GREEN。
  - 将库名严格限定为 `rd_manager_workbench` 或 `rd_manager_workbench_test`，角色严格限定为 `rd_manager_workbench_app`，schema 固定为 `app`；所有动态 SQL identifier 先经 lowercase snake_case 白名单再引用。
  - 环境校验要求管理员 URL 指向 loopback `postgres` 维护库、应用 URL 的库名/角色/schema 与声明一致，并禁止测试环境回退生产库。
  - 使用 `pg` session advisory lock 串行化初始化；缺失时创建 `LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE CONNECTION LIMIT 10` 技术角色和目标库，存在时只验证安全属性与 owner，不修改不匹配对象。
  - 在目标库创建或验证 `app` schema owner，并仅在目标库撤销 public schema 的 CREATE 权限；所有客户端和 advisory lock 都在 `finally` 中释放。
  - Prisma migration 子进程显式接收 schema 路径，子环境只含 `DATABASE_URL`，输出不回显连接串；新增 lowercase snake_case、JSONB 与 `TIMESTAMPTZ(6)` 的 `app_metadata` 基线。
  - integration 严格固定 `rd_manager_workbench_test`，连续 bootstrap 两次后验证角色 flags/连接限制、两个 owner、public 权限、表和迁移记录；按要求保留测试库，不执行清理删除。
  - 使用根 `pnpm db:bootstrap` 对生产库连续执行两次，均 exit 0；psql 分别验证生产/test 库 owner、生产 schema、两张表和唯一 active migration。
- 创建/修改的 Task 4 文件：
  - `.env.example`
  - `apps/backend/package.json`
  - `apps/backend/prisma/schema.prisma`
  - `apps/backend/prisma/migrations/migration_lock.toml`
  - `apps/backend/prisma/migrations/20260717000000_init/migration.sql`
  - `apps/backend/src/commands/bootstrap-database.ts`
  - `apps/backend/src/infrastructure/config/env.schema.ts`
  - `apps/backend/src/infrastructure/database/bootstrap-plan.ts`
  - `apps/backend/src/infrastructure/database/bootstrap-database.ts`
  - `apps/backend/test/jest-integration.config.cjs`
  - `apps/backend/test/integration/database-bootstrap.spec.ts`
  - `apps/backend/test/setup-environment.cjs`
  - `apps/backend/test/unit/bootstrap-plan.spec.ts`
  - `apps/backend/test/unit/env.schema.spec.ts`
  - `pnpm-lock.yaml`
  - `task_plan.md`
  - `docs/superpowers/plans/2026-07-17-workbench-bootstrap.md`
  - `progress.md`

- **Task 4 fresh-shell 修复：** complete
- 执行的操作：
  - 在仅保留 `HOME`、`PATH`、`SHELL`、`USER` 的等效全新 shell 中复现根 `pnpm db:bootstrap` exit 1，确认 CLI 错误复用了 Nest 完整运行时环境解析。
  - 按 TDD 新增独立 bootstrap 环境加载器测试，先确认 loader 与安全错误格式化不存在而 RED，再实现专用五字段 parser 并得到 GREEN。
  - bootstrap CLI 固定解析 workspace root，只读取 `.env.example` 的五个非秘密数据库初始化字段，可选 `.env.local` 覆盖，显式 `process.env` 优先级最高；输入对象与进程环境均不被修改。
  - 保留 production/test 数据库严格关联、loopback maintenance DB、唯一技术角色和 `app` schema 校验；Nest `ConfigModule` 继续独立使用完整 `parseEnvironment`，不会自动加载 example。
  - 配置错误输出稳定安全 code，未知错误统一为 `BOOTSTRAP_FAILED`，不回显 URL、密码、令牌或底层错误正文。
  - 在等效全新 shell 中连续两次运行 production bootstrap 均 exit 0；psql 验证 schema owner、`app_metadata` 与唯一 active migration 未变化。
- 创建/修改的 fresh-shell 修复文件：
  - `apps/backend/package.json`
  - `apps/backend/src/commands/bootstrap-database.ts`
  - `apps/backend/src/infrastructure/database/bootstrap-env.ts`
  - `apps/backend/test/unit/bootstrap-env.spec.ts`
  - `pnpm-lock.yaml`
  - `progress.md`

- **Task 5：** complete
- 执行的操作：
  - 按 TDD 先创建路由、诊断、运行时与 API 客户端测试，确认因 `App`、`runtime`、`api-client` 尚不存在而 4 个 suites RED。
  - 从 treasure-box 只读提取 React 19、Vite 8、React Router、TanStack Query、Tailwind v4 与 radix-nova 工程能力；未复制登录、鉴权、RBAC、Sentry、OCR 或旧业务代码。
  - 使用 HashRouter 与 `base: './'` 建立严格 8 项导航；所有业务路由仅展示已批准范围，不定义 `/login`，不伪造业务数量。
  - 完成“科研档案台”视觉壳：暖灰纸面、墨绿侧栏、朱砂风险点、细网格与档案标记；颜色均通过语义 CSS 变量，本地字体栈不依赖远程资源。
  - Dashboard 四张模块卡均明确显示“尚未接入”并说明真实后续范围；Settings 通过 Query 展示 loading/error/ready 三态。
  - runtime 仅调用 `window.workbench.getRuntimeConfig()`，并用共享 strict schema 二次验证；额外 bridge 能力、非 loopback URL 与低位端口均被拒绝。
  - API 客户端仅请求 `127.0.0.1` 高位端口，自动添加 `x-workbench-token`、5 秒超时与安全非 2xx 错误，不向 UI 透出令牌或原始响应正文。
  - 运行 shadcn `info --json`、`docs button card badge separator tooltip` 与 `view separator tooltip`，确认 radix/Tailwind v4/lucide API；以 apply_patch 重建并逐文件复核所需 primitives。
  - 使用图标子路径直接导入，将 Vite transform 模块数从 1980 降至 302；生产构建资源使用相对路径且不含 source map。
- 创建/修改的 Task 5 文件：
  - `apps/renderer/package.json`
  - `apps/renderer/tsconfig.json`
  - `apps/renderer/tsconfig.node.json`
  - `apps/renderer/vite.config.ts`
  - `apps/renderer/components.json`
  - `apps/renderer/index.html`
  - `apps/renderer/src/**`
  - `pnpm-lock.yaml`
  - `progress.md`

## 测试结果
| 测试 | 输入 | 预期结果 | 实际结果 | 状态 |
|------|------|---------|---------|------|
| DOCX 渲染 | 需求文档 | 生成全部页面图片 | 成功生成 6 页 | 通过 |
| DOCX 结构提取 | 需求文档 | 提取完整文字和表格 | 86 段、13 表、无批注与修订 | 通过 |
| 基座只读盘点 | 两个源仓库 | 确认技术栈与工作树状态 | 已确认，均存在未提交改动 | 通过 |
| 根依赖安装 | `pnpm install` | 安装成功并生成根锁文件 | exit 0，安装 397 个包 | 通过 |
| Vitest config 加载 | `pnpm test:package` | 命名 root project 加载根脚本测试 | 临时最小测试 1 passed，验证后删除 | 通过 |
| 根配置静态校验 | ESLint + 严格 TypeScript | 配置无 lint 或类型错误 | 两项均 exit 0 | 通过 |
| 格式检查 | `pnpm format:check` | 所有纳入格式化的文件符合规范 | exit 0 | 通过 |
| Contracts RED | `pnpm --filter @rd-manager/contracts test` | 因契约模块尚未实现而失败 | 2 个 suite 均报目标模块不存在，exit 1 | 通过 |
| Contracts GREEN | 包级 test + typecheck | 契约验证与类型检查通过 | 2 files / 16 tests passed，typecheck exit 0 | 通过 |
| Contracts 质量门禁 | 包级 lint/build + 根 `pnpm check` + `git diff --check` | 全部通过且产出 ESM/声明文件 | 全部 exit 0 | 通过 |
| Contracts 无构建产物 RED | 无 `dist` 时从包名运行 package entry 测试 | 暴露当前入口依赖构建产物 | 1 suite 入口解析失败，另 2 files / 16 tests 通过，exit 1 | 通过 |
| Contracts 源码入口 GREEN | 无 `dist` 时 package test + typecheck | development/types 条件直接消费源码 | 3 files / 17 tests passed，typecheck exit 0 | 通过 |
| Contracts 临时消费端 | 无 `dist` 的最小 workspace + NodeNext typecheck | workspace 包可在首次构建前被类型消费 | 临时消费端 typecheck exit 0，探针已移除 | 通过 |
| Contracts 干净构建 | 预置 stale map 后 build + map 检查 + `npm pack --dry-run` | 清理旧产物且不生成/打包 map | `dist` 仅 8 个 JS/声明文件，pack 13 entries、无 map | 通过 |
| Backend env RED | focused unit test | 因环境解析模块尚未实现而失败 | `TS2307` 缺少 `env.schema`，exit 1 | 通过 |
| Backend health RED | focused E2E test | 因应用、bootstrap 与 Prisma 模块尚未实现而失败 | 3 个 `TS2307` 缺失模块，exit 1 | 通过 |
| Backend 单元测试 GREEN | `pnpm --filter @rd-manager/backend test:unit` | 环境正反例全部通过 | 1 suite / 9 tests passed | 通过 |
| Backend E2E GREEN | `pnpm --filter @rd-manager/backend test:e2e` | live、ready 鉴权、DB 成功/失败与错误路径脱敏语义通过 | 1 suite / 6 tests passed | 通过 |
| Backend query secret RED/GREEN | focused health E2E | 先证明错误响应回显 query，再去除查询串 | RED 收到含 secret 的 originalUrl；GREEN 1 test passed | 通过 |
| Backend 质量门禁 | backend lint + typecheck + build + map 检查 | 全部通过且无 source map | 全部 exit 0，`dist` 无 `.map` | 通过 |
| Backend tracing/env 审查 RED | env unit + health E2E | 暴露缺少 LOG_LEVEL 与响应 traceId | env `TS2339`；health 5 tests failed | 通过 |
| Request context/logger RED | focused unit tests | 因基础设施模块尚不存在而失败 | 两组均为 `TS2307`，exit 1 | 通过 |
| Backend tracing/logger GREEN | backend full unit + E2E | 环境、上下文、logger 与请求关联全部通过 | unit 3 suites / 18 tests；E2E 1 suite / 7 tests | 通过 |
| Backend 成功契约 RED/GREEN | health E2E | 成功严格 `{ success, data }`，traceId 仅用于错误/日志 | RED 2 tests 因多余 traceId 失败；GREEN 7 tests passed | 通过 |
| Backend 可重复构建 RED/GREEN | bootstrap reproducibility unit | schema、generate 前置和 env 示例具备静态契约 | RED 3 tests failed；GREEN 3 tests passed | 通过 |
| Prisma clean-client 验证 | 临时副本 + frozen install + ignore-scripts | 无残留 client 时仍可生成并类型检查 | before=absent，after=generated，typecheck exit 0，探针已删除 | 通过 |
| PostgreSQL bootstrap plan RED/GREEN | focused unit | 先因功能缺失失败，再通过严格名称、引用、环境和安全扫描 | RED 2 suites failed；GREEN 2 suites / 39 tests passed | 通过 |
| PostgreSQL integration RED/GREEN | 固定 test 库连续 bootstrap 两次 | 先因 `pg`/bootstrap 缺失失败，再验证真实库状态 | RED 1 suite compile failed；GREEN 1 suite / 4 tests passed | 通过 |
| Prisma schema 验证 | 显式 test `DATABASE_URL` + schema 路径 | schema 有效并可生成客户端 | validate 与 generate 均 exit 0 | 通过 |
| 生产库幂等 bootstrap | 根 `pnpm db:bootstrap` 连续执行两次 | 首次创建并迁移，再次无副作用 | 两次均输出 completed、exit 0 | 通过 |
| PostgreSQL 状态核验 | psql 只读查询 | owner/schema/public/table/migration 符合安全基线 | 两库 owner 正确；public CREATE=false；2 表；1 active migration | 通过 |
| Task 4 完整质量门禁 | backend explicit + 根 `pnpm check` + diff check | 单元/integration/E2E/lint/typecheck/build/rootcheck 全通过 | unit 46、integration 4、E2E 7、contracts 17；全部 exit 0 | 通过 |
| Bootstrap fresh-shell RED/GREEN | allowlist 新 shell 根命令 | 先复现缺环境失败，再无需 export 幂等成功 | RED exit 1；GREEN 连续两次 exit 0 | 通过 |
| Bootstrap 专用环境加载器 | focused unit | 优先级、缺文件、不污染与错误脱敏均通过 | 1 suite / 9 tests passed | 通过 |
| Bootstrap fresh-shell 数据核验 | production psql 只读查询 | owner、metadata table、migration 保持正确 | owner 正确；table 存在；active migration=1 | 通过 |
| Renderer RED | `pnpm --filter @rd-manager/renderer test` | 新行为测试因生产模块缺失而失败 | 4 suites 均为目标模块不存在，exit 1 | 通过 |
| Renderer GREEN | renderer test | 路由、诊断、安全 runtime 与鉴权 API 行为通过 | 4 files / 14 tests passed | 通过 |
| Renderer 包级门禁 | typecheck + lint + test + build | 全部通过，相对资源且无 source map | Vite 302 modules；JS 429.07 kB / gzip 135.37 kB；全部 exit 0 | 通过 |

## 错误日志
| 时间戳 | 错误 | 尝试次数 | 解决方案 |
|--------|------|---------|---------|
| 2026-07-17 | LibreOffice 渲染中文字体显示方框 | 1 | 使用文档结构提取文字，页图仅用于布局核对 |
| 2026-07-17 | 设计规格补丁上下文未匹配 | 1 | 使用更小的唯一上下文重新应用补丁 |
| 2026-07-17 | 合并准备代理发现时补丁包含已变化上下文 | 1 | 先用 `rg` 定位实际行，再缩小补丁范围 |
| 2026-07-17 | `.worktrees` 尚不存在导致忽略检查未匹配 | 1 | 改用 `--no-index` 检查占位路径后创建 worktree |
| 2026-07-17 | Vitest 4.1 不再导出 `defineWorkspace`，且仅自动加载标准配置名 | 1 | 迁移为标准 `vitest.config.ts` 与 `defineConfig` 的 `test.projects`，并通过 CLI 加载验证 |
| 2026-07-17 | contracts 包直接运行 Vitest 时继承根配置，只匹配 `scripts/**/*.spec.ts` | 1 | 新增包级 `vitest.config.ts` 并在测试脚本显式指定，随后得到预期的缺失模块 RED |
| 2026-07-17 | 从 contracts 包目录检查 map 时误用了根目录相对路径 | 1 | 改为从包目录检查 `dist`，确认无 `.map`；同时以 `npm pack --dry-run` 文件清单交叉验证 |
| 2026-07-17 | Backend Jest 配置的 testMatch 误少了 `test/` 路径 | 1 | 修正 unit/e2e 匹配路径与 tsconfig 相对路径后得到预期 RED |
| 2026-07-17 | Health E2E 首次编译时错误描述表不能用 number 索引枚举 Record | 1 | 将只读错误描述表改为 number 索引并保留未匹配状态回退 |
| 2026-07-17 | ConfigModule 在测试模块导入时早于 beforeEach 校验环境 | 1 | 新增 Jest setupFiles，在模块加载前写入仅用于测试的安全环境变量 |
| 2026-07-17 | 离线安装显式 `@types/node` 时本机 store 缺少精确版本 tarball | 1 | 改为普通 `pnpm install` 下载唯一缺失包，锁文件未发生非预期漂移 |
| 2026-07-17 | request context traceId 收紧补丁因 Prettier 已改变长行上下文而未匹配 | 1 | 读取实际文件后缩小补丁上下文，随后正常应用并运行 focused GREEN |
| 2026-07-17 | `require.resolve('prisma')` 命中包导出的缺失 `build/types.js` | 1 | 改用官方 CLI 子路径 `prisma/build/index.js`，随后无 DATABASE_URL generate 成功 |
| 2026-07-17 | 显式传入 `.env.example` 时 Prettier 无法推断解析器 | 1 | 环境示例保持人工键值格式，仅对可解析文件格式化；根 format:check 仍按 `.prettierignore` 正常处理 |
| 2026-07-17 | Bootstrap plan RED 测试首稿括号未闭合，造成语法错误而非目标缺失失败 | 1 | 先修正测试语法，再重跑并确认只因目标模块缺失与环境约束未实现而 RED |
| 2026-07-17 | 直接执行 Prisma validate 时 shell 未提供 `DATABASE_URL` | 1 | 使用明确 test URL 重跑；schema valid，未发生数据库连接或写入 |
| 2026-07-17 | Integration 首次 GREEN 的 `to_regclass` 期望省略 schema 前缀 | 1 | 按 PostgreSQL 实际 schema-qualified 文本修正断言，随后 4 项通过 |
| 2026-07-17 | 质量门禁发现 Zod 运行时收窄未反映到 TypeScript 类型 | 1 | 将库名和角色字段改为 `z.enum`/`z.literal`，focused 39 tests 与 typecheck 通过 |
| 2026-07-17 | Task 3 可重复构建测试仍要求正式 Prisma schema 不含 model | 1 | 将阶段性断言升级为 Task 4 的唯一 `AppMetadata` 基线、类型/映射和 integration generate 契约 |
| 2026-07-17 | 唯一 Prisma model 断言首稿缺少 multiline 正则标志 | 1 | 增加 `m` 标志后重跑完整单元集，不放宽模型数量约束 |
| 2026-07-17 | 全新 shell 未 export Nest 完整运行时变量时根 `db:bootstrap` 失败 | 1 | 拆分专用五字段 bootstrap parser，并按固定文件与显式环境优先级加载 |
| 2026-07-17 | 缺失环境文件的 Node 错误未通过跨上下文 `instanceof Error` 判断 | 1 | 改为结构化检查非空 object 的 `code=ENOENT`，focused 9 tests 通过 |
| 2026-07-17 | 在线 `pnpm install` 输出 Done 后因残留 registry 连接未退出 | 2 | 中止空闲进程后用 offline frozen ignore-scripts 完整复验，exit 0 且未修改 renderer 源码 |
| 2026-07-17 | renderer Vite 配置使用 `vite` 的 `defineConfig` 导致不识别 Vitest `test` 字段 | 1 | 对照根配置改为 `vitest/config`，typecheck 通过 |
| 2026-07-17 | shadcn 源码中的 react-refresh disable 注释引用了未安装规则 | 1 | 删除无效 disable 注释，保留现有 ESLint 规则并通过 lint |
| 2026-07-17 | Lucide 图标子路径的 ambient 类型声明最初位于模块文件中，被视为 augmentation | 1 | 将 wildcard 声明移到独立 ambient `.d.ts`，直接导入与严格类型检查同时通过 |

## 五问重启检查
| 问题 | 答案 |
|------|------|
| 我在哪里？ | 阶段 3：新工作区与基座提纯 |
| 我要去哪里？ | 继续 Electron 生命周期、开发编排与打包验证 |
| 目标是什么？ | 构建 Electron + React + NestJS + 本机 PostgreSQL 的研发主管本地工作台 |
| 我学到了什么？ | 见 `findings.md` |
| 我做了什么？ | 完成 Task 1 根 workspace、Task 2 共享契约、Task 3 Backend、Task 4 PostgreSQL 和 Task 5 React renderer 壳 |

## 2026-07-18：产品范围重新收敛

- 用户确认界面参考飞书的工作台、项目空间、文档知识、多维表格和日历组织方式，但保持 Electron 本地单人使用。
- 明确 UI 基础改为 Semi Design；TanStack Table、FullCalendar、Tiptap、dnd-kit 分别用于多维表格、日历、文档和拖拽交互。
- 新增并自检完整功能清单 `docs/product/2026-07-18-local-feishu-style-functional-backlog.md`：将功能按 P0/P1/P2、统一对象模型、现有工程缺口、验收标准和实际交付批次重新整理。
- 当前下一步不是继续扩张旧后台模块，而是待用户审阅功能清单后，先形成“P0-A：Semi UI 基座 + 七入口导航 + 项目空间”的独立设计和实施计划。

## 2026-07-19：P0-B 我的工作、日历、通知与 Electron 完成

- 完成我的工作六个固定视图、任务完成/取消/延期/稍后处理/提醒及跨页面缓存失效。
- 完成 FullCalendar 月/周/日视图、普通日程和任务拖动、项目关联、多个提醒点。
- 完成持久化通知、提醒调度器、Socket `/notifications`、轮询补偿、已读/关闭/稍后提醒。
- 完成安全 Electron 外壳、托盘、系统通知、通知点击内部路由、内嵌后端和一键构建打包。
- 真实 Socket 联调收到 `notification.created`；Electron 独立复审 APPROVED。

## 2026-07-19：P0-C 会议、文档与知识库完成

- 会议使用同一数据源接入日历与项目空间；支持筛选分页、六页签详情、议程、提醒、行动项、决策、纪要和附件。
- 行动项转任务具备数据库锁和幂等返回；会议纪要自动创建唯一 `MEETING_MINUTES` 文档并保留旧正文。
- 新增知识空间、统一文档、文档版本、文件资产和文件版本数据模型及真实 API。
- `/docs` 替换规划页为飞书式三栏工作区；支持 Tiptap 编辑、自动保存、版本恢复、标签、收藏、搜索、回收站和附件新版本。
- 修复本机库缺失历史迁移目录问题；恢复文件与 Git 历史 SHA-256 一致，12 条迁移全部同步，内容接口从 500 恢复为 200。
- 前端 43 files / 145 tests、类型/契约/lint/build 全通过；内容后端 unit 73、integration 64、E2E 3 全通过。
- Playwright 实际创建并编辑文档，自动保存和 v1 版本落库成功；验收临时文档随后精确清理。

## 2026-07-19：P0-D 多维表格完成，进入 P1-01 设计

- 完成表空间、数据表、字段、记录、视图模型和五张实时预置表；不建立系统业务记录镜像。
- 完成表格、看板、日历、表单、字段管理、原对象深链和跨模块缓存同步。
- 最终前端 50 files / 187 tests，后端 unit 75、integration 80、E2E 3，14 条迁移最新；独立复核无高/中风险阻塞。
- P1-01 拆分为关联计算、进阶视图、导入导出和业务模板四个子批次；当前停在设计确认阶段，尚未修改 P1 生产代码。
- 用户确认 P1-01A 采用安全公式 DSL 和读取时计算方案；已写入正式规格 `docs/superpowers/specs/2026-07-19-p1a-base-relations-formulas-design.md`，等待书面规格复核。
- 用户将本批交付范围明确为 P1-01A～P1-01D；当前开始实施前仓库核对，尚未修改生产代码。
- 已确认实际后端模块、前端 Base 页面、Prisma 数据模型和依赖基线；四项将拆成 A/B/C/D 四个可独立验收批次，但均纳入本次交付。
- 用户确认整体设计与无示例数据模板策略；新增 P1-01B 进阶视图、P1-01C 导入导出、P1-01D 业务模板三份正式规格，等待书面规格复核后进入实施计划。
- 用户已确认四份书面规格；开始编写 A/B/C/D 四份实施计划，当前仍未修改生产代码。
- 完成 P1-01A/B/C/D 四份实施计划，覆盖迁移、独立后端服务、前端组件、TDD、真实浏览器验收和分批提交；当前仍未修改生产代码。
- 用户选择子代理驱动执行；主线程负责共享迁移、集成和双阶段复核，实施代理按任务顺序直接修改当前主工程，不创建 worktree。
- P1-01A Task 1 完成：新增 LOOKUP/ROLLUP/FORMULA 枚举、独立迁移和前端受控类型；RED 三项断言失败，GREEN schema/migration 测试 17/17、Prisma generate、前端 typecheck 通过。规格复核通过；质量复核发现并补强迁移测试后批准。提交 `d59b178`、`3a9aea1`。
- P1-01A Task 2 完成：安全 parser/evaluator 支持全部 DSL、2,000 字符/256 节点/32 深度限制、短路、数组、严格 ISO 日期和结构化错误。经规格与质量复核补齐日期溢出、未知异常传播、arity 预检、readonly AST 和对抗测试；最终 2 suites / 76 tests、lint、build、Prettier、diff-check 通过。提交 `1e8d276`、`fe0d826`、`d87e40a`。
- P1-01A Task 3 完成：关系/LOOKUP/ROLLUP/FORMULA 配置规范化、服务器 AST、循环检测、key/type 不可变、局部 config PATCH 和 preview API 已接入。经复核补齐 server-owned inverse、COUNT 目标、prospective 依赖验证、生成时间预览、computed preview 明确拒绝和同事务 advisory lock；最终 unit 16/16、integration 8/8、lint/build/Prettier/diff-check 通过，并发相反公式 PATCH 为 `[200,400]` 且无循环。提交 `54b9777`、`42dac79`、`c4caf5b`。
- P1-01A Task 4 完成：双向关系配对字段、1:1/1:N/N:N 增删差集、双入口同步、删除/解耦、基数冲突回滚和稳定锁顺序已接入。复核补齐空 ID、ONE_WAY 升级保护、系统文档项目清空兼容、表归档/关系配置生命周期保护，以及表归档与记录写入的受控 advisory-lock 并发回归；最终 relation unit 3/3、base integration 23/23（连续两轮）、backend unit 170/170、lint/build/Prettier/diff-check 全部通过，独立质量复审 APPROVED。提交 `06c9381`、`78c537e`、`b04db97`、`56d4fc7`、`5609c05`。
- P1-01A Task 5 完成：自定义/系统目标请求内批量加载、有序 LOOKUP、五种 ROLLUP、公式依赖拓扑、生成时间字段、五类字段级错误和 list/create/update 即时解析已接入；计算字段写入统一 400，历史 required 损坏不阻塞记录写入。复核补齐损坏目标类型、损坏 AST/依赖/循环、归档目标、真实生成时间 API 链路，以及系统项目/任务/文档和复合会议/治理对象的精确 ID 查询下推；最终 adapter 8/8、resolver 6/6、base integration 25/25（连续两轮）、backend unit 29 suites / 184 tests、lint/build/diff-check 全部通过，独立质量复审 APPROVED。提交 `5c8c4c0`、`436e7e7`、`b073ad6`。
- P1-01A Task 6 完成：字段管理接入双向关联、LOOKUP/ROLLUP/FORMULA 配置；关联选择器支持搜索、分页、精确回显和超过 100 条分批读取；公式编辑器支持字段插入、去重预览、结构化错误和失败保留草稿。表格统一批量解析关联标签，计算字段在表格/表单/看板/详情中保持只读和字段级错误隔离。规格复核 PASS，质量复核关闭异步预览竞态、关联标签 N+1、非法公式候选和保存失败误关弹窗后 APPROVED。提交 `b5698f4`、`0d38c12`、`31215f6`、`8e82cc9`、`90b7730`。
- P1-01A Task 7 完成：Prisma validate/generate/deploy 全部通过并应用第 15 条迁移；后端 unit 29 suites / 184 tests、integration 21 suites / 107 tests、lint/build 全部通过；前端 typecheck、contracts、lint/build 通过，完整串行 Vitest 为 55 files / 225 tests。真实浏览器创建岗位/候选人表和双向关系，验证 LOOKUP、COUNT=2、AVG=90、公式“通过”，再把评分改为 60/70，验证 AVG=65、公式切换为“继续评估”；反向候选人字段可见。全部临时记录、字段和数据表已通过精确 ID 清理，P1-01A 验收完成。

## 2026-07-19：P1-01B 进阶视图完成

- 完成 GRID/KANBAN/CALENDAR/FORM/GANTT/GALLERY 六类视图的服务端枚举、配置规范化与字段引用校验；保存搜索、最多 20 个筛选、最多 5 个排序、分组、字段顺序/显隐和默认视图均为独立持久化个人配置。
- 完成甘特日/周/月时间轴、未排期区、今日线、冻结记录列、紧凑/标准行高、全量分页聚合，以及可访问键盘和指针移动/缩放；失败写入回滚，后续分页失败停止重试并保留人工重试入口。
- 完成画册主字段标题回退、附件/链接安全封面、本地附件路径白名单、稳定渐变占位、三种卡片尺寸、两种封面适应、最多 8 个摘要字段、类型化展示、计算错误隔离、服务端分页与越界回页。
- 关闭视图保存竞态：每个视图串行 PATCH、最新草稿保护、手动保存加入同一队列、删除前取消 debounce；保存配置生效后刷新记录。新增 Library 页面级回归测试，确认画册在第 2 页修改结果配置后请求回到第 1 页。
- 第 16 条迁移已应用且无待执行迁移；Prisma validate/deploy、后端 lint/build 通过，后端 unit 30 suites / 191 tests、integration 21 suites / 113 tests 全绿。前端 lint、typecheck、contracts、build 通过，完整串行 Vitest 为 60 files / 295 tests。
- 真实浏览器完成两轮验收：甘特与画册的类型专属配置在刷新后保持，画册卡片打开真实项目详情；临时甘特项目的日期从 2026-07-21～24 移动到 2026-07-22～25，API 与刷新页面一致。所有临时视图和项目均按精确 ID 删除/归档并确认不再出现在页面，P1-01B 独立规格与质量复审均 APPROVED。

## 2026-07-20：启动 P1-02～P2-02 连续交付

- 用户确认五个后续批次的目标范围，并明确规格文档、实施计划完成后不再等待确认，直接进入前后端实现。
- 已恢复 `task_plan.md`、`findings.md`、`progress.md` 与 Git 状态；当前工作树干净，基线提交为 `6709066`。
- 当前阶段：核对现有搜索、治理、管理闭环、情报、报表、通知、Electron 与外部适配能力；随后按五个独立规格/计划连续推进 TDD 实现。
- 首轮核对确认：合作方数据模型/API 已有基础实现；其余全局搜索治理、非项目研发、情报报表、短信/AI/外部集成尚无生产模块。旧的五份领域计划提供了安全边界，但需要按当前工程状态重写为 P1-02～P2-02 五个正式规格与可执行计划。
- 已确定模块边界：搜索、治理、研发运营、行业情报、扩展适配器分别独立；共享审计与对象引用服务由治理模块导出。前端保留现有七入口信息架构，新增能力进入搜索页、设置/维护页、业务库和项目上下文。
- 路由核对完成：`/search` 仍是规划页但导航可用；合作方页面只有最小列表/创建。新实现将直接替换规划页并重做合作方工作区，不增加后台式顶级导航。
- Electron 与合作方代码核对完成：当前无安全凭据桥；Partner 后端功能基础较完整但前端只使用少量端点。P2-02 需要新增 safeStorage 白名单桥，P1-04 以补齐真实详情工作流为主。
- 基础设施核对发现 operations P1 迁移已存在但模块未注册；备份所需目录级安全原语和受控进程执行器尚不存在。下一步先复核该迁移/schema，再冻结五份规格中的数据模型。
- 已确认 operations 迁移表在生产库真实存在，但 Prisma schema 丢失对应声明；后续以无破坏 schema 对齐作为 P1-04/P2-01 前置任务，复用既有表，不新增冲突迁移或清库。
- 发现历史 worktree 中存在未合并的 operations、intelligence、data-governance 实现。它们将作为只读来源逐提交复核并移植，禁止整分支直接覆盖当前已完成的飞书式路由、多维表格和内容模块。
- 完成 P1-02、P1-03、P1-04、P2-01、P2-02 五份设计规格；规格固定为本地单人、Semi/飞书式信息架构、外部能力默认关闭。
- 完成两路只读代码审计：搜索/治理与合作方/非项目研发/情报；确认可复用边界、数据库声明漂移和高风险恢复约束。
- 完成 P1-02、P1-03、P1-04、P2-01、P2-02 五份 TDD 实施计划；每份均固定精确文件、RED/GREEN 测试、验证命令和独立验收。下一步按用户授权直接进入 P1-02 生产代码。
- P1-02 后端搜索已落地：SearchModule adapter registry 覆盖项目、任务、申报、会议、文档、附件、风险、问题、决策、合作方、沟通和 CUSTOM Base 记录；支持统一打分、Unicode 高亮、分类、稳定分页、部分失败和安全内部路径。
- P1-02 快捷操作已复用 Tasks/Documents/Risks 服务完成任务、重新打开、切换文档收藏和确认关闭风险；focused backend 5 suites / 24 tests、真实 PostgreSQL 搜索 controller 3 tests 全绿。
- P1-02 前端 typed API、运行时响应/路径校验、最近搜索 localStorage 与 SearchPage 已落盘；主线程另补 Base/Issue/Partner 精确 recordId 深链，正在执行最终前端构建与浏览器验收。
- P1-02 搜索并发根因已定位并修复：顶层 adapter worker pool 限制为 2，Management 查询顺序化，不再超过本地 PostgreSQL 角色 10 连接上限；真实开发库全类型搜索返回 `partialFailures: []`。
- P1-02 评分、候选公平性、长正文/协作者/历史附件命中、动作状态校验、服务端内部路径防护、前端防抖/即时分类/分页/URL 状态/Electron 链接/缓存失效均已补齐；focused 后端 35 unit + 3 integration、前端 44 tests、类型契约、lint/build 通过。
- P1-02 真实浏览器已验证 `/search` 输入防抖与全类型查询，无部分失败；申报、沟通、附件补齐精确深链，其中附件进入所属文档/会议/项目资料区并高亮具体文件。
- P1-04 Task 1 完成：恢复已应用但从 Prisma 丢失的 6 个 operations 模型与 6 个 enum，不创建冲突表；真实 catalog 与 Prisma delegate 测试通过。
- P1-04 Task 2 完成：新增 PartnerProject、CommunicationRecord.taskId、NonProjectRdItem.taskId 及安全幂等前向迁移；迁移已部署到本地开发库，partner/operations catalog 共 4 tests 通过，后端重新以 4311 watch 模式启动。
- P1-04 Task 3–4 完成：合作方后端补齐 partial/null 更新、项目关系、归档边界、联系人/协议/沟通完整生命周期，以及沟通转任务 advisory-lock 幂等；前端以 Semi 列表和 SideSheet 接通真实 CRUD、深链、项目上下文与任务入口。
- P1-04 质量复核修复完成：Partner projectIds 改为差量同步并保护活动沟通引用；所有 Partner/child/link 写入共享 Partner 锁；跟进筛选使用精确 from/to，列表最近沟通与下次跟进改用数据库聚合。
- 新增 `20260720021000_partner_files` 前向迁移，FileAsset 可真实关联 Partner；上传、列表、更新、恢复校验、知识库合作方资料入口和活动附件归档阻塞已接通。Partner/content unit、真实 PostgreSQL partner/files/catalog integration、前端相关测试、类型、lint/build 均通过；未提交，等待主线程统一收口。
- P1-03 Task 3/4/6 完成：手动备份使用固定 `pg_dump --format=custom --schema=app`、临时目录、fsync/rename、SHA-256 manifest 二次校验、进程 mutex 与 PostgreSQL advisory lock；真实测试数据库已完成 custom dump 创建和再次验证。
- 自动备份按本地时间调度，成功日期持久化、失败次数通过不可变审计跨重启限制为每日 3 次；保留策略保护最近成功备份和 PRE_RESTORE 快照。
- 全局写请求审计只保存字段名和白名单元数据，治理设置变更与精确审计共享 Prisma transaction；健康检查以只读快速/深度模式覆盖迁移漂移、存储空间、附件 SHA、异常关联、失败作业、近期备份和逾期提醒。
- 治理后端与现有前端契约已对齐：设置支持 PATCH 部分更新，备份 byteSize 返回 number，健康报告返回 HEALTHY/WARNING/UNHEALTHY 与 PASS/WARN/FAIL。治理目标 35 unit + 6 integration 全绿，后端 build/lint/diff-check 曾通过；随后共享全量门禁出现的恢复/情报并行半成品阻塞已分别通知对应代理处理。
- P1-03 Task 5/7 生产代码完成：恢复预检逐文件校验 SHA-256、清单指纹、可用空间、migration head、应用版本、`pg_restore` 15+ 与 dump catalog，并签发 10 分钟一次性 confirmation token；消费时再次校验 manifest，拒绝过期、复用和 TOCTOU 变化。
- 恢复引擎在目标恢复前创建 PRE_RESTORE 快照，使用 staging 与持久化 journal，固定 `pg_restore --single-transaction --exit-on-error --clean --if-exists --no-owner --no-privileges`；恢复后检查数据库连接、migration fingerprint、核心对象计数和附件 hash，目标失败自动回灌保护快照并恢复原文件，回滚失败保留证据并返回独立错误码。
- Electron 只开放选择备份目录和已预检恢复两个 IPC；主进程生成随机维护令牌并通过 stdin 启动 maintenance CLI，renderer 无法读取令牌或注入 executable/path。编排严格执行停止后端→维护恢复→重启→健康等待，失败也重启并净化错误。
- 本批 focused 验证：恢复 backend 2 suites / 13 tests、治理 HTTP integration 2 tests、backend build；desktop 全量 4 files / 9 tests 与 typecheck；DataGovernancePage 4 tests 通过。独立临时数据库的真实破坏性恢复演练仍保留在 Task 9，未在共享开发库执行。

## 2026-07-18：P0-A 飞书式工作台与项目空间完成

- 直接在 `main` 接入 Semi Design 2.101，完成统一浅色工作空间 token、208px 左导航、56px 顶栏和窄屏图标导航。
- 顶级导航固定为：工作台、我的工作、项目、文档与知识库、多维表格、日历、搜索；旧地址保留重定向，不再展示后台式模块菜单。
- 顶栏“新建项目/任务”为真实表单；全局搜索、通知明确标记后续批次，不展示假数据；最近访问来自本地记录并可在首次进入项目后即时刷新。
- 项目目录支持真实后端分页、名称/编号搜索、状态筛选、最近访问精确 ID 查询、新建项目和键盘可访问的视图切换。
- 修复真实数据契约：后端列表返回最新健康快照或 `null`，前端无快照显示“未评估”，不会进入 ErrorBoundary。
- 项目详情固定六页签：概览、工作项、进展、风险与问题、会议、文档与资料；概览使用真实聚合数据展示目标、健康度、里程碑、临近任务和最近进展。
- 项目内可直接新建绑定当前 `projectId` 的任务、提交真实进展；任务成功后刷新项目聚合；风险与会议目标页按项目过滤并在新建时保持项目关联。
- 完整前端门禁通过：36 files / 104 tests，lint、typecheck、production build 均 exit 0；后端 lint/build 与项目服务测试通过。
- 真实浏览器检查 `http://127.0.0.1:4312/#/spaces/projects`、项目详情和新建工作项弹窗均正常。
- 评审结果：应用壳质量、项目目录质量、项目空间规格均 APPROVED。
- 下一批：P0-B 我的工作、日历、日程、提醒调度、WebSocket 通知中心与 Electron 系统通知。
- 2026-07-20：P2-01 行业情报 Task 4–6 完成。新增稳定 URL/内容哈希、advisory-lock 去重、来源 occurrence、主题/项目关联、任务/风险/会议议题/知识页四种事务内幂等转换，以及日报/周报白名单快照；交付 `/library/intelligence` 四栏工作区和 `/library/intelligence/briefs` 人工编辑器。验证：后端 unit 3 suites/8 tests、真实 PostgreSQL intelligence integration 4/4、backend lint/build；前端 2 suites/3 tests、typecheck/contracts/lint/build，Chrome 本地路由烟测无 console error。
## 2026-07-20 P2-01 资源负荷与统计报表

- 完成资源档案、技能、13 周投入矩阵、引用校验、超载计算和非项目研发日历/搜索接入；独立复审后补齐负荷条目查看/更新/归档、技能等级更新、资源归档、搜索式项目/任务/非项目研发关联和错误反馈。
- 资源负荷写入与活跃资源/引用校验现在处于同一 PostgreSQL transaction，并使用行锁消除归档检查竞态；零容量且有投入时返回 `percent: null` 和明确超载，不再伪造 100%。
- 报表按规格拆为项目组合、任务完成趋势、风险趋势、资源负荷、行业情报五个独立 API 和五页签；补齐项目健康/阶段/里程碑/逾期/高风险、任务新建/完成、风险新建/关闭、情报主题/来源/优先级/转换统计。
- CSV/XLSX 使用同一安全行模型，逐页签导出并写入不可变 `REPORT_EXPORT` 审计；浏览器实测 CSV 200、XLSX 200 且 PK 签名，审计返回成功记录。
- 修复后验证：backend resources/reports 13 unit + 2 real PostgreSQL HTTP integration；frontend resources/reports 6 tests；backend lint/build、frontend 目标 lint/typecheck/build、`git diff --check` 通过。

## 2026-07-20 P2-02 Electron 凭据桥与外部能力设置

- Electron 新增基于 `safeStorage` 的原子 JSON 凭据保险箱：文件 0600、目录 0700、损坏文件拒绝、并发写入串行；renderer 只能 put/has/delete，密钥只能在主进程 provider 回调期间解密并立即清空临时对象。
- preload 保留通知点击、备份目录和恢复 IPC，并新增固定凭据/扩展执行方法；无任意 ipcRenderer、fetch 或 secret read。ProviderRegistry 同时校验 kind/provider/operation、plain-object payload 与 1 MiB 上限。短信执行只在 SMS_SEND/SMS_PREVIEW 内二次解密收件人凭据。
- Electron 新增 `/extensions` Socket broker：校验 profile/operation 和 canonical payload SHA-256，去重重投，执行结果使用一次性 completion token 回调；provider 异常只上报固定错误码，不记录 payload、密钥或错误原文。
- 新增 `/settings/extensions` 外部能力工作区：短信、AI、CalDAV、WebDAV 四页签、专用字段表单、凭据可用性、真实外呼二次确认、服务启停和脱敏运行历史；浏览器模式明确降级但不影响本地功能。
- 目标验证：desktop Task3 focused 5 suites / 18 tests 与 typecheck；frontend 外部设置/API/设置/路由 4 suites / 14 tests、typecheck、contracts、目标 lint、build 全绿；Chrome 实际页面四页签/降级/配置弹窗 smoke 且 0 console error。desktop 全量暂被并行 provider agent 新增的 RED `caldav.test.ts` 阻塞，真实 adapters 与会议/知识业务入口留待 Task 4–7 收口。
## 2026-07-20 P1-03 真实非破坏性验收

- 在当前本地服务创建并验证手动备份 `3650bb48-cff8-4957-b576-3a716ba399d7`：状态 VERIFIED、manifest/database SHA-256 均存在、249293 bytes。
- 恢复预检通过，schemaVersion 为 `20260720040001_external_extensions_reminder_sms`，warnings 为空；审计日志包含 BACKUP_CREATE、BACKUP_VERIFY、RESTORE_PREFLIGHT。
- 搜索与治理重点回归 9 suites / 58 tests 通过；未对共享开发库执行破坏性 restore。

## 2026-07-20 P2-02 外部服务后端与 Provider 适配器

- 完成扩展 Profile/Run、短信收件人/投递、外部对象链接数据目录与状态机；Run 仅保存哈希、字节数和白名单元数据，不保存短信、会议、文档或问答正文。
- 完成短信重要提醒调度、`/extensions` Socket 投递、一次性完成令牌与阿里云 SendSms 适配；页面通知不等待短信，收件人仅持久化掩码，4xx 不重试，429/5xx/网络错误在 Provider 内有界重试。
- 完成 OpenAI Responses 结构化摘要/问答、上下文上限、引用白名单和显式采纳；AI 结果未经采纳不会修改会议纪要、文档或知识页。
- 完成 CalDAV/WebDAV 预检与提交、默认只拉取、版本/哈希冲突和三种显式冲突处理；跨主机重定向、路径穿越及 `//host/path` 网络路径在后端和 Electron 双重拒绝。
- Electron 已注册 LOCAL_PREVIEW、LOCAL_MANUAL、ALIYUN_SMS、OPENAI_RESPONSES、CALDAV、WEBDAV 六类 Provider；主进程按 credentialRef 解密并为短信临时组合收件人号码，renderer 不可读取密钥。
- 本批验证：后端 6 suites / 23 unit、2 suites / 5 integration、build、lint、Prisma validate；桌面 Provider 6 suites / 14 tests 与 typecheck 全绿。真实服务连接仍需用户在设置页录入个人凭据后手动执行。
- 同步闭环复核后移除旧的客户端自报 hashes/items 契约，新增持久化 ExternalSyncSession：服务端从 Calendar 范围或 FileAsset/FileVersion 生成 Provider payload，Electron complete 输出通过 CalDAV/WebDAV 严格白名单后才签发权威 preflight。
- commit 已真实落实 KEEP_LOCAL/KEEP_REMOTE/CREATE_COPY：普通 CalendarEvent 创建/更新与 ExternalObjectLink 同事务；WebDAV 上传仅在 Provider 成功后建链，下载先验证 Base64/SHA-256 并写安全存储，再同事务创建 FileVersion/副本和链接，数据库失败会删除暂存文件。派生日程仍不可写。
- ExtensionRun completion 使用数据库条件抢占避免并发 token 重放重复执行副作用，并新增仅用于幂等回放验证的 completion receipt hash；完整 token hash 不返回 renderer。WebDAV JSON/Socket 桥明确限制单文件 750 KiB，HTTP/Socket 帧上限固定 2 MiB。

## 2026-07-20 P2-02 业务入口与本机收件人保险箱

- 会议纪要、文档摘要与知识问答已接入真实 AI 治理链：后端准备最小上下文并展示数据离机范围，用户确认后由 Electron provider 执行，结果先以建议预览，只有再次点击采纳才更新会议/文档或创建知识页。
- CalDAV 日历和附件 WebDAV 已接入服务端权威同步会话：renderer 不再自报哈希、URL 或远端内容；确认后由 Electron socket broker 执行 provider，页面轮询 READY 预检并对每个 ADD/UPDATE/CONFLICT 项选择保留本地、保留远端或创建副本，再提交带 hash 的决策。
- 短信收件人支持新增、编辑/安全换号、启停和归档。完整手机号只通过 preload allowlist 写入 `safeStorage`，PostgreSQL 仅保存 maskedPhone 与 credentialRef；浏览器无保险箱时禁止保存并明确说明。

## 2026-07-20 P2-02 独立安全与完整性复核

- AI 显式采纳已绑定成功完成的 ExtensionRun，并校验 operation、业务对象、引用 allowlist 与输出 SHA-256；renderer 不能用伪造或串用结果修改会议、文档或知识页。
- 外部同步预检与提交增加数据库条件抢占，重复并发不会重复执行远端副作用；WebDAV 下载用 ETag/If-Match 与 SHA-256 锁定预检版本，上传和覆盖在最终写入前再次校验本地版本，数据库事务失败会删除暂存文件。
- extensions Socket 只接受无 Origin 的 Electron 主进程握手或 `127.0.0.1:4312`/`localhost:4312` 开发源；CalDAV/WebDAV 拒绝跨主机 redirect、collection/root 逃逸、路径穿越及 baseUrl 内嵌凭据/query 密钥。
- ExtensionRun 与 SmsDelivery 终态改为同事务，调度器逐条条件抢占防重复发送；手机号换号及收件人/provider 归档按可补偿顺序处理，避免数据库引用损坏或保险箱密钥静默遗留。
- provider 响应采用流式有界读取；WebDAV 750 KiB 经 Base64 后仍统一落在 1 MiB run payload 与 2 MiB HTTP/Socket 帧上限内；单条凭据限制 64 KiB。
- 复核验证：后端扩展目标 unit 10 suites / 38 tests、集成 3 suites / 9 tests 通过；前端扩展目标 7 suites / 31 tests 通过；Desktop 16 suites / 47 tests 通过。backend build/lint/Prisma validate/migrate status、frontend typecheck/lint/build、desktop typecheck/build/打包目录均通过。真实 OpenAI、阿里云、CalDAV、WebDAV 凭据未在自动测试中调用，需由用户在 Electron 设置页逐项确认连接测试。
- 前端本批 focused 10 suites / 42 tests、typecheck、contracts、目标 lint、build 通过；桌面凭据/IPC/broker/provider 11 suites / 32 tests 与 typecheck 通过。

## 2026-07-20 P1-01C/D 多维表格导入导出与业务模板

- 新增 CSV/XLSX 两阶段导入：上传与工作表检查、字段映射、零写入全量预检、原子状态抢占、250 行分批提交、部分成功、错误行 CSV 下载、会话删除与过期清理；上传文件和错误文件只通过受控存储 key 访问，接口不返回内部路径。
- 新增当前视图/完整表 CSV 与 XLSX 流式导出：复用服务端视图筛选排序与计算字段，CSV 防公式注入，XLSX 保留日期类型并冻结表头、启用筛选；修复了 ExcelJS streaming worksheet 直接赋值 `views` 导致的运行时崩溃。
- 新增合作方台账、研发申报、风险台账、面试候选跟踪、非项目研发记录五个不可变模板；模板以事务和工作区 advisory lock 创建普通 `CUSTOM` 表，自动解析项目预置表关联，只创建字段和四类视图，不写示例记录。
- 前端多维表格工作区已接入飞书式模板中心、CSV/XLSX 导入五阶段弹窗、字段映射/新字段、工作表切换、预检错误展示、错误文件下载及当前视图/完整表导出；预置系统表不显示导入入口。
- 真实本地 API 验收创建五个模板，字段数分别为 12/13/13/12/12、每个 4 个视图且零记录；混合 CSV 预检保持零写入，提交结果为 1 条成功/1 条错误，错误 CSV、当前视图 CSV 和完整 XLSX 均返回 200；验收会话、记录、关系字段与五张临时表已删除，`imports/` 无遗留验收文件。
- 可重复验证：P1-01C/D focused backend unit 6 suites / 17 tests、frontend focused 8 tests、Base backend 真实 PostgreSQL integration 29/29、frontend Base 全量 17 files / 152 tests；backend lint/build、frontend typecheck/contracts/lint/build、开发库和测试库 27 条迁移均通过。

## 2026-07-22 项目管理闭环修复

- 已完成根因审计：确认页面未接已有更新/归档 API、进展按钮条件错误，以及里程碑/进展删除和人工健康度/任务进度的数据能力缺口。
- 已完成设计规格和实施计划，并按 TDD 补齐项目、工作项、里程碑和进展的创建/编辑/归档契约。
- 项目详情现可维护目标、阶段、状态、计划/实际日期、负责人和人工健康度；人工健康度可随时切回自动计算，列表与详情统一展示有效健康度。
- 工作项新增 0～100 完成百分比，完成状态自动归一为 100%；工作项与进展均支持持续追加、编辑和确认删除，进展入口不再受空列表限制。
- 里程碑支持新增、编辑、删除、负责人、关键标记和状态维护；概览展示里程碑总体达成率、逐项状态和进度条。
- 项目状态语义色已统一为进行中绿色、已完成蓝色、暂停黄色、已终止红色；低/中/高/严重风险使用绿/黄/红分级标签，并在项目页展示真实风险数据。
- 数据库新增 `Project.healthOverride` 与 `WorkTask.completionPercent` 前向迁移，已部署到开发库和测试库；集成测试连接池限制为 1，避免与本地运行服务争用 PostgreSQL 角色连接上限。
- 最终验证：前端 83 files / 396 tests、9/9 Chromium E2E、contracts/typecheck/lint/build；后端 71 suites / 383 unit、37 suites / 157 PostgreSQL integration、Prisma validate/lint/build；`git diff --check` 全部通过。

## 2026-07-20 P1/P2 统一交付收口

- 后端完整门禁通过：71 suites / 383 unit、37 suites / 154 PostgreSQL integration、1 suite / 3 E2E；Prisma schema validate、27 条迁移状态、lint、build 全部通过。
- 前端完整门禁通过：82 files / 388 tests，typecheck、API contracts、lint、production build 全部通过；修复外部同步测试中的最后一个未使用变量。
- Electron 完整门禁通过：16 files / 47 tests、typecheck、前后端 production rebuild、electron-builder macOS 目录打包全部通过；产物位于 `desktop/release/mac`，未配置 Apple Developer ID，故本地目录包未签名。
- 真实 API 复核 CSV/XLSX 导出均返回 200，产物分别识别为 UTF-8 CSV 与 Excel 2007+，后端持续健康；确认旧 `ERR_HTTP_HEADERS_SENT` 来自已修复的 ExcelJS 流式实现。
- 真实浏览器复核搜索、数据治理、合作方、行业情报、非项目研发、统计报表、外部能力、多维表格 8 个路由，均无读取失败；模板中心展示 5 类模板，自定义表展示导入五阶段向导及当前视图/全表 CSV/XLSX 导出。验收临时表已删除。
- 当前只保留外部验收边界：真实 OpenAI、阿里云短信、CalDAV、WebDAV 必须由用户在 Electron 中录入凭据并确认；共享开发库不执行破坏性恢复，完整恢复演练应使用独立验收库。

## 2026-07-20 UI 日期控件动态漏检修复

- AST 回归测试先稳定复现了 `TasksPage` 与 `FieldEditor` 两处动态日期类型；扩大 token 扫描后又复现 `ViewFilterBuilder` 的间接 `datetime-local`。
- 已将任务调度弹窗、多维表格日期单元格编辑器、视图日期筛选器全部迁移到共享 Semi `DateTimePickerField`。
- focused 验证通过：3 files / 28 tests、lint、typecheck；真实浏览器确认任务弹窗 0 个原生日期 input、1 个 Semi DatePicker、1 个可见 Semi 日期弹层。
- 已新增 Chromium smoke 回归；完整门禁通过：83 files / 392 tests、lint、typecheck、production build、8/8 Chromium E2E，`git diff --check` 无错误。
