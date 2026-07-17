# backend-core-platform 微服务化调研记录

## 项目现状

- 项目是 NestJS + TypeScript + Prisma + PostgreSQL。
- 当前只有单个 HTTP 启动入口：`src/main.ts`。
- 根模块是 `src/app.module.ts`，包含 config、request context、Prisma、tenant、user、role、audit、health、AI assistant mock。
- `package.json` 当前没有直接声明 `@nestjs/microservices`、BullMQ、Redis 客户端、RabbitMQ 或 Kafka 依赖。
- lockfile 中出现 `@nestjs/microservices` 是 Nest peer dependency 信息，不代表项目已使用微服务。

## 现有接口

- `GET /api/health`
- `POST /api/platform/tenants`
- `GET /api/platform/tenants`
- `POST /api/iam/users`
- `GET /api/iam/users`
- `POST /api/iam/roles`
- `GET /api/iam/roles`
- `POST /api/system/audit/logs`
- `GET /api/system/audit/logs`
- `/sys/...` AI assistant mock 接口不走 `/api` 前缀。

## 约束

- 现有接口不能被破坏。
- 文件下载和二进制响应要避开全局 response interceptor 的 JSON 包装。
- OCR、Excel、图片生成是长任务/外部服务调用，适合队列 worker，不适合纯同步 RPC 作为长期架构。
- 旧 `paper-excel-ocr` 是 Express 后端，迁移时必须重写成 Nest module/service/controller/processor 结构。

## 推荐方向

- 最优第一版：API Gateway + Redis/BullMQ + OCR Worker。
- API Gateway 保持 HTTP、认证、租户、审计、上传入口。
- Worker 负责 OCR、Excel、发型变换等耗时任务。
- Shared contracts 统一 job names、DTO、result shape。
- Storage adapter 统一保存 Excel/图片等输出文件。
