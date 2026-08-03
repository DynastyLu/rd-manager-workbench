# Kimi 大范围改动审查问题清单

**文档版本：** v2（按产品负责人确认的设计决策复核）
**审查日期：** 2026-08-02
**审查分支：** `design/aurora-glass-frontend`
**审查基线：** `main`（`3ee00c98`）
**审查版本：** `bd575a1`
**结论：** 当前版本可以继续开发，但在 P0 问题关闭前不应合并到 `main`，也不应进入多人或企业环境。

复核后保留的问题共 26 项：8 个 P0、12 个 P1、6 个 P2。已删除默认超级管理员创建方式相关问题，也未收录任何单纯的视觉风格或侧栏方向意见。

## 1. 审查范围和已确认决策

本次改动包含 47 个提交、443 个文件，约新增 46,577 行、删除 5,982 行，范围覆盖：

- Aurora UI、工作台和应用外壳；
- 登录、Token 刷新、用户、角色、权限和数据范围；
- 业务对象归属及 PostgreSQL 迁移；
- 员工、周报导入、项目进展草稿；
- 文档、知识库、本地文件夹扫描和 NOVA；
- WebSocket、Electron 桌面端和外部扩展。

以下内容是产品负责人明确确认的设计决策，不属于本次缺陷范围：

- 侧栏菜单栏改造为当前 Dock 形态，不要求恢复旧侧栏；
- Aurora、Dashboard、登录页及其他页面的现有视觉方向和样式调整；
- 零用户数据库启动时直接创建默认超级管理员和默认账号密码。

默认超级管理员当前配套行为是：首次登录必须修改密码；账号密码可通过环境变量覆盖；生产模式继续使用内置默认密码时后端拒绝启动。这些属于已确认方案的安全边界，不再作为缺陷提出。

本清单后续只记录可以通过代码路径、权限矩阵、接口调用、测试或构建命令复现的问题，不评价已确认的视觉选择。若页面出现遮挡、无法点击、状态不保存或交互不生效，仍按实际功能缺陷处理。

## 2. P0：合并阻断问题

### P0-01 员工周报导入缺少功能权限和数据范围

**位置：**

- `backend/src/modules/iam/interface/http/permission.guard.ts:19-25`
- `backend/src/modules/workbench/employees/interface/http/employee-imports.controller.ts:33-125`

**问题：** `PermissionGuard` 在接口未声明权限时直接放行，而员工导入控制器的模板、批次列表、上传、预检、匹配、提交、重建、恢复、源文件下载、错误文件下载和删除均未声明权限。

**影响：** 任意已登录用户可能读取、修改或删除全员周报和工作计划数据。

**验收要求：**

- 所有入口声明准确的 `employee.*` 或独立导入权限；
- 查询和下载按员工及批次归属过滤；
- 提交、恢复、删除仅允许管理员或明确授权角色；
- 增加管理员、员工 A、员工 B 三身份隔离测试。

### P0-02 工作台查询返回全组织数据

**位置：**

- `backend/src/modules/workbench/dashboard/interface/http/dashboard.controller.ts:4-10`
- `backend/src/modules/workbench/dashboard/application/dashboard.service.ts:11-65`

**问题：** 工作台接口没有功能权限声明，服务直接聚合全量任务、里程碑、项目健康和进展。

**影响：** 普通用户登录后可能看到全组织项目和员工工作数据。

**验收要求：** 工作台每个数据块使用当前用户的项目、任务、员工和会议数据范围，管理员才允许查看全量。

### P0-03 修改和删除错误复用读取权限范围

**位置：**

- `backend/src/modules/iam/application/data-scope.service.ts:10-158`
- `backend/src/modules/workbench/projects/application/projects.service.ts:177-247`

**问题：** 数据范围固定通过 `project.read`、`task.read` 等读取权限解析，修改、删除、归档等写操作仍调用读取范围。

