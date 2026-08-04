# 星研工作台

星研工作台是一套面向研发团队的本地优先工作台：项目、任务、员工周计划、会议、文档知识库、多维表格、提醒与企业账号权限统一在同一个桌面应用中。前端在浏览器开发模式或 Electron 桌面端运行，业务数据保存在本机 PostgreSQL。

> 当前版本以单机部署为主。多人、短信、云盘和 AI 服务均保留为可选扩展，不会在未配置凭据时上传本地业务数据。

## 仓库结构

| 目录 | 说明 |
| --- | --- |
| `frontend/` | React、TypeScript、Vite 前端，源自 treasure-box 的通用工程骨架。 |
| `backend/` | NestJS、Prisma、PostgreSQL API，源自 backend-core-platform 的通用工程骨架。 |
| `desktop/` | Electron 桌面壳，负责启动检查、运行时 API 地址与本机能力桥接。 |

根目录不是 pnpm workspace；三个应用分别安装依赖、维护锁文件并独立运行。

## 快速启动

### 1. 准备 PostgreSQL

创建本机数据库和应用账号后，将 `backend/.env.example` 复制为 `backend/.env` 并设置 `DATABASE_URL`。默认连接示例：

```dotenv
DATABASE_URL=postgresql://rd_manager_workbench_app@127.0.0.1:5432/rd_manager_workbench?schema=app&connection_limit=5
```

需要使用知识库全文/向量检索时，数据库账号还应有安装 `vector` 与 `pg_trgm` 扩展的权限。

### 2. 启动后端

```sh
cd backend
cp .env.example .env # 首次执行；随后填写 DATABASE_URL 和生产密钥
pnpm install
pnpm prisma:generate
pnpm prisma:migrate:deploy
pnpm start:dev
```

后端默认监听 `http://127.0.0.1:4311`，API 前缀为 `/api`。

`prisma:generate` 会根据 `prisma/schema.prisma` 生成 TypeScript Prisma Client；`prisma:migrate:deploy` 则按顺序应用已提交的数据库迁移。首次拉取代码、更新迁移或切换机器后，这两步都必须执行。

### 3. 启动前端

```sh
cd frontend
cp .env.example .env # 首次执行
pnpm install
pnpm dev
```

打开 `http://127.0.0.1:4312/#/`。前端开发环境默认请求 `http://127.0.0.1:4311/api`；需要覆盖时在 `frontend/.env` 设置 `VITE_API_BASE_URL`。

两个端口固定为 `4311`（后端）和 `4312`（前端），与原有项目常用端口隔离；端口被占用时应用会直接报错，不会静默改用其他端口。

## 首次登录与企业权限

当数据库中尚无用户时，后端会创建一个默认超级管理员。启动后使用以下账号登录：

| 字段 | 默认值 |
| --- | --- |
| 账号 | `admin` |
| 工号 | `ADMIN` |
| 密码 | `RdManager2026!` |

首次登录必须修改密码。生产环境（`NODE_ENV=prod`）必须在 `backend/.env` 设置至少 32 位的随机高熵 `JWT_ACCESS_SECRET` 并修改 `DEFAULT_ADMIN_PASSWORD`；继续使用默认密码时后端会拒绝以生产配置启动。

系统内置：

- `SUPER_ADMIN`：管理全部业务数据、用户、角色、权限、审计和历史归属迁移。
- `EMPLOYEE`：默认仅查看和编辑本人或参与的数据。
- 自定义角色：管理员可在「系统管理 → 角色」按 `SELF`、`INVOLVED`、`DEPARTMENT`、`PROJECT`、`ALL` 配置各权限的数据范围。

Access Token 只保存在前端内存；Refresh Token 通过 HttpOnly Cookie 轮换。可在「设置 → 安全」修改密码、查看会话或退出全部设备。

## 核心功能

- 项目空间：目标、里程碑、任务、进展、风险与问题、会议、资料和计划基线。
- 我的工作与日历：个人待办、截止时间、提醒、稍后处理和日程。
- 员工工作进展：员工档案、周计划/总结 Excel 导入、计划补全、团队和项目周月进展。
- 文档与知识库：本地文件夹扫描、上传文档、统一检索、回收站、来源引用和 NOVA 知识问答。
- 多维表格：项目、任务、会议、文档、风险、合作方和非项目研发数据的表格、看板、日历等视图。
- 数据治理：全局搜索、导入导出、备份恢复、健康检查与审计。

