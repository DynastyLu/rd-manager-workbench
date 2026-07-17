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

## 视觉/浏览器发现
- 需求文档共 6 页，包含 13 个表格、完整 P0/P1/P2 优先级和 MVP 验收标准。
- 页图版式完整，但渲染环境缺少相应中文字体，部分中文显示为方框；文字结构提取完整。