**影响：** 当角色配置为 `project.read=ALL`、`project.update=SELF` 时，用户仍可能修改全部项目。

**验收要求：** DataScope 接收当前操作的准确权限码；read、create、update、delete、publish 分别验证，并覆盖“读全部、改自己”的集成测试。

### P0-04 日历、提醒、附件和文档版本存在跨用户读写

**位置：**

- `backend/src/modules/workbench/calendar/application/calendar.service.ts:40-98`
- `backend/src/modules/workbench/notifications/application/reminders.service.ts:20`
- `backend/src/modules/workbench/content/application/files.service.ts:100-247`
- `backend/src/modules/workbench/content/application/documents.service.ts:490-533`

**问题：** 多个详情、修改、归档、恢复、版本保存和永久删除操作主要按对象 ID 执行，没有在数据库条件中强制对象所有者和数据范围。

**影响：** 已登录用户拿到 ID 后可能读取、覆盖、归档或删除他人的日程、附件和文档历史。

**附加风险：** 附件永久删除先删除物理文件，再删除数据库记录；数据库操作失败时原文件无法恢复。

**验收要求：** 所有对象写操作在同一数据库条件中加入可访问范围；永久删除调整为可回滚顺序或事务化补偿机制。

### P0-05 WebSocket 存在跨用户广播

**位置：**

- `backend/src/modules/workbench/notifications/notifications.gateway.ts:13-30`
- `backend/src/modules/workbench/knowledge/knowledge.gateway.ts:39-62`
- `backend/src/modules/workbench/extensions/extensions.gateway.ts:44-51`

**问题：** 通知连接虽然加入 `user:<id>` 房间，但发布使用全局 `server.emit`；知识问答和扩展通道也存在未认证连接或全局广播。

**影响：** 一个用户的通知、问题、回答、引用、扩展配置或业务 payload 可能发送给其他在线用户。

**验收要求：** 所有消息必须在认证后按用户或明确共享空间发送；增加两个同时在线用户的消息隔离测试。

### P0-06 本地文件夹扫描允许越权操作服务器路径

**位置：**

- `backend/src/modules/workbench/knowledge/interface/http/knowledge.controller.ts:351-425`
- `backend/src/modules/workbench/knowledge/application/folder-watch.service.ts:109-273`

**问题：** 创建、停止、重扫、失败重试和进度读取只要求 `document.read`；创建任务接受客户端传入的任意服务器路径，且多处没有校验知识空间归属。

**影响：** 普通用户可能扫描服务进程可读取的任意目录，或操纵其他用户的扫描任务。

**验收要求：** 桌面端使用受控目录选择和白名单；后端对路径根目录、空间归属和写权限进行二次验证。

### P0-07 文件夹扫描 SSE 认证链路失效

**位置：**

- `frontend/src/modules/knowledge/api.ts:251-255`
- `backend/src/modules/workbench/knowledge/interface/http/knowledge.controller.ts:397-410`
- `backend/src/modules/iam/interface/http/authentication.guard.ts:21-30`

**问题：** 前端 EventSource 通过 query ticket 建立连接，但全局认证守卫会先要求 Authorization Bearer Token，控制器内的一次性 ticket 尚未执行就可能返回 401。

**影响：** 扫描进度无法实时推送，只能报错或退化成轮询。

**验收要求：** SSE 路由使用专门的一次性 ticket 守卫，并校验 ticket audience、过期时间、用户和文件夹归属。

### P0-08 项目进展草稿可读取全员数据

**位置：**

- `backend/src/modules/workbench/employees/application/project-progress-draft.service.ts:194-387`
- `backend/src/modules/workbench/employees/interface/http/employees.controller.ts:230-251`

**问题：** 草稿列表和按批次生成逻辑缺少完整 DataScope；采纳和忽略操作的权限要求偏低。

**影响：** 普通用户可能枚举全员工作内容，并对不属于自己的草稿执行采纳或忽略。

