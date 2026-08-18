import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  server: { port: 5173, host: true },
  // 沙箱 safe-delete 拦截目录删除（genie-trash 超时），故不自动清空 dist，
  // 改为写覆盖；旧的无用 hash 资源会残留，但 index.html 始终指向最新，无功能影响。
  build: {
    emptyOutDir: false,
    rollupOptions: {
      output: {
        // 注入构建时间戳，保证每次产物文件名唯一，绕开 CloudBase 静态托管 CDN 对同名资源的长缓存
        chunkFileNames: `assets/[name]-[hash]-t${Date.now()}.js`,
        assetFileNames: `assets/[name]-[hash]-t${Date.now()}.[ext]`
      }
    }
  }
})
