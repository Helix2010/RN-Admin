# RN-Admin

RN 项目的独立 Web 管理前端。它不参与移动端构建和升级，由插件注册机制装配发布管理、应用配置、审计等模块；同一个管理端可以接入多个 RN-Server 实例。

## 本地运行

```bash
cp .env.example .env.local
pnpm install
pnpm dev
```

先启动相邻的 RN-Server。默认访问 `http://localhost:5173`。

当前实现通过 RN-Server 登录并使用 HttpOnly 会话，浏览器构建不包含长期管理密钥。租户由管理端请求域名自动解析，不再由页面切换或客户端参数决定。发布页将版本、文件对象、校验结果和发布状态统一维护在 `app_releases`：安装包直传对象存储，服务端计算哈希并校验 Android 身份后即可生成官网安装链接。发布、审计和移动配置由 MySQL 持久化，生产环境通过 Caddy 提供 HTTPS。当前阶段不加入 RBAC 与双人审批；telemetry provider 仍需后续接入。

## 目录

- `src/plugin-system`：可插拔模块注册协议；
- `src/modules/release-management`：发布总览、发布列表和状态动作；
- `src/modules/app-config`：启动配置、国际化、主题与升级策略编辑；
- `src/modules/app-config/localization-page.tsx`：动态语言设置、租户文案覆盖、Excel 导入导出与语言资源发布；
- `src/modules/audit`：发布操作审计；
- `src/modules/release-storage`：租户级 S3/R2/MinIO 发布存储配置；
- `src/design-system`：后台设计令牌和基础组件。
