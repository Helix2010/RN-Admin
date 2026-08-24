# RN-Admin 工程约束

- 模块代码放在 `src/modules/<module>`，通过 `AdminPlugin` 接入宿主；禁止模块之间深层导入。
- 所有服务端数据经 `src/core/api.ts` 和 Zod 运行时校验；页面必须表达 loading/error/empty/content。
- 颜色、间距、圆角和状态样式使用 `src/design-system/tokens.css`，禁止业务页复制裸色值。
- 高风险动作必须由服务端状态机、显式确认、reason 和审计兜底；当前阶段不引入 RBAC 与双人审批，前端确认框仍不是安全边界。
- API 变更必须与 RN-Server OpenAPI 同步；生产登录不得使用开发管理密钥。
- 完成任务前运行 `pnpm check`，未运行的验证必须在交付说明中列明。
