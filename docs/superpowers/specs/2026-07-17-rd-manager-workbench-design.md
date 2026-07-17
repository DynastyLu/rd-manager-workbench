# 研发主管本地工作台设计规格

> **历史版本 / 已替代（2026-07-18）：** 本规格中的根 pnpm workspace、`apps/`、`packages/` 及根 pnpm 命令已不再适用，仅作为项目历史保留，不得作为当前实施指令。当前工程基线以直接迁入的 `frontend/` 和 `backend/` 为准，请使用 [2026-07-18 直接迁移设计](./2026-07-18-direct-framework-migration-design.md) 与 [2026-07-18 实施计划](../plans/2026-07-18-direct-framework-migration.md)。

## 1. 状态与目标

- 设计状态：已由用户于 2026-07-17 确认。
- 产品形态：单机、本地优先的 Electron 桌面应用。
- 目标用户：第一阶段仅研发主管本人；多人、权限和局域网协作留到后续。
- 技术来源：从 `treasure-box` 提取 React 前端工程能力，从 `backend-core-platform` 提取 NestJS 后端工程能力；源仓库保持不变。
- 数据库：本机 PostgreSQL 17，目标数据库名 `rd_manager_workbench`。
- 核心目标：集中管理项目推进、申报认定、团队与外部协作、风险决策、行业情报和管理报表，形成可追踪的行动闭环。

## 2. 范围分解

项目拆成六个可独立计划、独立验收的子项目：

1. 工程骨架：pnpm 工作区、Electron、React、NestJS、PostgreSQL、共享契约和质量门禁。
2. 项目执行：首页驾驶舱、项目、里程碑、任务、进展和提醒。
3. 申报认定：申报档案、流程、条件、材料版本、证据、补正和提交。
4. 管理闭环：风险、问题、决策、合作方、沟通、会议和行动项。
5. 行业情报：主题、来源、检索计划、信息卡片、日报和行动转换。
6. 数据能力：搜索、报表、导入导出、附件、备份恢复和审计。

第一份实施计划只实现第 1 项及一个只读工作台占位页面。业务子项目在骨架验证通过后分别制定计划，避免一次性大爆炸开发。

## 3. 总体架构

```text
Electron Main Process
├── BrowserWindow 与应用生命周期
├── Utility Process 生命周期
├── 原生文件选择、桌面通知、打开外部链接
└── preload 白名单桥接
        │
        ├── React Renderer（apps/renderer）
        │   ├── React Router
        │   ├── TanStack Query
        │   ├── Zustand
        │   ├── shadcn/ui
        │   └── HTTP API Client
        │
        └── NestJS Utility Process（apps/backend）
            ├── REST API
            ├── Prisma
            ├── 定时任务
            ├── 本地附件索引
            └── PostgreSQL 17
```

### 3.1 进程边界

- Electron 主进程只负责桌面生命周期和受控原生能力，不承载业务逻辑。
- React 渲染进程启用沙箱、关闭 Node integration、开启 context isolation。
- NestJS 在 Electron Utility Process 中运行，避免后台任务阻塞主进程。
- NestJS 监听 `127.0.0.1` 的系统分配端口，不暴露到局域网。
- Electron 主进程每次启动生成一次性会话令牌，并通过 Utility Process 环境变量传给后端。
- 后端准备完成后通过父子进程消息发送 `ready` 和实际监听端口；会话令牌不从子进程回传。
- preload 只向渲染进程暴露读取运行时配置、选择文件、显示通知和打开受信任链接等窄接口。
- 应用退出时主进程先请求后端优雅关闭，超时后终止 Utility Process。

### 3.2 工作区结构

```text
rd-manager-workbench/
├── apps/
│   ├── desktop/                 # Electron main、preload、打包配置
│   ├── renderer/                # React/Vite 渲染进程
│   └── backend/                 # NestJS/Prisma 后端
├── packages/
│   └── contracts/               # 共享枚举、API 响应和跨应用类型
├── scripts/                     # 数据库、开发启动和构建编排
├── docs/superpowers/
├── package.json
├── pnpm-workspace.yaml
├── tsconfig.base.json
└── .env.example
```

不引入 Turborepo 或 Nx。根脚本直接使用 pnpm workspace filter 编排，降低初始复杂度。

## 4. 桌面生命周期

### 4.1 开发模式

1. 根脚本检查依赖和 PostgreSQL 可用性。
2. 启动 NestJS watch 模式并等待健康检查。
3. 启动 Vite 开发服务器。
4. 启动 Electron，加载 Vite 地址。
5. Electron 将 API 地址通过 preload 运行时配置提供给 React。

