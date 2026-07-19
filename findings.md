# 发现与决策

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
