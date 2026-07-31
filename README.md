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

## 企业认证与权限

本版本已启用企业级账号、角色与权限体系。首次启动且数据库中没有任何用户时，系统会自动创建一个默认超级管理员；登录后即可在「系统管理」中创建其他用户、角色和权限。

### 首次启动（默认超级管理员）

1. 启动后端并确保 PostgreSQL 可连接：`cd backend && pnpm prisma:migrate:deploy && pnpm start:dev`。
2. 打开前端 `http://127.0.0.1:4312/#/`，使用默认账号登录：
   - 账号：`admin`
   - 工号：`ADMIN`
   - 密码：`RdManager2026!`
3. 首次登录必须修改默认密码；修改完成后进入工作台。
4. 进入「系统管理 → 账号 / 角色 / 权限」创建其他用户并分配权限。

默认账号密码可在 `backend/.env` 中通过 `DEFAULT_ADMIN_USERNAME` 和 `DEFAULT_ADMIN_PASSWORD` 修改；生产环境必须修改默认密码，否则后端启动会失败。

### 登录、改密与会话

- 登录支持账号或工号；连续失败 5 次后账号锁定 15 分钟。
- Access Token 保存在前端内存中，Refresh Token 通过 HttpOnly Cookie 由后端管理并逐次轮换。
- 个人安全页（`/#/settings/security`）可修改密码、查看当前会话并强制退出全部设备。
- 账号被管理员停用或会话被撤销后，客户端会立即收到通知并返回登录页。

### 角色与权限

- 系统内置 `SUPER_ADMIN`（全部功能和数据）、`EMPLOYEE`（本人及参与数据）。
- 管理员可在「系统管理 → 角色」创建自定义角色，为每个权限选择数据范围：`SELF`（仅自己）、`INVOLVED`（参与）、`DEPARTMENT`（部门）、`PROJECT`（项目）、`ALL`（全部）。
- 系统内置角色不可编辑或删除；删除正在使用的角色会返回 409。

### 用户管理

- 「系统管理 → 账号」创建账号时必须绑定一个在职员工档案；账号与员工档案一一对应。
- 可停用/启用账号、重置密码、强制退出全部设备、永久删除账号。
- 永久删除前必须先停用账号、撤销全部会话，并确认无未处理的数据归属引用。

### 历史数据归属迁移

- 启用普通员工登录前，管理员需先完成「系统管理 → 归属迁移」。
- 系统会分析 Project、Milestone、WorkTask、Risk、Issue、MeetingAction、ApplicationCase、NonProjectRdItem 八类业务对象的历史归属人。
- 精确匹配和唯一姓名匹配的记录可直接应用；模糊或缺失记录会归到首个超级管理员并标记待复核。
- 待复核记录可批量分配给真实用户；全部处理完成后点击「完成迁移」，普通用户方可登录。

### 安全审计

- 「系统管理 → 安全审计」记录登录成功/失败、密码修改、越权拦截、用户/角色变更、会话撤销等事件。
- 审计不保存密码、令牌原文或数据库 URL。

### 备份 IAM 数据

- IAM 表（`users`、`roles`、`permissions`、`user_roles`、`role_permissions`、`auth_sessions`、`login_audits`）与业务数据在同一 PostgreSQL 库中。
- 使用常规备份命令即可同时备份 IAM 与业务数据；恢复后建议重新登录以刷新令牌。

## 运维与故障恢复

### JWT 密钥轮换

1. 更新 `backend/.env` 中的 `JWT_SECRET` 与 `JWT_REFRESH_SECRET`。
2. 重启后端服务。
3. 旧 Access Token 会在过期后自然失效；如需立即让某用户全部会话失效，管理员可在「系统管理 → 账号」中对该用户执行「强制退出全部设备」。

### 最后一位管理员被锁定

若唯一超级管理员账号被锁定且无法登录，需使用数据库管理员连接直接解锁：

```sql
UPDATE "app"."users"
SET "failed_login_count" = 0,
    "locked_until" = NULL,
    "status" = 'ACTIVE'
WHERE "username" = '你的管理员账号';
```

若同时忘记密码，需由具备数据库访问权限的运维人员在该表中写入一个新的 Argon2id 哈希并设置 `must_change_password = true`，强制下次登录改密。系统不保留明文密码，也没有后门重置接口。

### 历史归属迁移未完成时禁止普通登录

在「系统管理 → 归属迁移」全部处理完成前，普通员工账号即使存在也不应开放登录；迁移完成前登录会因全局迁移状态检查被拒绝。

## Windows 与 Electron 边界

- macOS 本机只能验证脚本、类型、单测和 macOS 目录包；Windows 安装包必须由仓库 Windows runner 原生重建 `@node-rs/argon2` 等平台依赖后生成 NSIS，不能把 macOS 的 `node_modules` 直接复制到 Windows 包中。
- Electron 正式包通过 preload 注入运行时 API 基址，前端代码不能依赖 `import.meta.env.DEV` 或相对空字符串构造请求；否则在 `file://` 或 `app://` 协议下会请求错误地址。
- HttpOnly Refresh Cookie 在 Electron 中由 `electron-fetch`/`net` 模块或浏览器 Cookie API 管理；打包后应验证登录、刷新、退出smoke通过。
- Windows 实机安装、首次启动 PostgreSQL 检测/迁移引导、LibreOffice 与 `pg_dump`/`pg_restore` 探测仍由 CI runner 和实机验收覆盖，本机开发环境不伪造这些结果。

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
