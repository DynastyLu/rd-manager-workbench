# 发现与决策

## 2026-07-30 企业级账号、角色与权限决策

- 当前系统没有真实 User、Role、Permission 或 AuthSession 模型，HTTP 请求也没有 Access Token 注入与刷新逻辑；现有员工档案不能直接等同于登录账号。
- 用户确认账号与员工档案一一绑定，采用账号/工号加密码登录；首次登录必须改密码，忘记密码由管理员重置。
- 权限采用 RBAC 功能权限与 SELF、INVOLVED、DEPARTMENT、PROJECT、ALL 数据范围结合，而不是只在前端隐藏入口。
- 超级管理员拥有所有功能和全部数据；普通员工只访问自己创建、负责、参与或被共享的数据；项目经理、部门主管和 HR 通过角色模板与自定义角色扩展。
- Access Token 采用短时内存存储，Refresh Token 使用 HttpOnly Cookie、哈希保存、单次轮换和重放检测；多请求 401 使用单例刷新与请求排队。
- 搜索、报表、导出、文件下载、Socket 和 NOVA 检索必须执行与普通业务接口相同的数据权限，避免旁路泄露。
- 独立“项目进展草稿”入口取消，员工周报汇总建议迁入项目详情“进展”页，由项目负责人或管理员确认发布。
- 历史数据不能因权限升级丢失；可准确识别的记录绑定对应用户，无法识别的记录归首个超级管理员并标记待分配。
- 实施必须先交付可独立验证的认证和 IAM 基础，再分批封闭员工/项目、内容/NOVA、报表/治理的数据旁路；不能在所有历史数据归属完成前开放普通用户登录。
- 项目现有集成测试默认匿名调用大量业务接口，启用全局认证 Guard 时必须提供统一 `authenticatedRequest` 测试助手，并把每条业务测试明确绑定最小角色。
- 清理认证夹具的顺序必须为：业务测试数据 → `login_audits` → `auth_sessions` → `user_roles` → `role_permissions`（角色仍被引用时）→ `users` → `roles` → `resource_profiles`；`users` 删除前必须将 `projects`/`work_tasks` 等 Restrict 外键（如 `owner_user_id`、`assignee_user_id`）置空，否则触发外键约束失败。

## 2026-08-01 默认超级管理员自动创建

- 用户反馈首次启动时手动创建管理员账号步骤繁琐，改为后端启动时自动创建默认超级管理员。
- 默认账号 `admin`、工号 `ADMIN`、默认密码 `RdManager2026!`，可通过 `backend/.env` 中的 `DEFAULT_ADMIN_USERNAME` / `DEFAULT_ADMIN_PASSWORD` 覆盖。
- 生产环境（`NODE_ENV=prod`）schema 校验拒绝使用默认密码，强制部署方显式设置。
- 默认管理员自动绑定一条 `ResourceProfile`（displayName `系统管理员`），使用 `upsert` 避免重复启动或测试隔离不彻底时违反唯一约束。
- 默认账号首次登录强制修改密码（`mustChangePassword: true`），原有 `/setup-admin` 页面与 `POST /api/auth/bootstrap`、`GET /api/auth/bootstrap/employees` 端点已移除。
- 原认证集成测试改为在 `beforeAll` 中删除自动创建的默认管理员并创建隔离测试账号，避免破坏既有断言。

## 2026-07-31 Prisma 目录测试断言同步

- `backend/test/integration/prisma/employee-work-progress-catalog.spec.ts` 原先使用 `toContain('@@index([employeeId, periodStartAt, archivedAt])')` 断言 schema 目录；实际 `EmployeeWeekPlanItem` 的这两组复合索引已显式命名 `map`，导致严格子串匹配失败。修复方式改为允许可选 `map` 的正则匹配，保留对字段顺序和存在性的校验。
- `backend/test/integration/prisma/knowledge-rag-catalog.spec.ts` 原先期望 `enum KnowledgeSessionStatus`、`enum MessageRole` 和 `embedding Unsupported("public.vector(384)")`；实际 schema 中 `KnowledgeSession.status` 与 `KnowledgeMessage.role` 为 `String`，`DocumentChunk.embedding` 为 `Unsupported("vector")`。测试断言已同步为当前 schema，不改变数据模型。
- 这两类失败均属于 schema 演进后目录测试断言未同步，不是认证改动引入的回归。

## 2026-07-31 全局认证启用后的集成测试夹具决策

- 启用全局 `AuthenticationGuard` 后，原本匿名调用的 60+ 项业务集成测试全部改用 `authenticatedRequest` 助手，按最小权限原则为每个测试套件分配显式权限码和数据范围；保留 `@Public()` 健康/元数据端点的匿名断言不变。
- `authenticatedRequest` 返回的 `{ agent, user, employee, role }` 同时提供已登录 supertest agent 和 fixture 实体，便于在 `afterAll` 中精确清理，避免跨测试遗留用户污染后续用例。
- 所有使用动态 `Date.now()` 前缀的测试套件，其匿名创建/读取断言被替换为同一认证用户的请求；多用户隔离场景通过多次调用 `authenticatedRequest` 并分配不同角色显式表达。
- 认证相关集成测试（`auth.controller.spec.ts`）自身仍覆盖匿名拒绝、匿名注册初始化、密码错误锁定等路径；业务集成测试不再重复测试认证失败，而是验证已认证主体按权限访问数据边界。
- `ownership-migration.spec.ts` 对数据库干净程度有较高假设，其他套件遗留的 `TEST-*` 前缀记录会污染迁移扫描结果；已在该测试的 `beforeAll` 中增加 `cleanupOrphanTestRecords()` 兜底清理。
- `GET /api/workbench/status` 是 Electron 启动预检端点，需在登录前即可访问；已添加 `@Public()` 放行匿名请求，backend E2E 恢复通过。

- 启用全局 `AuthenticationGuard` 后，原本匿名调用的 60+ 项业务集成测试全部改用 `authenticatedRequest` 助手，按最小权限原则为每个测试套件分配显式权限码和数据范围；保留 `@Public()` 健康/元数据端点的匿名断言不变。
- `authenticatedRequest` 返回的 `{ agent, user, employee, role }` 同时提供已登录 supertest agent 和 fixture 实体，便于在 `afterAll` 中精确清理，避免跨测试遗留用户污染后续用例。
- 所有使用动态 `Date.now()` 前缀的测试套件，其匿名创建/读取断言被替换为同一认证用户的请求；多用户隔离场景通过多次调用 `authenticatedRequest` 并分配不同角色显式表达。
- 认证相关集成测试（`auth.controller.spec.ts`）自身仍覆盖匿名拒绝、匿名注册初始化、密码错误锁定等路径；业务集成测试不再重复测试认证失败，而是验证已认证主体按权限访问数据边界。

