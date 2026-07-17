# backend-core-platform 微服务化改造计划

## 目标

把当前 NestJS 模块化单体改造成真正的任务型微服务架构，并完整迁移 `paper-excel-ocr` 后端能力。

## 当前状态

- 当前状态：微服务化生产化闭环已完成，`paper-excel-ocr` 后端 auth/OCR/Excel/hairstyle 能力已迁入 API Gateway + OCR Worker
- 当前阶段：阶段 6 - 验证与回归已完成
- 目标架构：API Gateway + Redis/BullMQ 队列 + OCR Worker + shared contracts + Postgres job/file persistence + local/S3 storage adapter + ops endpoints
- 兼容要求：现有 `backend-core-platform` 接口路径、响应语义和测试必须保持不变

## 阶段清单

### 阶段 1：架构方案确认

- 状态：complete
- 产物：详细迁移方案、风险清单、实施边界
- 验收：用户确认是否采用 BullMQ/Redis 任务型微服务架构

### 阶段 2：框架级微服务基础设施

- 状态：complete
- 内容：
  - 引入 BullMQ/Redis 依赖
  - 增加多 app 启动结构
  - 保留现有 API Gateway 入口
  - 新增 OCR Worker 启动入口
  - 增加统一 job contract

### 阶段 3：任务状态与文件存储基础设施

- 状态：complete
- 内容：
  - 新增 Prisma job/file models
  - 新增 Prisma job/file repository，生产或配置 `DATABASE_URL` 时持久化任务状态
  - 测试或无数据库时自动降级内存实现
  - 新增本地文件存储 adapter
  - 预留 S3/OSS/MinIO adapter interface
  - 增加任务状态查询与 `/api/files/:fileId/download` 结果下载边界

### 阶段 4：迁移 paper-excel-ocr 后端能力

- 状态：complete
- 内容：
  - 迁移 paper auth 登录、刷新 token、登出、me、管理员用户管理接口
  - 迁移百度 OCR 服务，并补齐 table、handwriting、rotate retry、general、Claude Vision fallback 链路
  - 迁移 Excel 生成服务
  - 迁移发型变换服务
  - 迁移发型样式列表接口
  - 改造成 worker processors

### 阶段 5：API Gateway 任务接口与旧接口兼容层

- 状态：complete
- 内容：
  - 新增任务接口
  - 保留旧同步接口兼容：`/api/recognize`、`/api/export`、`/api/export-batch`、`/api/hairstyle/transform`
  - 对慢任务返回 `202 + jobId`
  - 不影响现有平台、IAM、审计、health、mock 接口

### 阶段 6：验证与回归

- 状态：complete
- 内容：
  - 现有 unit/integration/e2e 全跑
  - 新增 worker 单测
  - 新增 gateway 集成测试
  - 本地 Postgres + Redis + API + Worker 联调

### 阶段 7：生产化补齐

- 状态：complete
- 内容：
  - 新增正式 Prisma migration，并验证 `prisma migrate deploy` 可在全新临时数据库执行
  - 新增 Dockerfile、`.dockerignore`、完整 docker-compose 服务编排
  - docker-compose 覆盖 API、OCR Worker、migrate、Postgres、Redis、MinIO、MinIO bucket 初始化
  - 新增 S3/MinIO 兼容存储 adapter，`STORAGE_DRIVER=local|s3` 可切换
  - 新增队列运维接口与轻量 dashboard
  - 新增 `/api/health/live`、`/api/health/ready` 和 `/api/system/metrics`
  - Worker 失败路径输出结构化错误日志，OCR provider 错误码稳定化

## 不做事项

- 不把 OCR 逻辑塞进现有单体模块里
- 不改现有租户、用户、角色、审计接口路径
- 不升级 Nest/Prisma/TypeScript 主版本
- 第一版不引入 Kafka/RabbitMQ
- 第一版不强制上对象存储，先用可替换的 local storage adapter