**验收要求：** 按项目管理权限、项目归属及员工范围过滤；采纳属于写操作，不得只依赖读取权限。

## 3. P1：重要功能和安全问题

### P1-01 无感 Token 更新未覆盖流式和文件请求

**位置：** `frontend/src/lib/http.ts:257-293`

`authenticatedFetch` 不执行 401 刷新、单飞重试和终止会话处理；同时允许任意 URL 并附带 Bearer Token。知识问答流、文件预览和下载可能在 Token 过期后失败，也存在未来误传外部 URL 时泄露 Token 的风险。

### P1-02 前端系统管理路由没有权限守卫

**位置：**

- `frontend/src/main.tsx:88-104`
- `frontend/src/router/routes.ts:348-353`
- `frontend/src/modules/admin/AdminLayout.tsx:22-58`

侧栏隐藏不等于权限控制。普通登录用户直接输入 `/admin/*` 仍会进入管理页面，再由接口返回 403。应按管理模块权限保护路由并过滤子页签。

### P1-03 创建账号依赖的员工候选接口不存在

**位置：**

- `frontend/src/modules/admin/api.ts:46-48`
- `backend/src/modules/iam/interface/http/admin-users.controller.ts:49`

前端请求 `/admin/users/assignable-employees`，后端没有对应静态路由，动态 `:id` 路由会把它当成用户 ID。创建账号并绑定员工的流程无法闭环。

### P1-04 默认员工无法读取自己的周计划和工作记录

**位置：**

- `backend/src/modules/iam/application/bootstrap.service.ts:145`
- `backend/src/modules/iam/application/data-scope.service.ts:88-119`

默认员工权限范围是 `INVOLVED`，但员工工作和周计划过滤只处理 `SELF` 和 `PROJECT`，忽略 `INVOLVED`，可能导致普通员工登录后看不到自己的数据。

### P1-05 用户永久删除只信任前端确认值

**位置：** `backend/src/modules/iam/application/users.service.ts:333`

永久删除仅检查前端传入的 `confirmNoOwnershipReferences`，没有在事务内重新统计项目、任务、文档、会议等引用。前端确认不能代替数据库约束检查。

### P1-06 历史数据归属迁移不完整

**位置：** `backend/src/modules/iam/application/ownership-migration.service.ts:72-564`

当前迁移目标遗漏部分新增 owner 字段；完成操作不重新扫描空归属；分配、幂等记录和审计没有统一事务或并发锁。普通用户登录流程也没有强制等待归属迁移完成。

### P1-07 `knowledge_sessions.owner_user_id` 缺少外键

**位置：** `backend/prisma/migrations/20260731000000_knowledge_session_owner/migration.sql:1-5`

迁移只增加字段和索引，没有关联 `users` 外键，可能产生悬空会话所有者。

### P1-08 桌面端新增 IAM 后仍有未带认证的请求

**位置：**

- `desktop/src/main.ts:359-361`
- `desktop/src/main.ts:416-447`
- `desktop/src/knowledge-open.ts:19-23`

通知、扩展连接、扩展完成回调及“打开本地原文件”等请求没有完整携带 Token，启用全局 IAM 后可能出现 401 或连接失败。

### P1-09 安全审计信息不完整

**位置：**

- `backend/src/modules/iam/application/users.service.ts:496`
- `backend/src/modules/iam/application/roles.service.ts:74`

部分用户管理审计把目标用户记录成操作人；角色创建、权限替换、启停和删除缺少完整安全审计。应记录 actor、target、前后差异、IP、UA 和会话 ID。

## 4. P1：当前工程质量阻断

### P1-10 前端 API 合约类型检查失败

**位置：**

- `frontend/src/modules/workbench/types.ts:21-44`
- `frontend/src/modules/workbench/api/__tests__/contracts.test.ts:116-138`

`Project` 新增必填 `ownerUserId`，但 API 合约样例和消费者没有同步。`pnpm typecheck:contracts` 失败，因此仓库定义的 `pnpm check` 无法通过。