## 2026-07-30 14 项功能收口决策

- Windows 能力必须在 Windows runner 上重建后端原生依赖并生成 NSIS，不能复用 macOS 的 `node_modules`；仓库已新增 Windows 构建、smoke 和安装包上传工作流。本机只能验证脚本、类型、单测和 macOS 目录包，Windows 实机安装仍由该 runner 给出平台验收结果。
- 项目多视图只改变展示方式，任务 ID 和更新 API 保持唯一；基线/变更/关键路径采用独立计划模型，不把展示配置写回业务任务。
- 周报不能直接覆盖项目正式进展：先生成可审阅草稿，确认后才发布并进入活动时间线，避免自动汇总误写项目状态。
- 活动记录采用 append-only 表和数据库触发器覆盖项目、进展、风险、会议与项目文档；已有服务显式写入的来源不重复触发，避免一项操作出现两条动态。
- NOVA 与索引修复继续本地优先：未完成索引的文档明确排除并显示数量，用户可重试或受控忽略；不伪造“已检索全部知识”。
- PostgreSQL 客户端工具按 PATH 和 Windows 默认安装目录探测，备份/恢复前验证主版本；找不到工具时在健康检查和操作入口给出可执行修复信息，不把绝对路径、数据库 URL 或密钥暴露给页面。

## 2026-07-29 功能问题与功能完善拆分（已完成）

- 用户明确要求先把功能做完整，再处理视觉美化；因此本轮把“现有功能会失败/不闭环”和“新增效率能力”分成两个独立文档。
- 当前工程已经覆盖项目、任务、里程碑、进展、风险/问题/决策、会议、文档/知识、日历提醒、多维表格、搜索、备份审计、员工周报、资源与报表、行业情报和扩展设置。新文档不能把已有入口或基础 CRUD 重新列成“待实现”。
- 当前最重要的功能可靠性缺口包括：多维表格保存视图存在并发覆盖、Electron 正式包中的 NOVA 流式问答/知识上传/文件夹 SSE 使用错误基址、首次启动缺少 PostgreSQL/迁移自检、文件夹扫描进度不准确、NOVA 历史会话无分页、Windows 备份工具与本地模型仍缺实机验收。
- 功能增强应围绕用户每天的真实工作流排序：统一收件箱与快速处理、项目计划基线和依赖、员工周报到项目进展的自动汇总、会议行动闭环、跨对象活动时间线、NOVA 从“回答”升级为“可确认的业务操作”、自动日报/周报、规则化提醒和可钻取报表。
- 多人协同、账号权限、即时聊天、云端同步和移动端继续不进入当前单机版功能优先级；短信和外部集成只作为显式配置的扩展能力。
- 复核确认“我的工作”已经有收件箱/今日/本周/逾期/稍后/已完成，通知已有稍后提醒，任务已有依赖，会议行动项、员工计划和情报卡已有转任务/风险等能力；新路线不能把这些已有功能重复列为新增。
- 项目详情的“工作项”当前仍是单一列表，尚未把已有多维表格的看板/日历/甘特能力带入项目工作空间；项目进展已有里程碑和自动百分比，但缺计划基线版本、计划变更记录、关键路径和跨对象统一活动流。
- 报表后端已经提供组合、任务趋势、风险趋势、资源负荷、情报、汇总和 CSV/XLSX 导出；当前产品缺口是图形化趋势、对比、钻取、保存视图和定时生成，而不是重新实现统计 API。
- NOVA 已有会话、范围、引用、检索和历史消息，但没有将回答中的建议以“预览后确认”方式写入任务、风险、会议、进展或周报；这是从查询工具升级为工作助手的核心功能差距。
- 文件夹同步已有真实扫描数量和轮询兜底，但扫描阶段进度条固定为 35%，正式 Electron 环境的 SSE 基址仍为空；因此“实时扫描进度”只能算部分可用。
- 2026-07-29 20:15 单独复跑多维表格视图保存回归仍失败：第二次应保存 `score desc`，实际被先前 `score asc` 覆盖（1 failed / 17 skipped，定位到 `ViewSettings.test.tsx:706`）。该问题是稳定复现的真实数据一致性缺陷，不是测试噪音。

## 2026-07-29 全项目剩余问题审计（进行中）