### 4.2 生产模式

1. Electron 启动 Utility Process，加载打包后的 NestJS 入口。
2. 后端读取 Electron 传入的数据目录、数据库 URL、附件目录和会话令牌。
3. 后端连接数据库并执行只读的迁移状态检查。
4. 后端成功监听随机端口后发送 `ready`。
5. Electron 注册 `app://workbench` 安全协议并加载打包后的 React 静态资源。
6. 若后端在 15 秒内未就绪，显示诊断页，不进入业务界面。

### 4.3 打包

- `electron-builder` 负责 macOS/Windows 安装包和资源收集。
- React 继续使用自身的 Vite 构建，Electron main/preload 单独构建，避免依赖仍标记为实验性的 Forge Vite Plugin。
- NestJS 先构建到 `dist`，再作为桌面应用资源打包。
- Prisma schema、迁移和当前目标平台的 query engine 必须进入 unpacked resources，不能只存在于 asar 内。
- 第一阶段只验证当前 macOS 架构；Windows 打包在骨架稳定后增加独立验证任务。

## 5. PostgreSQL 与文件存储

### 5.1 数据库初始化

- 开发环境默认连接 `127.0.0.1:5432`，管理库为 `postgres`，目标库为 `rd_manager_workbench`。
- `pnpm db:bootstrap` 是幂等脚本：检查 PostgreSQL、检查技术角色 `rd_manager_workbench_app`、检查目标库、在缺失时创建角色与数据库，然后运行 Prisma migration deploy。
- 技术角色使用 `LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE`，目标数据库 owner 为该角色；业务表位于 `app` schema。
- 脚本不得删除或重建任何已存在数据库。
- 应用启动不静默执行 `DROP DATABASE`、`CREATE DATABASE` 或破坏性迁移。
- 首次启动诊断页允许用户明确触发数据库初始化，并显示将要连接的主机、端口、角色和数据库名。
- 测试使用独立数据库 `rd_manager_workbench_test`，不得连接开发数据。
- 测试 helper 必须拒绝任何不以 `_test` 结尾的数据库名。

### 5.2 数据目录

- PostgreSQL 存结构化业务数据、关联关系、文件元数据和审计记录。
- 附件实体文件存储在 Electron `userData/attachments` 目录。
- 附件记录包含原始文件名、存储键、相对路径、MIME、大小、SHA-256、版本、创建时间和来源对象。
- 业务层禁止保存不可迁移的绝对路径；绝对路径只在存储适配器内解析。
- 备份由 `pg_dump`、附件目录和清单文件组成一个时间戳目录；恢复前必须验证清单和文件哈希。

## 6. 功能域

### 6.1 首页驾驶舱（P0）

- 今日待办、临期、逾期、会议、待决策和待外部回复。
- 项目健康度分布、临近里程碑和未关闭高风险。
- 本人主办项目的下个节点、倒计时、材料缺口和风险。
- 当日高优先级情报摘要。
- 新建任务、会议纪要、风险、申报材料和手工情报快捷入口。

### 6.2 项目与任务（P0）

- 项目档案、编号、类型、研发方向、目标、成果、负责人、参与方、日期、阶段和状态。
- 里程碑的计划/实际日期、负责人、材料、风险和会议关联。
- 任务、子任务、协作人、依赖关系、优先级、状态、截止日期和来源。
- 列表、看板和日历视图。
- 进展汇报和周报/月报草稿。
- 绿/黄/红健康度及其计算原因。

### 6.3 申报认定（P0）

- 品种/事项独立档案、申报地区、机构、批次、截止日期和协作单位。
- 可配置流程模板、节点、前置条件和倒排计划。
- 条件核对状态：已满足、待补充、待核实、不适用。
- 材料目录、文件版本、审核状态、最终提交版本和缺失预警。
- 试验数据与证据台账，支持 Excel 导入和多材料关联。
- 补正通知、回复期限、责任人、版本和提交凭据。
- 结果复盘、模板复用、关键状态和版本历史。

### 6.4 风险、问题与决策（P0）

- 风险概率、影响、等级、措施、责任人、状态和关闭日期。
- 问题/阻塞、影响对象、方案、期限和验证结果。
- 决策背景、备选方案、依据、结论、参与人和后续任务。
- 高风险、延期里程碑和关键任务逾期自动影响项目健康度。

### 6.5 合作方与会议（P0/P1）

- 合作单位、联系人、协议、合作项目、历史沟通、待对方事项和风险。
- 沟通记录、承诺、下次跟进日期和任务转换。
- 会议议程、纪要、决策、行动项和附件。
- 行动项自动生成任务，并保留会议来源。
- 人员技能、负荷、培养和主管日常管理进入 P1。