### P1-11 大量业务和安全改动被混入设计清理提交

提交 `a3d8c3a chore(design): final pass and cleanup` 修改 368 个文件，新增 39,757 行、删除 4,147 行，同时包含 IAM、数据库迁移、桌面端和业务权限改动。

**影响：** 无法按功能审查或安全回滚，也很难定位回归来源。

**要求：** 在进入 `main` 前按 IAM、数据归属、员工、知识库、桌面端和 UI 重构提交历史或至少拆分 PR。

### P1-12 数据库升级缺少真实历史库验证

Prisma Schema 校验通过，但新增多批迁移和大范围 owner 字段，目前缺少“现有业务数据数据库 → 新版本”的完整部署、归属迁移、回滚和数据一致性验证。

## 5. P2：可复现的功能交互和性能问题

本节不评价颜色、布局风格、动效风格或视觉方向，只记录状态无法保持、操作不能完成、事件失效、键盘无法操作和资源加载过大等客观问题。

### P2-01 护眼主题重启后失效

**位置：** `frontend/src/main.tsx:6-19`

入口错误解析 Zustand persist 的 `{ state: { theme } }` 结构，导致刷新或重启后回退为 Aurora。

### P2-02 工作台交互未完整闭环

**位置：**

- `frontend/src/components/dashboard/HealthDonutChart.tsx:73`
- `frontend/src/pages/WorkbenchHome.tsx:138-197`

存在图例不能筛选、筛选无法明确清除、今日和逾期任务不能跳转、里程碑展示 projectId、关注项目缺少原因等问题。

### P2-03 图表事件更新和键盘访问不完整

**位置：** `frontend/src/components/dashboard/ReactECharts.tsx:38-73`

`onEvents` 更新后可能继续使用旧 handler；图表筛选主要依赖鼠标，没有等价键盘入口和数据摘要。

### P2-04 首页资源包过大

生产构建结果：

- `WorkbenchHome`：约 544.88 kB；
- ECharts 相关 chunk：约 1,075.65 kB；
- 构建产生超过 500 kB 的 chunk 告警。

应延迟加载图表，让标题、KPI 和快捷入口优先渲染。

### P2-05 登录密码显隐按钮无法键盘操作

**位置：** `frontend/src/modules/auth/pages/LoginPage.tsx:52`

显隐按钮被设置 `tabIndex={-1}`，键盘用户无法聚焦。

### P2-06 格式和构建警告

- `git diff --check main...HEAD` 存在尾随空格和文件尾多余空行；
- Lottie 构建中出现直接 `eval` 警告；
- knowledge API 同时被静态和动态导入，动态拆包无效。

## 6. 当前验证结果

### 已通过

- 后端 Prisma Schema 校验；
- 后端 lint、build；
- 后端单元测试：133 个套件、952 项通过；
- 前端 lint、常规 typecheck、production build；
- 前端测试：142 个文件，782 项通过、5 项跳过；
- Desktop typecheck；
- Desktop 测试：20 个文件、59 项通过。

### 未通过或尚未完成

- 前端 `pnpm typecheck:contracts` 失败；
- `git diff --check main...HEAD` 失败；
- 未完成真实历史 PostgreSQL 数据库升级和回滚演练；
- 未完成管理员、员工 A、员工 B 的端到端权限隔离验收；
- 未完成 WebSocket 多用户隔离验收。

## 7. 建议修复顺序

1. 冻结合并，先关闭 P0-01 至 P0-08；
2. 建立三用户权限隔离集成测试，避免只修接口表面；
3. 修复 Token、SSE、Socket 和 Desktop 认证链路；
4. 完成历史数据归属迁移、永久删除引用检查和数据库升级演练；
5. 修复员工绑定接口、默认员工数据范围和前端合约检查；
6. 整理大提交后再进入 `main`；
7. 最后处理主题、Dashboard 交互、无障碍和包体积。