- 生产构建中的 `config.js` 已提供 `apiBaseUrl`，但知识库上传、NOVA 流式问答和文件夹 SSE 仍使用 `import.meta.env.DEV ? 4311 : ''`。Electron 通过 `file://` 加载前端时会请求 `file:///knowledge/...`，因此这三条链路在开发浏览器可用、正式桌面包不可用或只能等待轮询降级。
- Electron 安装包启动时只拉起 Nest 并等待健康接口，不负责检测/安装 PostgreSQL、创建角色/数据库、执行 Prisma migration 或提供首次启动修复向导；数据库未预装时仍创建窗口，用户只能看到二次“无法读取”错误。
- `OfficePreviewService` 只通过 Unix `which` 和 macOS/Linux 路径寻找 LibreOffice，没有 Windows 默认安装路径与 `where.exe` 探测；同时转换异常拼接原始 `error.message`，可能把本机路径返回给页面。
- Windows 打包仅声明 NSIS，没有 Windows 构建/安装/启动自动化验收；`extraResources` 直接复制构建机的 `backend/node_modules`，包含 Prisma、Sharp、Canvas、ONNX 等平台原生依赖，必须在 Windows runner 产包并验证，不能把 macOS 产物视为 Windows 可用。
- 旧 `AutomationDataPage`、`MeetingsAndMaterialsPage` 和 `PlannedModuleState` 仍在源码和测试中；主导航已不直接引用，旧知识库/自动化路由会重定向，但未知 `/library/governance/:kind` 仍展示“规划中”。这是残留信息架构债务，不是当前主导航阻塞。
- NOVA 会话侧栏会一次性渲染所有历史会话，没有分页或虚拟化；会话持续累积后将违反大列表性能规则。当前“管理全部对话”也没有替代侧栏自身的增量加载。
- 图片预览与多维表格画册封面未声明固定 `width/height` 或 `aspect-ratio` 属性，存在内容载入时布局跳动风险；画册已有懒加载，知识文件图片没有懒加载。
- 通知和知识 WebSocket 均配置为 `cors.origin: true`，且没有连接鉴权；任意网页来源都可尝试连接本机 `4311` 并接收广播事件。外部扩展 WebSocket 已有本地来源白名单，可复用同一策略收紧。
- 本地文件夹扫描的“已扫描 N 个文件”来自真实进度，但扫描阶段进度条固定写死为 35%；生产桌面包的 SSE 地址同时存在 `file://` 问题，因此正式环境通常只能依赖 800ms 轮询降级。
- 数据备份/恢复直接调用 PATH 中的 `pg_dump`/`pg_restore`，但 Electron 安装包没有探测或捆绑 PostgreSQL 客户端工具；Windows 机器即使数据库可用，也可能在手动备份或恢复预检时失败。
- Web 版本更新提示仅轮询相对 `version.json`；Electron `file://` 下没有桌面自动更新、安装包签名、下载校验或回滚链路，正式分发后无法可靠升级。
- Semi Design 没有在根节点配置中文 locale，真实页面分页仍显示 `Previous`、`Next`、`Page 1`；同时 `index.html` 仍声明 `lang="en"`，与中文产品不一致。
- 前端全量测试暴露多处 `rangeSeparatorNode` 被透传到 DOM、异步更新未包在 `act(...)`、jsdom 导航未实现等警告；这些不一定是生产故障，但会掩盖真正回归并降低测试可信度。
- `KnowledgeHomePage`、`EmployeesPage`、`EmployeeDetailPage` 分别约 777/900/882 行，页面级请求、状态、弹窗和布局高度耦合；继续迭代会扩大回归面，应按数据查询、工作区布局和业务弹层拆分。
- 统计报表已有日期筛选、五类真实数据表和 CSV/XLSX 导出，不属于未实现；后续体验缺口主要是趋势图、项目/员工钻取、同比环比和保存报表视图。
- 主路由仍将旧“知识库”标记为 `PLANNED` 后重定向到已完成的“文档与知识库”，自动化路由也标记规划中后重定向搜索；这会让代码中的完成状态与用户看到的产品能力语义不一致。
- 当前生产构建最大的 JavaScript 块约为 Semi `es` 748 KiB、入口 584 KiB、日历 468 KiB；虽然页面路由已懒加载，组件库和日历仍应继续按需拆分，避免 Electron 首屏解析和低配 Windows 机器卡顿。
- 当前仓库没有可交付的 `desktop/release` 产物，也没有 Electron launch smoke；桌面层只有 52 个工具/IPC/provider 单元测试，不能替代安装、首次启动、迁移、关闭重启和升级验收。
- 前端全量门禁当前不是绿色：121 个测试文件中 3 个失败，680 个用例中 9 个失败。单线程复跑后关联字段测试恢复通过，但 `ViewSettings` 仍有 7 个失败，覆盖保存失败回滚、保存队列串行化、旧响应不得覆盖新草稿、删除前取消待处理 PATCH 和保存后刷新；其中“手动保存后继续编辑”已单用例稳定复现旧升序覆盖新降序，关系到多维表格视图配置的数据一致性，不能按测试抖动忽略。
- NOVA 输入框的 `outline: none` 是确定性回归，直接触发项目自有 UI 一致性契约失败；当前外层只有弱灰色 `focus-within` 边框，键盘焦点辨识度不足。

## 2026-07-29 稳定性、回收站与 Windows 模型

- PostgreSQL 技术角色连接上限为 10，当前 Prisma URL 没有 `connection_limit`，单个后端运行一段时间后已占用 8 个空闲连接并发生角色连接耗尽。
- 普通提醒与员工周计划提醒同时启动、每 30 秒执行、共享阻塞式 advisory transaction lock，且没有进程内防重入；默认 5 秒交互事务曾在 14.4 秒后过期。
- 文档服务只有 `trash/restore`，没有永久删除或清空接口；文件资产服务虽有永久删除，但知识库主页面使用的是 ContentDocument 契约。
- 上传知识文档由 ContentDocument、FileAsset/FileVersion、DocumentChunk、DocumentVersion 和存储原件/预览组成；本地扫描文件另有 FolderFile 映射，永久删除不能触碰用户磁盘原件。
- 当前 Intel Mac 的 `onnxruntime-node@1.24.3` 缺少 `darwin/x64` 绑定；依赖包包含 Windows x64/arm64 文件。Windows 是必须支持的平台，设计采用原生优先、WASM 兜底。
- 模型状态卡放在“本地文件夹”页语义错误；本地文件夹应只展示扫描同步，模型生命周期应归入检索设置。

## 2026-07-28 知识库原格式阅读问题

- 当前 `KnowledgeFileViewer` 将 PDF、DOC/DOCX、XLS/XLSX 等全部请求为 PDF 后放入同一个 iframe，文件类型语义丢失。
- 问题文件 `附件2. 采购意向申请表(辐射仪).xls` 是真实 BIFF XLS，包含 2 个工作表：`表1 采购意向项目`（A1:H28）和 `表2 品目编码`（A1:B3730，共 7460 个显式单元格）。
- 统一 PDF 转换把第二张 3730 行的工作表打印成 81 页，这不是适合 Excel 的阅读方式。
- XLS 使用“等线/宋体”等字体；当前 fontconfig 将这些字体错误匹配为 Verdana/Times New Roman，导致中文成为方框或消失。
- 决策：Excel/XLS 默认使用工作簿阅读器；DOCX 使用浏览器文档排版渲染；PDF 保持 PDF；旧 DOC/PPT 等浏览器无法解析的格式才使用 LibreOffice PDF 兜底。
- 真实页面验收：问题 XLS 显示 2 个工作表，主表 5×8，编码表 3730×2 且中文完整；真实 DOCX 的 Word 页面、表格与正文排版正常。
- 旧 Office 兜底增加隔离 LibreOffice profile、等线/宋体/微软雅黑中文字体别名和 v2 缓存失效；验证 PDF 嵌入 STSongti SC，中文可完整提取。

## 2026-07-22 P0 交互基础审计

- 生产 TSX 中仍有 53 处原生 `select`，主要集中在多维表格高级配置、合作方、行业情报、资源负荷和非项目研发页面。
- 14 个生产 TSX 仍导入 `@/components/ui`，与 52 个 Semi 页面并存，造成按钮、卡片、弹窗、下拉和焦点行为不一致。
- 日期时间静态 AST 规则已存在且当前通过，但尚未禁止原生 `select` 和旧 UI 导入回流。
- 应用壳已经提供唯一主 `main`，但知识库、多维表格和情报简报页面内部仍使用 `main`，形成重复主地标。
- 仍存在 `outline: none` 和 `transition: all`；需要保留明确的 `focus-visible`，并使用具体属性动画。
- 工作台已有基础颜色和弹窗安全间距，但缺少控件高度、焦点环、遮罩、表单间距和保存状态变量。
- 知识库已有 `documentId` 查询参数，多维表格只读取 `tableId/recordId` 但没有同步选择；项目、我的工作、日历和搜索仍有关键视图状态仅保存在本地。
- P0 不修改后端和数据库；所有业务行为必须在前端迁移中保持不变。

