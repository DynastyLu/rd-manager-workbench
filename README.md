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

1. 先在「员工目录」维护在职员工的姓名、部门和工作方向；模板会以这些档案动态生成员工目录和每人一张工作表。
2. 「计划导入」页签 → 导入工作计划 → 选择周一并下载 V2 模板（`.xlsx`）。公开下载只提供 V2；历史 V1 文件仍可上传解析。
3. 每个员工工作表上半区填写本周工作，下半区填写下周计划。员工姓名、部门、工作方向和周区间必须与模板目录一致，不能修改成其他人员或混用不同周。
4. 上传后系统自动识别 V1/V2 并预检。V2 使用一个表格弹窗集中补充工作性质、项目、任务、工时和风险决定；支持按工作表、区域和选中行批量设置。
5. 预检全部通过后确认导入并二次确认替换，提交成功生成该周期的新版本。

本周工作字段为：本周工作内容、具体任务/预期交付、计划完成日期、状态、完成进度、本周成果/问题、下周计划。下周计划字段为：下周重点工作、具体任务/预期交付、计划完成日期、优先级、所需协作/资源、计划说明、备注。Excel 序号、填写提示和自动汇总不是业务数据。

每条本周工作和下周计划都必须明确选择「项目工作」或「非项目工作」。项目工作必须选择有效项目，任务可选但必须属于该项目；非项目工作会清空项目和任务。计划工时、实际工时为系统补充字段，不在 Excel V2 模板中强制填写。员工姓名必须精确匹配在职员工；管理员可以在补全步骤确认新建档案或更新部门/工作方向。

导入后员工详情分为「本周执行」和「下周计划」：未来计划不参与本周完成率。计划支持修改系统关联、取消、承接到实际工作、撤销承接和转为项目任务；原 Excel 业务文本保持只读，并显示“工作表 / 区域 / 原始行号”来源。

### 版本替换、快照与下载

- 同一周期再次提交会生成新版本（v1、v2…），旧版本标记为「已被替换」并保留在导入历史中，可通过「恢复此版本」基于历史版本创建新的当前版本；重复提交同一批次是幂等的。
- 周期替换只更新导入产生的本周工作、下周计划和资源负荷记录，手工维护的负荷记录不受影响。
- 提交后团队/员工/项目的周、月进展快照在后台生成；本周完成率只统计执行事项，下周计划单独统计优先级、协作需求和未承接数量。缺失工时单独显示完整度，不会按 `0` 小时参与利用率。
- 导入历史每行提供「下载源文件」与「下载错误行」（仅存在错误时）。
- 工作明细页可按当前筛选导出 Excel/CSV，包含 V2 业务字段、系统关联和来源坐标。项目工作风险和非项目员工风险均可幂等转换。
- 下周计划日期可作为页面与 Socket 提醒候选；默认不启用短信，短信仍需在设置中显式配置和确认。

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

Windows 和 macOS 首次拉取代码后都必须先执行 `pnpm prisma:migrate:deploy` 和 `pnpm prisma:generate`，否则 V2 表和 Prisma Client 会不一致。PostgreSQL 数据库需启用项目现有迁移；模板生成与解析不依赖 Microsoft Office 或 LibreOffice。

员工端到端验收用例为 `frontend/e2e/employee-work-progress.spec.ts`；后端真实数据库 V2 验收用例为 `backend/test/integration/modules/workbench/employee-weekly-workbook-v2.spec.ts`。匿名工作簿夹具可在 `backend/` 下通过 `pnpm exec tsx test/fixtures/generate-employee-fixtures.ts` 重新生成，不使用真实员工姓名或用户提供的源文件。

## 本地文件

根目录及两个项目的 `.env`、`.env.*` 本地环境文件均被忽略，`.env.example` 不受忽略规则影响，仍可提交。当前可用模板为 `frontend/.env.example` 与 `backend/.env.example`；请不要提交真实凭据。根 `.worktrees/`、两个项目的 `node_modules/`、构建与测试产物及运行时数据也均被忽略。
