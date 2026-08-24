# RN-Admin

RN 项目的独立 Web 管理前端。它不参与移动端构建和升级，由插件注册机制装配发布管理、应用配置、审计等模块；同一个管理端可以接入多个 RN-Server 实例。

## 本地运行

```bash
cp .env.example .env.local
pnpm install
pnpm dev
```

先启动相邻的 RN-Server。默认访问 `http://localhost:5173`。

当前实现通过 RN-Server 登录并使用 HttpOnly 会话，浏览器构建不包含长期管理密钥。发布、审计和移动配置由 MySQL 持久化。当前阶段不加入 RBAC 与双人审批；对象存储、真实 artifact 校验、HTTPS 和 telemetry provider 仍需后续接入。

## 目录

- `src/plugin-system`：可插拔模块注册协议；
- `src/modules/release-management`：发布总览、发布列表和状态动作；
- `src/modules/app-config`：启动配置、国际化、主题与升级策略编辑；
- `src/modules/audit`：发布操作审计；
- `src/design-system`：后台设计令牌和基础组件。
