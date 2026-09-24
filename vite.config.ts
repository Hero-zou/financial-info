import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

// 自选池 5 日线监控：浏览器直连腾讯接口会被 CORS 拦，dev/preview 各加一层同源代理。
const proxy = {
  '/api/gtimg/kline': {
    target: 'https://web.ifzq.gtimg.cn',
    changeOrigin: true,
    rewrite: (p: string) => p.replace(/^\/api\/gtimg\/kline/, '/appstock/app/fqkline/get'),
  },
}

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  server: { port: 5173, host: true, proxy },
  preview: { port: 4173, host: true, proxy },
})