## 2026-07-22 P0 交互基础实施结论

- 生产 TSX 原生 `select` 已从 53 处降为 0；静态 AST 同时禁止原生日期/时间、原生下拉和 `@/components/ui` 业务依赖回流。
- React 19 adapter 必须在入口和测试环境最先加载；公共适配层现统一提供 Semi Input、Button、Card、Dialog、Select、日期时间和保存状态。
- 风险/问题/决策表单在组件迁移后必须显式声明 submit 类型；已用非受控表单值测试锁定，避免点击保存无请求的静默回归。
- Semi Modal 固定依赖 `semi-modal-title` 作为 `aria-labelledby`；兼容 Dialog 必须将复合 `DialogTitle` 提升为 Modal 的 `title`，不能只在 body 中渲染标题。
- AppShell 是唯一 `main` 所有者；知识库、多维表格和情报简报内部已改为带名称的 `section`。
- 项目、我的工作、日历、知识库、多维表格和搜索的主要视图状态已写入 URL；未知查询参数保留，默认值从 URL 删除，非法枚举和页码安全回退。
- 知识库与多维表格已接入统一保存状态；多维表格记录详情、视图、数据表、搜索与画册页码均可从 URL 恢复。
- 全量 Vitest 暴露的主要失败模式是旧测试仍调用原生 `selectOptions/fireEvent.change`，以及 409 项并发运行触发 5 秒超时；真实 Chromium 11/11 通过，证明生产 Semi 交互链路可用。该测试迁移不能通过重新引入原生控件解决。

> **历史记录说明（2026-07-18）：** 本文件中关于根 pnpm workspace、`apps/`、`packages/` 与根锁文件的条目均为已替代方案的历史发现，不是当前工程指令。当前代码和命令只在独立的 `frontend/` 与 `backend/` 中继续；以 `docs/superpowers/specs/2026-07-18-direct-framework-migration-design.md` 和 `docs/superpowers/plans/2026-07-18-direct-framework-migration.md` 为准。

## 需求
- 产品是研发主管单机使用的本地优先桌面工作台。
- 核心业务覆盖首页驾驶舱、项目与任务、品种申报/认定、风险问题决策、合作方与会议、行业情报、提醒搜索报表、数据备份恢复。
- 核心工作数据离线可用；网络主要用于行业情报和未来系统集成。
- 第一版桌面外壳采用 Electron，数据库采用本机 PostgreSQL 并重新建库。
- 使用 treasure-box 作为前端框架来源，使用 backend-core-platform 作为后端框架来源，删除原业务代码并保留工程能力。

## 本地代码发现
- treasure-box 当前是 React 19、TypeScript、Vite、React Router、Zustand、TanStack Query、shadcn、Vitest、Playwright、Storybook 的前端模板。
- treasure-box 仍包含 OCR、发型、版权、登录、用户管理等旧业务代码；工作树有大量未提交改动。
- backend-core-platform 当前是 NestJS、Prisma、PostgreSQL 的模块化单体框架，包含配置、日志、请求上下文、异常处理、健康检查等基础设施。
- backend-core-platform 仍包含租户、IAM、OCR、版权、发型、标签 Mock、AI Mock、Redis/BullMQ 等旧业务或平台能力；工作树有大量未提交改动。
- 直接清理原仓库风险高，用户已同意建立新的工作区。
- 本机已安装并运行 PostgreSQL 17.9（Homebrew），监听本地 5432 端口。
- 当前默认本地角色为 `dynastylu`，可无额外密码连接 `postgres` 管理库。
- 现有数据库中没有拟议的新库名 `rd_manager_workbench`，可以单独创建，避免影响 `backend_core_platform` 等已有数据库。
- treasure-box 不能整仓机械复制：当前入口包含登录恢复、浏览器运行时配置、Web 部署更新和世界杯主题，均与 Electron 单机应用冲突。
- renderer 应使用 `HashRouter`、Vite `base: './'`、严格 CSP，并从 preload 读取动态 API 地址。
- 浏览器 MSW Service Worker、Docker/nginx、Sentry、更新轮询、WebSocket 和旧业务 mock 不进入首个桌面骨架。
- 新前端目录采用 `apps/renderer`，比 `apps/web` 更准确表达 Electron 进程边界。
- 新后端目录采用 `apps/backend`；Nest 必须允许 `PORT=0`，绑定 `127.0.0.1` 并通过 Utility Process 完成 ready/shutdown 握手。
- 打包时 Prisma query engine、schema engine、schema 和 migrations 必须可在 ASAR 外访问；运行时代码禁止依赖 `process.cwd()`。
- 当前可用运行时：系统 Node.js 22.12.0，Codex 工作区 Node.js 24.14.0；根工程约束 `node >= 22` 可同时覆盖。
- 2026-07-17 查询到 Electron 43.1.1、electron-builder 26.15.3；实施计划固定这两个骨架版本并通过根锁文件复现。

## 技术决策
| 决策 | 理由 |
|------|------|
| Electron 主进程管理窗口和应用生命周期 | 与现有 TypeScript/Node 技术栈一致 |
| NestJS 运行在 Electron 独立 Utility Process | 避免后端任务阻塞主进程，并保留现有 REST 模块结构 |
| React 渲染进程保持浏览器沙箱 | 不直接暴露 Node.js，桌面能力通过白名单 preload API 提供 |
| 本机 PostgreSQL | 用户指定；首次启动需要连接检测、建库/迁移和失败提示 |
| 原始基座不直接修改 | 保护用户未提交成果，并使新项目边界清晰 |
| 新数据库暂定名 `rd_manager_workbench` | 命名清晰且不与本机现有数据库冲突，待设计确认后创建 |
| 采用文件化计划 + 测试驱动 + 子代理任务双重评审 | 用户要求分配子代理；同时保证每个实现任务先验收规格一致性，再检查代码质量 |
| 打包采用 `electron-builder` | renderer、Nest、main/preload 需要独立构建并携带 Prisma engines/migrations；比实验状态的 Forge Vite Plugin 更可控 |
| 生产 renderer 使用 `app://workbench` 自定义协议 | 避免 `file://` 额外权限，便于限制导航、CSP 和 SPA fallback |
| renderer 视觉方向采用“科研档案台” | 暖灰纸面、深墨绿导航、朱砂风险色、细网格与档案标签，强调专业判断和信息密度，避免通用 SaaS 紫色渐变 |

