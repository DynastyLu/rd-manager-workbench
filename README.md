# 研发主管本地工作台

此仓库直接迁入并保留两个真实工程：

- `frontend/`：基于 treasure-box 的 Vite、React 和 TypeScript 前端工程。
- `backend/`：基于 backend-core-platform 的 NestJS、Prisma 和 PostgreSQL 后端工程。

二者均是独立项目，各自维护自己的 `package.json`、锁文件、配置和命令；根目录不是 pnpm workspace。

## 前端

前端开发地址固定为 `http://127.0.0.1:4312/#/`。

```sh
cd frontend
cp .env.example .env
pnpm install
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
pnpm dev
```

前端仅监听 `http://127.0.0.1:4312/#/`，端口被占用时会直接报错；开发环境默认请求后端 `http://127.0.0.1:4311/api`。

## 后端

后端默认地址固定为 `http://127.0.0.1:4311`；前端后续接入 API 时使用 `http://127.0.0.1:4311/api`。

先从 `backend/.env.example` 创建本地环境文件并按本机 PostgreSQL 配置 `DATABASE_URL`，再运行：

```sh
cd backend
cp .env.example .env
pnpm install
pnpm prisma:generate
pnpm test:unit
pnpm test:integration
pnpm test:e2e
pnpm lint
pnpm build
pnpm start:dev
```

后端仅监听 `http://127.0.0.1:4311`。两个端口均与旧项目的默认端口隔离，不会自动切换到其他端口。

可用 `pnpm prisma migrate status` 检查本地数据库迁移状态。

### 文件型知识库运行依赖

- PostgreSQL 账号需要能够安装 `vector` 与 `pg_trgm` 扩展；数据库迁移会在首次使用前自动执行 `CREATE EXTENSION IF NOT EXISTS`。
- Office 原格式预览依赖本机 LibreOffice（headless）；没有安装时仍可下载原文件，文本提取与关键词检索不受影响。
- 本地语义模型需要在知识库页面显式点击准备，首次下载需要联网；未准备或下载失败时系统自动使用 PostgreSQL 关键词检索。
- 上传文件由工作台托管原件，本地目录文件保留在原位置；两类文件都进入统一搜索和 AI 问答索引。

可用以下命令验证一个全新的临时数据库能否从零完成迁移；脚本只会创建并删除名称以 `rdmw_verify_` 开头的临时数据库：

```sh
cd backend
pnpm verify:migrations:clean
```

如果普通应用账号没有创建临时数据库的权限，可通过 `DATABASE_ADMIN_URL` 单独提供本机管理连接；业务迁移仍使用生成的临时数据库连接。

## 员工工作进展

员工工作区位于 `http://127.0.0.1:4312/#/employees`，包含团队概览、员工目录、工作明细和计划导入四个页签；员工详情页为 `/#/employees/:id`，项目空间「进展」页签内嵌当前周团队进展，双向可穿透。

### 标准模板导入流程

1. 「计划导入」页签 → 导入工作计划 → 下载导入模板（`.xlsx`，含「说明」「工作明细」两张表）。
2. 在「说明」表填写周期开始（必须为周一）与周期结束（必须为对应周日）；在「工作明细」表一行一条工作。
3. 上传后系统自动识别模板版本与周期并预检；存在错误行或待关联行时**确认导入保持禁用**，可在向导内逐行人工关联员工/项目/任务，或修正源文件后重新上传。
4. 预检全部通过后确认导入并二次确认替换，提交成功生成该周期的新版本。

「工作明细」共 13 列：员工姓名*、工作内容*、本期计划、本期完成情况、完成度（0–100 整数或百分比）、工作状态*（未开始/进行中/已完成/有风险/已阻塞）、下期计划、风险与阻塞、计划工时、实际工时、项目编号、任务编号、备注（* 为必填）。

员工姓名必须**精确匹配**在职员工（已有资源档案会被复用，姓名全局唯一）；项目编号、任务编号必须精确匹配系统中存在的编码，任务还必须属于对应项目。未知员工或无效项目/任务引用会进入待关联状态并阻止提交。

### 版本替换、快照与下载

- 同一周期再次提交会生成新版本（v1、v2…），旧版本标记为「已被替换」并保留在导入历史中，可通过「恢复此版本」基于历史版本创建新的当前版本；重复提交同一批次是幂等的。
- 周期替换只更新导入产生的资源负荷记录，手工维护的负荷记录不受影响。
- 提交后团队/员工/项目的周、月进展快照在后台生成；快照失败时可在导入历史行内「重建快照」。月视图会对缺少已提交数据的周显示缺失警告；无分母的百分比显示为「暂无数据」。
- 导入历史每行提供「下载源文件」与「下载错误行」（仅存在错误时）。
- 工作明细页可按当前筛选导出 Excel；有风险说明且已关联项目的工作项可在员工详情页一键「转为项目风险」，重复转换幂等且保留原工作项。

### 启动与迁移命令

```sh
cd backend
pnpm prisma:migrate:deploy   # 应用数据库迁移（含员工进展与任务编码回填）
pnpm prisma:generate         # 生成 Prisma Client
pnpm start:dev               # 监听 http://127.0.0.1:4311

cd frontend
pnpm dev                     # 监听 http://127.0.0.1:4312
pnpm test:e2e                # Chromium 端到端验收（需后端已启动）
```

员工端到端验收用例为 `frontend/e2e/employee-work-progress.spec.ts`，它在运行时按当前周动态生成有效/无效两个工作簿（结构对齐后端导入模板），因此任意日期运行均可通过。`backend/test/fixtures/` 下的提交版工作簿保留给后端侧使用，可用 `pnpm exec tsx test/fixtures/generate-employee-fixtures.ts`（在 `backend/` 下）重新生成。

## 本地文件

根目录及两个项目的 `.env`、`.env.*` 本地环境文件均被忽略，`.env.example` 不受忽略规则影响，仍可提交。当前可用模板为 `frontend/.env.example` 与 `backend/.env.example`；请不要提交真实凭据。根 `.worktrees/`、两个项目的 `node_modules/`、构建与测试产物及运行时数据也均被忽略。
