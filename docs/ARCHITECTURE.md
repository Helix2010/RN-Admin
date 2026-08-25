# RN-Admin 架构与模块接入

## 分层

```text
App Shell (导航、登录态、权限、通知)
  -> Plugin Registry (模块 manifest / routes / navigation)
     -> module pages + api adapter
        -> RN-Server admin API (OpenAPI)
```

模块只能通过 `AdminPlugin` 注册导航和页面，不能修改宿主 shell。请求集中在 `src/core/api.ts`，响应用 Zod 做运行时校验；未来生成 OpenAPI client 时只替换 adapter，不改变页面契约。

## 设计原则

- 亮色默认并支持切换深色、桌面宽屏、信息密度适中；状态、危险动作和灰度比例使用语义色，不直接复制颜色裸值；
- 所有远端页面都表达 loading/error/empty/content；
- 高风险动作要服务端显式确认、reason 和审计，UI 只做最后一次确认提示；当前阶段不加入 RBAC 和双人审批；
- 当前插件机制是编译期源码模块注册，可独立启用或移除，但仍需随宿主重新构建；只有未来形成稳定 SDK、版本兼容和隔离边界后才能升级为运行时安装插件；
- 当前最小门禁使用服务端 HttpOnly 会话，不在前端保存长期凭证；后续可将服务端身份源替换为 OIDC/JWT。

## 接入新插件

1. 创建 `src/modules/<module>`，提供 `plugin.ts`、页面、API schema；
2. 实现 `AdminPlugin` 的 `id`、`navigation`、`pages`；
3. 在 `src/app/App.tsx` 注册；
4. 添加权限声明和 API contract/E2E；
5. 不从其他插件深层导入，跨插件能力上移到 core/design-system。

服务端使用 MySQL 持久化发布、审计、移动配置、租户对象存储版本与 Artifact 元数据。`distribution-settings` 插件提供租户切换、S3/R2/MinIO 配置、连接测试、应用 package/签名身份和 Artifact 校验结果；长期凭证只提交给 RN-Server 加密保存，不会回显。生产上线仍需接入 telemetry，并在目标对象存储上完成真实大文件/CORS E2E；RBAC/审批按后续项目阶段独立接入。
