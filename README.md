# RN-Admin

RN 项目的独立 Web 管理前端。它不参与移动端构建和升级，由插件注册机制装配发布管理、应用配置、审计等模块；同一个管理端可以接入多个 RN-Server 实例。

## 本地运行

```bash
cp .env.example .env.local
pnpm install
pnpm dev
```

先启动相邻的 RN-Server。默认访问 `http://localhost:5173`。

当前实现通过 RN-Server 登录并使用 HttpOnly 会话，浏览器构建不包含长期管理密钥。管理员可显式切换租户，独立维护 S3/R2/MinIO 配置、Android package 与签名指纹；APK 直传对象存储后由服务端校验，再创建 Direct Release。发布、审计、移动配置和 Artifact 元数据由 MySQL 持久化，生产环境通过 Caddy 提供 HTTPS。当前阶段不加入 RBAC 与双人审批；telemetry provider 仍需后续接入。

## 目录

- `src/plugin-system`：可插拔模块注册协议；
- `src/modules/release-management`：发布总览、发布列表和状态动作；
- `src/modules/app-config`：启动配置、国际化、主题与升级策略编辑；
- `src/modules/audit`：发布操作审计；
- `src/modules/distribution-settings`：租户、对象存储、应用身份与 Artifact；
- `src/design-system`：后台设计令牌和基础组件。
