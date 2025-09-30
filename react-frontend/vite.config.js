import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // 字符串简写写法：http://localhost:5173/api -> http://localhost:8000/api
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        // rewrite: (path) => path.replace(/^\/api/, '') // 可选，根据后端路由是否需要重写
      },
    }
  }
})