### 6.6 行业情报（P0/P1/P2）

- 主题关键词、同义词、排除词、优先级和关联项目。
- 信息源、可信度、抓取频率、启用状态和抓取日志。
- 定时检索、立即检索、失败记录和工作日简报。
- 信息卡片、来源、日期、摘要、分类、命中主题和优先级。
- 链接/标题/正文相似度去重与相关性排序进入增强阶段。
- 摘要、影响判断和建议动作第一阶段允许人工填写，AI 自动生成进入 P2。
- 情报可以收藏、标记、关联项目并转换为任务、风险或会议议题。

### 6.7 非项目研发（P1）

- 技术预研、新方向、平台工具、技术债、专利、标准方法、培训沉淀和临时支持。
- 目标、预期产出、负责人、投入人天、阶段成果和状态。
- 技术债额外记录影响范围、严重程度、建议、验证和关闭日期。
- 事项可以建议转为正式项目。

### 6.8 提醒、搜索、报表与数据（P0/P1）

- 日期型对象统一进入提醒中心。
- 桌面通知和应用内通知为 P0。
- 全局搜索覆盖项目、任务、材料、证据、会议、合作方、风险、决策和情报。
- 报表覆盖项目进展、里程碑、逾期、风险关闭、申报完整度和情报热度。
- Excel/CSV 导入导出、附件索引、备份恢复为 P0。
- Word、PDF、Markdown 导出和自动周报进入 P1。

### 6.9 后续扩展（P2）

- AI 摘要、周报和趋势分析。
- 日历、邮件、企业微信、钉钉、飞书、OA、Git 和 Jira 集成。
- 局域网多人部署、登录、角色权限和只读管理层。

## 7. 核心数据模型

### 7.1 通用对象

- `Attachment`：附件元数据和存储键。
- `Tag`：用户定义标签。
- `EntityLink`：跨域来源/关联，记录源类型、源 ID、目标类型、目标 ID 和关系类型。
- `AuditLog`：对象、操作、变更前后摘要、时间和本机操作者。
- `Reminder`：对象、触发时间、状态、通知渠道和去重键。

### 7.2 项目执行

- `Project` 1-N `Milestone`。
- `Project` 1-N `Task`。
- `Task` 自关联父子任务，通过 `TaskDependency` 建依赖。
- `Project` 1-N `ProgressReport`。
- `ProjectHealthSnapshot` 保存计算结果和原因，避免历史原因丢失。

### 7.3 申报认定

- `ApplicationCase` 关联一个通用 `Project`。
- `WorkflowTemplate` 1-N `WorkflowTemplateNode`。
- `ApplicationCase` 1-N `ApplicationNode`。
- `ApplicationRequirement` 保存条件和满足状态。
- `ApplicationMaterial` 1-N `MaterialVersion`。
- `EvidenceRecord` 通过关联表连接多个材料或条件。
- `CorrectionRecord` 和 `SubmissionRecord` 关联实际提交的材料版本。

### 7.4 管理闭环

- `Risk`、`Issue`、`Decision` 都可以关联项目、里程碑和任务。
- `Partner` 1-N `PartnerContact`，并关联 `CommunicationRecord`。
- `Meeting` 1-N `MeetingAction`；行动项创建任务后保存 `taskId`。

### 7.5 行业情报

- `IntelligenceTopic`、`IntelligenceSource` 和 `CrawlSchedule` 配置采集。
- `CrawlRun` 记录每次执行及错误。
- `IntelligenceItem` 保存规范化内容。
- `IntelligenceSourceOccurrence` 保存同一事件的多个原始来源。
- `IntelligenceBrief` 汇总日报/周报条目。

## 8. 统一业务规则

- 任何由情报、会议、沟通、风险或决策生成的任务都必须保留来源关联。
- 申报节点完成前校验前置节点、必需条件和必需材料。
- 关键材料只能通过新增版本更新，已提交版本不可覆盖。
- 项目健康度由延期里程碑、关键任务逾期和高风险共同计算；人工覆盖必须填写理由并写审计。
- 业务删除默认使用归档或软删除；附件实体删除进入可恢复回收区。
- 每个自动化任务使用去重键，防止重复生成提醒、简报或行动项。
- 所有时间存 UTC，界面按本机时区显示。

## 9. API 约定