## 实施流程约束
- 所有生产行为改动遵循测试先行：先看到测试因缺少功能而失败，再写最小实现。
- 子代理仅领取边界清晰的任务；实现任务完成后先做规格符合性审查，再做代码质量审查。
- 不直接信任代理完成报告，主线必须检查差异并运行完整验证命令。
- 原始两个基座保持只读；新项目在独立 Git 仓库和功能分支中实施。
- 新工作区只保留一份根 `pnpm-lock.yaml`，不得复制子项目锁文件或生成物。
- renderer、Electron main/preload 和 tests 分别做严格 TypeScript 检查；Electron smoke 必须覆盖安全选项和 IPC 白名单。
- 生产环境不继承完整 `process.env`；数据库 URL 和会话令牌仅通过允许列表传入后端 Utility Process。
- UI 优先组合 shadcn 现有组件并使用语义色变量；不复制旧霓虹/世界杯主题，不用原始颜色覆盖组件状态。
- React 首骨架避免无意义 memo、barrel imports 和浏览器 Service Worker；运行时配置只初始化一次并使用版本化本地存储键。
- REST 使用复数资源、正确 HTTP 语义、统一分页和结构化错误；API 契约不得镜像数据库表结构。

## 2026-07-22 项目详情问题根因

- `ProjectWorkspacePage` 只调用 `getProject`、`createTask` 和 `createProgressReport`；已有的 `updateProject`、`updateTask`、`archiveProject`、`archiveTask` 完全没有接入页面，因此目标和工作项表现为只读。
- `ProgressSection` 只在 `progressReports.length === 0` 时渲染“提交进展”，一旦存在记录就没有新增入口，直接造成“进展只能设置一个”。后端实际允许多条记录。
- 后端已有里程碑新增/更新接口，但前端没有 API 封装和表单；后端也缺少里程碑删除、进展更新/删除接口。
- 项目健康度来自自动快照，Project 上没有人工覆盖字段；要满足人工设置同时保留自动评估，需要可空的 `healthOverride`。
- WorkTask 没有进度字段，无法持久化工作项进度条；需增加 0–100 的 `completionPercent`，而不是从状态临时猜测。
- 风险页签当前只是跳转空状态，无法在项目上下文中展示风险等级，也就无法满足风险分级颜色要求。
- 项目更新和软归档能力原本已经存在，主要缺口是前端未接线；里程碑删除、进展编辑/删除则属于后端真实能力缺失，已补为项目范围内受约束的接口。
- 健康度采用“自动快照 + 可空人工覆盖”而不是覆盖自动快照：`healthOverride = null` 时继续使用最新自动计算值，避免人工设置永久破坏风险驱动的健康评估。
- 工作项完成百分比作为独立字段保存；状态变为 DONE 时服务端强制归一为 100，避免列表、报表与详情出现完成状态但进度不足的矛盾。

## 研究发现
- Electron 的主进程和 Utility Process 都具备 Node.js 环境，适合托管 NestJS 编译产物。
- Tauri 虽然外壳更轻，但保留 NestJS 时需要额外分发 Node sidecar，跨平台打包复杂度更高。
- Electron 渲染进程应保持 `nodeIntegration: false`、`contextIsolation: true` 和 sandbox，并限制导航与 IPC。

## 遇到的问题
| 问题 | 解决方案 |
|------|---------|
| 源仓库存在大量未提交改动 | 在新工作区复制框架能力，不触碰原仓库 |
| 本机 PostgreSQL 不是随应用自包含 | 设计首次启动诊断、连接配置、建库与迁移流程 |
| 计划初稿缺少根 package 的 Electron smoke/package test 脚本 | 补充 `test:smoke:desktop`、`test:package` 和对应依赖 |

## 资源
- 需求文档：`研发主管本地工作台_开发需求清单.docx`
- Electron Process Model：https://www.electronjs.org/docs/latest/tutorial/process-model
- Electron Utility Process：https://www.electronjs.org/docs/latest/api/utility-process
- Electron Security：https://www.electronjs.org/docs/latest/tutorial/security
- Tauri Sidecar：https://v2.tauri.app/develop/sidecar/

## 飞书式本地工作台研究（2026-07-18）

- 飞书项目公开资料将空间、工作项、实例、关联关系和多视图作为项目管理核心；本地单人版保留这些对象关系，排除协作角色、权限和跨空间同步。来源：https://www.feishu.cn/content/4ek1avnv
- 飞书多维表格的表格、看板、日历、画册、甘特和表单是同一数据源的视图；本项目的预置表与自定义表同样要求单一记录源。来源：https://www.feishu.cn/hc/zh-CN/articles/360049067931-%E4%BD%BF%E7%94%A8%E5%A4%9A%E7%BB%B4%E8%A1%A8%E6%A0%BC%E8%A7%86%E5%9B%BE
- 飞书文档/文件支持历史版本；本地文档和文件需采用稳定对象标识加版本记录，不能以多份独立附件替代版本。来源：https://www.feishu.cn/hc/zh-CN/articles/360049067469-%E5%A6%82%E4%BD%95%E6%9F%A5%E7%9C%8B%E5%92%8C%E6%9B%B4%E6%96%B0%E6%96%87%E4%BB%B6%E7%9A%84%E7%89%88%E6%9C%AC?slug=true
- 飞书日历使用日程/会议提醒；本地版需由 PostgreSQL reminder + notification 记录、WebSocket、桌面系统通知组成。短信需要服务商配置，不能作为默认本地能力。来源：https://www.feishu.cn/hc/zh-CN/articles/049951025910-%E6%97%A5%E5%8E%86%E5%8A%A9%E6%89%8B%E4%BB%8B%E7%BB%8D

## P1-01 多维表格高级能力现状（2026-07-19）

- 当前 `DataFieldType` 只有基础字段，尚无 `LOOKUP`、`FORMULA`、`ROLLUP`；`DataViewType` 只有 `GRID/KANBAN/CALENDAR/FORM`，尚无 `GANTT/GALLERY`。
- 字段和视图的可扩展配置已经存入 JSON，可在不增加专用关系表的前提下保存公式、引用、甘特和画册配置；双向关联仍需要稳定的反向关系定义和删除约束。
- 当前前端没有 CSV/Excel 解析依赖，后端也没有导入预检、字段映射、错误行结果和导出端点。

## P1-02～P2-02 连续交付范围（2026-07-20）