## 员工周计划导入

1. 在「员工 → 员工目录」维护在职员工的姓名、部门与工作方向。
2. 在「员工 → 计划导入」选择周一，下载 V2 Excel 模板。
3. 每个员工工作表上半区填写本周执行，下半区填写下周计划；员工、部门、工作方向和周期必须与模板目录一致。
4. 上传后，在预检补全弹窗中选择工作性质、项目、任务、工时和风险；确认无误后提交。

每项本周工作或下周计划都必须选择「项目工作」或「非项目工作」。项目工作必须关联有效项目；任务可选，但若选择则必须属于该项目。二次导入同一周期会形成新版本，旧版本保留，可从导入历史恢复。

## 知识库与本地文件

- 上传文件由工作台保存原件；本地文件夹扫描只建立索引，源文件不会被移动或删除。
- 未安装 LibreOffice 时，Office 文件仍可下载并参与文本检索，但不保证保真 PDF 预览。
- 本地语义模型需要在知识库页面手动准备，首次下载需要联网；不可用时自动降级为 PostgreSQL 关键词检索。
- AI、短信、外部日历和云盘均为显式配置的可选能力；未配置时系统只使用本地页面和桌面通知。

可通过以下命令检查全新临时数据库能否完成所有迁移。该脚本只创建/删除名称以 `rdmw_verify_` 开头的临时数据库：

```sh
cd backend
pnpm verify:migrations:clean
```

## Electron 桌面端

先构建前后端，再启动或打包桌面壳：

```sh
cd desktop
pnpm install
pnpm dev

# 生成当前平台目录包
pnpm build

# Windows NSIS 安装包（必须在 Windows 原生环境执行）
pnpm dist:windows
```

不要把 macOS 的 `node_modules` 复制到 Windows 包中。Windows 安装包需在 Windows 原生环境重建平台依赖（例如 `@node-rs/argon2`）后再打包；首次启动 PostgreSQL 检测、迁移引导、LibreOffice 与备份工具探测也应在目标平台验收。

## 常用验证命令

```sh
# 前端
cd frontend
pnpm lint
pnpm typecheck
pnpm typecheck:contracts
pnpm test -- --maxWorkers=1
pnpm build

# 后端
cd backend
pnpm lint
pnpm test:unit
pnpm test:integration
pnpm test:e2e
pnpm build

# Electron
cd desktop
pnpm typecheck
pnpm test
```

前端完整测试在资源紧张的机器上推荐使用 `--maxWorkers=1`，以避免并行浏览器/JSDOM 进程占用过高导致的非业务性失败。

## 备份与本地文件约定

- `.env`、`.env.*`、`backend/var/`、依赖目录、构建目录、Electron 发布包、测试报告与本地导出物均被忽略，不会提交到 Git。
- `.env.example` 是可提交的配置模板；请勿将真实数据库连接、JWT 密钥、短信、AI、云盘或日历凭据写入仓库。
- 数据库和附件属于本机业务数据。清理开发缓存前请先自行备份；仓库维护不会删除这些目录。
- 通过常规 PostgreSQL 备份即可同时保存 IAM（用户、角色、权限、会话、审计）与业务数据。恢复后建议重新登录，以刷新会话令牌。

## 故障排查

| 现象 | 处理方式 |
| --- | --- |
| 后端提示 `EADDRINUSE` | 4311 已被占用；停止旧进程或确认当前启动命令使用的是本仓库 `backend/`。 |
| 前端无法读取本地工作台 | 先确认后端已在 `http://127.0.0.1:4311` 启动，随后刷新页面。 |
| Prisma Client 类型缺失 | 在 `backend/` 运行 `pnpm prisma:generate`。 |
| 数据库缺表或迁移不一致 | 在 `backend/` 运行 `pnpm prisma:migrate:deploy`，再重启后端。 |
| Office 文件不能预览 | 安装 LibreOffice 并在 `.env` 设置 `LIBREOFFICE_BIN`；未安装时可下载原文件。 |
| Windows 本地模型不可用 | 在 Windows 原生环境安装/重建运行时依赖后，通过知识库页面重新准备模型。 |

## 贡献约定

开发前先确认当前分支基于最新 `main`，不要提交本机 `.env`、数据库、附件、`node_modules`、构建产物或 Codex/Superpowers 临时文件。功能提交应同时包含必要的迁移、验证和文档更新。