- REST 前缀 `/api`，健康检查 `/api/health`。
- 资源使用复数名词，例如 `/api/projects`、`/api/tasks`、`/api/application-cases`。
- 列表统一使用 `page`、`pageSize`、`sort` 和显式过滤参数。
- 成功响应使用 `{ success: true, data, meta? }`。
- 错误响应使用 `{ success: false, error: { code, message, details? }, traceId }`。
- 写操作使用 DTO 校验；未知字段拒绝进入业务层。
- 删除接口默认归档；只有明确的本地维护接口允许不可恢复删除。
- 会话令牌只用于限制本机其他进程直接调用随机端口，不替代未来用户认证。

## 10. 错误处理与可观测性

- Electron 主进程记录窗口、Utility Process 启停和崩溃事件。
- NestJS 使用统一异常过滤器、响应拦截器、trace ID 和结构化日志。
- PostgreSQL 不可用、迁移缺失、端口启动失败和附件目录不可写都有独立错误码。
- React 对网络失败、空数据、权限/配置错误和后台未就绪提供明确状态页。
- 后端崩溃后允许一次受控重启；连续失败进入诊断页，不无限重启。
- 日志写入 Electron `userData/logs`，默认不记录材料正文、会话令牌或数据库密码。

## 11. 安全基线

- Renderer：`nodeIntegration: false`、`contextIsolation: true`、`sandbox: true`。
- 禁止任意导航、新窗口和未经校验的外部链接。
- preload 不暴露原始 `ipcRenderer`、shell 或文件系统对象。
- API 仅绑定 loopback，并要求每次启动生成的随机会话令牌。
- 生产 renderer 使用 `app://workbench` 自定义安全协议，不授予 `file://` 额外权限。
- `.env`、数据库 URL 和令牌不进入前端 bundle，不提交到 Git。
- 情报原文按不可信内容处理，不在 Electron 中执行远程脚本。
- 附件打开通过操作系统默认应用，不嵌入运行可执行内容。

## 12. 基座提纯原则

### 12.1 treasure-box

保留：React/Vite/TypeScript、路由骨架、Layout、ErrorBoundary、主题、i18n、请求层、TanStack Query、Zustand、shadcn/ui、Vitest、Playwright、Storybook、ESLint、Prettier 和 CI。

删除：OCR、发型、版权、历史业务页面、登录、用户管理、RBAC、旧服务、旧 schema、旧 mock、旧素材及对应测试。请求层移除 token refresh，仅保留运行时 API 地址、错误归一化和 trace ID。

### 12.2 backend-core-platform

保留：Nest bootstrap、配置、日志、请求上下文、Prisma 边界、异常过滤器、响应拦截器、健康检查、模块分层和测试配置。

删除：tenant、IAM、paper-auth、OCR、发型、版权、标签 mock、AI mock、S3、Redis/BullMQ、queue admin、现有内存 audit/jobs 和无关 worker。后续需要后台执行时，以 PostgreSQL `BackgroundTask/TaskRun` 加单进程执行器重新实现；审计以 PostgreSQL `ChangeHistory` 重新实现。

## 13. 测试策略

- 所有行为变更采用测试先行并验证红-绿循环。
- `packages/contracts`：类型和序列化单测。
- `apps/backend`：领域单测、Prisma repository 集成测试、REST e2e。
- `apps/renderer`：组件与路由单测、MSW API 场景。
- `apps/desktop`：主进程生命周期、preload 白名单和后端握手单测。
- 根级 smoke：启动后端、加载桌面窗口、读取健康检查并展示工作台。
- PostgreSQL 测试只连接 `rd_manager_workbench_test`。
- 完成骨架的最低门禁：lint、typecheck、unit、integration、e2e、web build、api build、desktop package dry-run。

## 14. 第一子项目验收标准

工程骨架完成时必须满足：

1. 根目录可一次安装所有 workspace 依赖。
2. `pnpm db:bootstrap` 可幂等创建并迁移 `rd_manager_workbench`。
3. 开发命令可启动 NestJS、Vite 和 Electron。
4. Electron 等待后端 ready 后展示工作台壳页面。
5. 工作台能够显示 API 健康状态和 PostgreSQL 状态。
6. Electron 退出后后端 Utility Process 正常退出。
7. 原始 `treasure-box` 和 `backend-core-platform` 工作树没有新增改动。
8. 所有骨架质量门禁通过。

## 15. 非目标

- 第一子项目不实现完整业务 CRUD。
- 第一阶段不实现登录、多租户、局域网服务、云同步和移动端。
- 第一阶段不内嵌或自动安装 PostgreSQL 服务。
- 第一阶段不实现 AI 摘要和外部协同系统集成。
- 第一阶段不承诺 Windows 安装包，只保证结构支持后续加入。