- 用户明确将全局搜索、数据安全治理、合作方/非项目研发、行业情报/研发运营、短信/AI/外部集成纳入后续连续交付，并授权规格与计划完成后无需再次询问直接实现。
- 仓库已存在 P1-01C 导入导出与 P1-01D 业务模板的规格/计划；P1-02～P2-02 尚需按独立子系统分别形成规格和计划，避免数据库恢复、外部凭据、AI/短信网络调用与本地搜索共享一个不可控实施批次。
- 第一版仍坚持本地单人优先：外部能力必须采用可配置适配器、默认关闭、密钥不落审计正文；没有真实服务商凭据时实现完整配置、验证、队列、失败状态和测试适配器，不伪造真实发送成功。
- 旧计划可复用但不能原样照搬：`data-governance-p0` 已定义安全备份/恢复与搜索边界，`intelligence-p0` 已定义人工采集闭环，`non-project-rd-p1` 已定义资源/周报，`p2-local-extensions` 已定义外部适配器安全模型；新规格需对齐当前飞书式七入口导航与已经落地的内容/通知/Base 模块。
- 当前生产代码已存在 Partner/Contact/Agreement/Communication 的 Prisma 模型、Nest service/controller 和 `PartnersPage.tsx`，因此 P1-04 的合作方部分应做完整交互与对象关联补齐，不重复建表；非项目研发与资源档案尚未落地。
- 当前未发现 governance/search/backup/audit、intelligence/operations/report、extension/sms/AI/external adapter 的生产模块或页面。P1-02、P1-03、P2-01、P2-02 仍是实质性新子系统。
- `WorkbenchModule` 当前只组合 dashboard/projects/tasks/applications/management/calendar/notifications/content/base；新增能力应分别以 `search`、`governance`、`operations`、`intelligence`、`extensions` 垂直模块导入，而不是继续膨胀 ManagementModule。
- 前端已经具备 Semi UI、TanStack Query/Table、FullCalendar、Tiptap 和 Socket.IO，不需要为这些批次更换 UI/状态框架；后端尚无 HTTP provider SDK、AI SDK 或加密凭据依赖，P2-02 应从框架无关的 provider interface 与本地受保护凭据桥接开始。
- P1-02 的 UI 必须占用已有 `/search` 顶级入口；P1-04/P2-01 继续作为项目关联对象和业务库/多维表格上下文，不能重新添加后台式顶级菜单。
- `/search` 当前错误复用 `AutomationDataPage` 规划页，路由已标记 AVAILABLE 但没有任何真实请求；P1-02 可直接替换该组件，不需要改七入口导航。旧 `/automation-data` 已重定向 `/search`，可在搜索页内增加“数据安全/扩展设置”次级入口。
- `PartnersPage.tsx` 只支持名称创建和卡片列表，没有详情抽屉、联系人/协议/沟通 CRUD、跟进过滤或对象深链；而后端已有相应端点，因此 P1-04 应先把现有 API 全部产品化，再新增非项目研发对象。
- 当前前端混有旧 shadcn 管理页和新 Semi 工作区；本批新增页面统一用 Semi Design 与现有 `app-page`/工作区 token，不再复制 PartnersPage 的单行 shadcn 写法。
- Desktop 目前只通过 preload 暴露通知点击订阅，尚无 `safeStorage`、凭据存取 IPC 或外部集成授权桥；P2-02 必须新增严格命名的凭据 CRUD 白名单，浏览器模式明确返回不可用，不能让 renderer 或 Nest 获得任意 IPC/文件访问。
- Electron 启动后端时会传递完整 `process.env`，这是后续凭据隔离的风险点；外部服务密钥不应进入该环境。方案采用 Electron safeStorage 持有密文并由显式 IPC 调用执行 provider 请求或签发短期凭据句柄，审计只记录 provider/profile/哈希/状态。
- Partner 后端生命周期已覆盖联系人、协议、沟通和沟通转任务，但服务存在紧凑单行与 `any` delegate 的可维护性问题，前端 API 还缺 child 更新/归档函数。P1-04 计划应在功能范围内拆分 service/DTO 并补齐类型安全，而不是重建现有表。
- 工程已有名为 `20260718050000_operations_p1` 的迁移但当前 `workbench.module.ts` 没有 operations 模块；必须检查 schema 与 migration 是否为“数据模型已落地、服务/UI 未接入”的半成品，避免 P1-04/P2-01 再建重复模型。
- `LocalStorageAdapter` 只有 Buffer 读写/删除和路径越界保护，缺少流、列目录、原子 rename/copy、lstat/symlink 检查；P1-03 备份恢复需要扩展独立 `BackupStorage`/受控文件工具，不能强行用现有附件端口承担目录快照。
- 环境配置目前只有数据库与 storage root；备份可执行文件、备份目录、自动备份时间与保留策略应进入受控配置/数据库设置，不允许请求参数传入 executable、数据库 URL 或任意路径。
- `20260718050000_operations_p1` 已真实应用并在生产库创建非项目研发、成果、资源档案/技能/负荷和周报表，但当前 `schema.prisma` 完全缺少对应 enums/models，Prisma Client 无 delegates，属于迁移历史与声明 schema 漂移。P1-04/P2-01 第一任务必须先以“恢复声明模型、绝不重建/删除既有表”的契约测试修复。
- 旧 non-project 计划的数据模型和 API 边界与本次 P1-04/P2-01 基本匹配，可复用迁移表结构；当前 Calendar 已由 P0-B 独立实现，新的 operations 模块不再创建第二套 calendar endpoint，只把非项目事项投影到现有 CalendarService。
- 仓库保留三个未合入 main 的历史实现分支：`feature/non-project-rd-p1`（2 个实现提交）、`feature/intelligence-p0-v2`（情报前后端）、`feature/data-governance-p0`（搜索/附件/通知/备份恢复等多提交）。这些不是当前生产代码，但可作为已写测试和领域实现的来源；必须逐提交审查并移植到当前 main，不能整分支合并，因为它们基于 7 月 18 日旧路由/旧内容模型。
- 历史 operations 分支包含完整 Nest services/controllers、React Operations/Reports 页面和测试，可显著降低 P1-04/P2-01 风险；当前计划应先恢复 schema 并选择性移植服务，再对齐现有 Calendar、Base、Semi UI 与新增规格。
- P1-01 实际包含四个独立子系统：关联与计算、进阶视图、导入导出、模板；应分四个规格/实施批次，避免一次迁移同时改变表达式执行、文件处理和 UI 视图。
- P1-01A 双向关系以配对字段和稳定锁顺序保证一致性；计算链限制在当前表内，LOOKUP/ROLLUP 只读取目标表基础字段，从模型上阻断跨表递归和循环。
- P0-D 已完成并通过最终门禁：前端 50 files / 187 tests，后端 unit 75、integration 80、E2E 3，主库 14 条迁移最新。
- P1-01 实施前复核确认前端集中在 `frontend/src/modules/base`；后端并不存在 `backend/src/modules/base` 目录，实施计划必须先按实际 data/platform 模块定位服务与控制器，不能沿用旧目录假设。
- 后端真实模块位于 `backend/src/modules/workbench/base`；`DataView.config` 已是 JSON，P1-01B 的甘特、画册和个人保存筛选无需增加专用视图配置表，只需扩展视图枚举与配置校验。
- 前后端当前都没有 Excel/CSV 解析依赖；P1-01C 需要新增受控文件解析、导入预检/提交两阶段 API、错误行结果和流式导出，不能把大文件完整交给浏览器自行写库。
- P1-01D 可复用 `DATA_TABLE_PRESETS` 的声明式字段/视图定义模式，但业务模板应通过独立模板目录和事务创建自定义表，不能混入五张只读系统预置表初始化流程。
- 用户确认模板只创建表结构、字段和视图，不生成示例记录；确认 P1-01A～D 采用现有底座分层扩展方案，不创建 Base V2 或第二套数据模型。
- 导入导出复用受控本地存储 key 并新增可过期的导入会话；进阶视图以 `viewId` 在服务端执行保存筛选，保证分页总数和完整数据集过滤正确。
- 实施文件映射确认：后端 Base 目前只有控制器集成测试，没有公式/查询/模板专用单元测试；计划需为新服务分别建立 focused unit tests，并扩展 `base.controller.spec.ts` 做真实 PostgreSQL 契约验收。

