import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    // @e965/xlsx 已通过动态 import 隔离，只在多语言 Excel 导入/导出时加载。
    // 当前约 500 KB（gzip 约 163 KB）；主入口和业务页面仍必须低于该门槛。
    chunkSizeWarningLimit: 520,
  },
});
