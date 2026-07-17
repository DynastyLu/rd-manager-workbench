# 真实前后端框架直接迁移设计

## 目标

将 `/Users/dynastylu/Desktop/AICode/treasure-box` 与 `/Users/dynastylu/Desktop/AICode/backend-core-platform` 的真实工程代码迁入 `rd-manager-workbench`，在目标副本中清除旧业务，保留并继续使用已有的工程和基础设施能力。不得以自建的简化脚手架替代这两个框架。

## 目录边界

```text
rd-manager-workbench/
  frontend/   # treasure-box 的真实 Vite/React 工程副本
  backend/    # backend-core-platform 的真实 Nest/Prisma 工程副本
  desktop/    # 后续 Electron 外壳，仅负责启动 frontend/backend
  docs/       # 本项目的需求、设计和迁移记录
```

`frontend/` 和 `backend/` 各自保留自己的 `package.json`、锁文件、构建/测试配置、源代码布局及基础工具链。根目录不保留 `pnpm workspace`、`apps/` 或 `packages/` 作为运行时工程结构。

## 迁移规则

1. 源目录是只读输入：迁移前后记录并比对两个源仓库的 Git 状态，不能改动、清理或格式化源目录。
2. 迁移先完整复制可追踪源文件和配置，再只在目标副本中删除旧业务。这保证保留的不是“模仿品”，而是原框架实际代码。
3. 前端保留 Vite、React、TypeScript、Tailwind/shadcn、React Query、Zustand、i18n、错误边界、布局、主题、通用 UI、路由测试和 E2E/Storybook 工具链；删除登录/用户管理、OCR、发型、版权风险、历史工具记录及其 API/mock/测试。
4. 后端保留 Nest 启动链、配置、请求上下文、日志、Prisma、统一异常和响应、健康检查、存储/队列抽象及测试配置；删除租户/IAM、OCR、发型、版权、论文鉴伪、标签 mock、AI mock、旧任务业务及与之耦合的路由/数据模型。
5. 单机第一版不提供登录或多租户。前端路由直接进入研发主管工作台；后端仅监听 loopback，数据库继续使用已经创建的受限本地 PostgreSQL 角色和 `app` schema。
6. 现有 `apps/`、`packages/`、根 workspace 配置是此前错误自建结构；在真实工程副本可以独立运行并通过验证后，从目标根目录移除。需求/设计/进度文档保留在 `docs/`。

## 后续业务落点

前端新业务放在 `frontend/src/modules/workbench` 和 `frontend/src/pages`，接入现有路由、Layout、Query、主题和 UI 组件；后端新业务放在 `backend/src/modules/workbench`，接入现有 Nest 模块、Prisma 和统一 HTTP 管线。两个项目由 `desktop/` 中的 Electron 外壳联调，不再把业务代码塞进桌面主进程。

## 验收

- `frontend` 与 `backend` 都能从各自目录独立安装、类型检查、测试和构建。
- 代码来源可追溯到两个真实模板工程；源仓库的工作树在迁移前后完全一致。
- 目标中没有旧工具业务路径、旧业务路由、旧业务 Prisma model 或旧业务 HTTP controller。
- 本地 PostgreSQL 连接使用唯一受限角色和既有 `app` schema；不执行 `db push`、`migrate reset`、`DROP DATABASE` 或 `DROP ROLE`。
- 新的研发主管工作台路由与后端健康检查在保留框架内运行。