## 原生日期控件漏检根因（2026-07-20）

- `TasksPage` 使用 `type={kind === 'reminder' ? 'datetime-local' : 'date'}`，`FieldEditor` 使用字段类型三元表达式，旧规则只识别 `type="date"` 这类字面量，导致动态 JSX 属性漏检。
- 第二遍扫描发现 `ViewFilterBuilder` 通过辅助函数间接返回 `datetime-local`，单纯检查 JSX 属性仍无法捕获；生产代码现在同时禁止遗留 `datetime-local` token。
- 三处均统一迁移到 `DateTimePickerField`（Semi `DatePicker`），并保留原有 `YYYY-MM-DD` / `YYYY-MM-DDTHH:mm` API 序列化契约。
- 真实浏览器检查“稍后处理”弹窗：原生日期/时间 input 为 0，Semi DatePicker 为 1，日期面板可正常展开。

## P1-02～P2-02 并行审计补充（2026-07-20）

- `/search` 虽已注册为 AVAILABLE，实际仍指向 `AutomationDataPage` 规划页；顶栏搜索输入也被明确禁用。现有 Project/Task/Document/Meeting/Risk/Decision 深链和各领域查询服务可以作为首版 adapter registry 的真源。
- P1-02 首版按已确认规格采用“服务端 adapter registry + 聚合查询”，最近搜索保存在 renderer localStorage；不先引入需要全领域写入同步的 SearchDocument 索引，后续数据量证明有必要时再用 rebuild/outbox 演进。
- P1-03 恢复不能在仍提供 API 的 Nest 进程内直接执行；Electron main 持有维护令牌，停 API 后运行固定 maintenance CLI，并使用 staging、外部 journal、PRE_RESTORE 快照和数据库/文件共同补偿回滚。
- Audit 不保存搜索词、正文、手机号、URL query、数据库 URL 或凭据；PostgreSQL、备份和 renderer 都不得出现外部 provider 密钥。
- Partner 后端已有四个基础模型和 API，但缺 PartnerProject、沟通转任务幂等、真正 partial DTO、更新引用校验、聚合筛选和完整前端详情。
- 情报历史分支只复用算法与测试意图，不整体 cherry-pick；旧路由、旧 Calendar 和旧 UI 与当前七入口结构冲突。
- `LocalStorageAdapter` 已阻止 storage key 越界，但读写采用 Buffer；20 MiB 导入上限可安全复用，导出则必须直接通过响应流/生成 Buffer 后发送，不能复用页面 100 条分页结果。
- `StorageModule` 虽在 AppModule 和 ContentModule 中导入，但 ContentModule 未重新导出它；Base 导入服务必须在 BaseModule 直接导入 StorageModule。CSV/XLSX 导出采用可写流，避免完整导出常驻内存。
- 公式 evaluator 必须只捕获自身 `FormulaEvaluationFailure`；未知编程异常应继续抛出。日期函数仅接受严格带时区 ISO 日期时间或有效 Date，且必须在 `toISOString` 前检查溢出。
- 字段配置 create/update 必须在同表 advisory transaction lock 内用同一 TransactionClient 完成读取、依赖图验证和写入，避免并发公式更新形成循环；归档字段恢复必须复用原 ID。
- 后续双向关系任务需明确拒绝在非 TWO_WAY RELATION 上提交顶层 inverse 选项；关系依赖校验当前为低频串行查询，可在 P1-01A 收尾时评估批量化。
- 双向关系除了记录写入原子性，还必须覆盖表/字段生命周期：有活跃入站或出站关系的表禁止归档，有非空存量值时禁止直接修改目标表或多值基数，避免悬挂 ID 和静默丢数。
- 表归档和表内写入必须共用同一组稳定 advisory locks，并在取得锁后用同一事务重新确认表仍 active；只在锁前查询会留下“等待期间已归档、拿锁后继续写”的竞态窗口。
- 系统预置关系与规范化自定义关系的空值语义不同：自定义关系以 `targetTableId` 配置识别并拒绝空 ID，`DOCUMENTS.projectId` 等系统字段仍保留 `""` 清空为 `null` 的适配器契约。
- 计算字段读取不能只信任保存时校验；Resolver 还需防御历史/手工损坏配置，重新检查 LOOKUP 禁止目标计算字段、数值 ROLLUP 只指向 NUMBER、COUNT 不携带目标字段，并把错误隔离到单个 `computedErrors`。
- “请求内批量”不仅是调用适配器一次：系统目标查询必须把 ID 真正下推到各 Prisma `findMany`；会议/行动项和风险/决策等复合来源需先拆 ID 前缀再分别限定查询，避免单个 LOOKUP 退化成全表扫描。
- LOOKUP 的展示顺序应由来源关系 ID 顺序决定，数据库返回顺序只用于建立 `id -> record` 映射；这样既可对查询 ID 排序/去重，又不会破坏用户排列。
- 真实页面验收确认关联标签不能在每个单元格内单独查询；当前表格按目标表和最多 100 个 ID 分批读取，既保留关系顺序，也避免 N+1 请求。
- 公式字段创建时没有具体记录上下文，预览接口会明确拒绝依赖 LOOKUP/ROLLUP 的表达式；字段保存后，读取时解析器会按 LOOKUP/ROLLUP→FORMULA 的拓扑顺序正确计算，真实记录更新已验证 90/“通过”到 65/“继续评估”的联动。

## 视觉/浏览器发现
- 需求文档共 6 页，包含 13 个表格、完整 P0/P1/P2 优先级和 MVP 验收标准。
- 页图版式完整，但渲染环境缺少相应中文字体，部分中文显示为方框；文字结构提取完整。

## 弹窗底部间距审计（2026-07-20）

- 截图中的问题来自项目详情页 `ProjectWorkspacePage`：Modal 使用 `footer={null}`，`TaskForm` 的保存按钮位于 body 内部并成为弹窗最后一个元素。
- 浏览器实测 `.semi-modal-content` 为左右 `24px` padding；`.semi-modal-body` 为 `0px` padding；带 footer 时 `.semi-modal-footer` 使用上下 `24px` margin。因此有 footer 的弹窗底部正常，无 footer 的弹窗 body 会直接触底。
- `workspace-tokens.css` 之前对 `.semi-modal-body/.semi-modal-footer` 的同权重规则被后加载的 Semi CSS 覆盖，没有形成预期的统一盒模型。
- 全项目存在多处 `footer={null}`，不能只修项目详情组件；需要对“body 是 modal-content 最后一个子元素”的所有无 footer 弹窗提供统一底部安全间距，并用真实几何测量防止回归。
- 静态清点覆盖 25 个包含 Modal 的组件文件、44 个 Semi Modal，其中 25 个显式 `footer={null}`；另有 4 个旧 Radix Dialog。Semi 无 footer 模式统一由 `body:last-child` 安全区覆盖，Radix Dialog 原有 `p-4` 四周内边距。
- 修复后项目工作项弹窗浏览器实测：弹窗 `520×352`，保存按钮到底部和右侧均为 `25px`；修复前底部只有 `1px`。

## 表单控件与项目资料布局审计（2026-07-20）

- 日历“新建日程”真实 DOM 包含 3 个 `input[type=datetime-local]`、1 个原生 `select`、0 个 Semi DatePicker、1 个 Semi Select；截图中的日期面板是 Chromium 原生控件。
- 源码静态扫描仍发现多处 Semi Input 包装的 `date/datetime-local`，它们虽然输入框外观接近 Semi，但日期弹层仍由浏览器提供；需要改用 Semi DatePicker。
- 原生 `select` 主要集中在多维表格高级配置、情报、合作方、资源和会议等旧表单；需要区分复杂 Base 编辑器与普通业务弹窗逐批迁移，不能仅靠 CSS 伪装。
- 项目资料页附件组件盒模型与卡片同宽，标题位于卡片左边界而不是 18px 内容线；浏览器实测附件 `x=373`，期望内容起点与卡片标题一致为约 `x=391`。
- `FileAttachments` 的样式错误地定义在 `KnowledgeHomePage.less`，组件自身没有导入样式，造成样式职责错位和潜在的按路由加载差异；应迁移到组件专属 Less 并由组件导入。
- 修复后静态契约覆盖全部生产源码，原生 `date/datetime-local/time/month/week` 输入为 0；统一 `DateTimePickerField` 使用 Semi DatePicker，同时保留 FormData、键盘手输、本地时间序列化和可访问标签契约。
- 修复后日历创建弹窗真实 DOM 为 3 个 Semi DatePicker、2 个 Semi Select，原生日期和原生 select 均为 0；实际展开 `.semi-datepicker-container` 成功，不再调用 Chromium 原生面板。
- 修复后项目附件区四边 padding 均为 `18px`，附件内容起点回到卡片内容网格；样式已迁至 `FileAttachments.less` 并由组件自身导入。
- 普通原生 `select` 仍有 53 处、分布在 18 个生产组件文件：主要是多维表格字段/视图/筛选/导入导出高级配置，以及情报、合作方、资源、会议、非项目研发旧表单。它们不再包含本次截图中的日历弹窗，但仍应作为下一轮组件库迁移范围。

## P0 交互基础收口（2026-07-23）

- 生产 TSX 中的原生 `select`、原生日期/时间输入和 `@/components/ui` 业务引用已归零，并由 AST/静态测试阻止回流。
- Semi `Select` 是 `div[role=combobox]`，不能沿用原生 `selectOptions`、`value` 和内嵌 `option` 断言；测试已改为展开 Portal 后按真实选项交互。
- 知识库自动保存必须携带文档 ID 和修订号快照；只有返回请求与当前草稿完全匹配时才能清除 dirty，否则慢请求会覆盖用户新编辑。
- 查询参数工具需在同一事件中累积连续更新；仅从当前 render 的 `searchParams` 克隆会丢掉前一次修改。
- 旧路由重定向不能只传 pathname，必须合并并保留原查询参数；否则收藏目录、搜索词和深链会在 `/knowledge` 到 `/docs` 的过渡中丢失。
- FullCalendar `datesSet` 可在 React 渲染阶段触发，不能在其中同步 navigate；当前使用可取消的延后 URL 同步，卸载时清理，避免切换页面后旧日历回调篡改新路由。
- 浏览器验收服务必须使用产品约定的 `4312` 端口；临时 `4174` 会被后端精确 CORS 白名单拒绝，导致页面表面上看起来“没有数据”。

## 稳定性、回收站与 Windows 本地语义模型（2026-07-29）

- 仅在数据库事务内删除文档行不足以保证附件一致性；永久删除需要“受控暂存日志 + 原子移动 + 事务提交 + 提交后清理”，并在启动和后续操作前恢复未完成日志。多个后端进程还必须用 PostgreSQL advisory transaction lock 串行化恢复和删除。
- 本地文件夹同步得到的 `sourcePath` 属于用户原文件，不是应用托管附件；永久删除知识库记录时只能删除应用 storage key，绝不能删除本地源文件。
- 周计划提醒不能由多个定时器各自持有阻塞锁；单一维护协调器使用非阻塞 try-lock，按“同步提醒定义→扫描到期提醒”的固定顺序运行，避免连接池等待和同周期重入。
- `DATABASE_URL` 应规范化为唯一的 `connection_limit=5`，既保留密码和其他查询参数，又避免重复参数在不同平台产生不确定行为。
- Transformers/ONNX 模型下载缓存不能依赖进程临时内存。Windows 使用 `%LOCALAPPDATA%/RD Manager Workbench/models/embeddings`，其他平台使用对应用户缓存目录，并允许 `LOCAL_AI_MODEL_CACHE` 显式覆盖；原生 ONNX 加载失败后降级 WASM，失败时仍保留全文检索。
- 全量重索引创建必须在 PostgreSQL advisory transaction lock 内复验活动任务；否则双击或多窗口请求会创建重复索引作业。锁键通过 Prisma 参数插值传入，避免 PostgreSQL 不接受带下划线数字字面量的问题。
- 本地模型的持久化状态需区分 `UNKNOWN`、`PERSISTED` 和 `DEGRADED`。缓存写入失败可让本次内存推理继续，但页面必须明确提示“本次可用、重启后可能重新下载”，且接口不得返回原始异常、绝对路径或索引任务错误数组。
