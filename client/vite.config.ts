import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import fs from 'fs'
import path from 'path'

const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'package.json'), 'utf-8'))

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  define: {
    '__APP_VERSION__': JSON.stringify(pkg.version),
  },
  server: {
    port: 5173,
    host: '0.0.0.0', // 允许局域网访问（手机调试）
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
    proxy: {
      '/ocr-api': {
        target: 'https://paddleocr.aistudio-app.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/ocr-api/, ''),
        configure: (proxy, _options) => {
          proxy.on('error', (err, _req, _res) => {
            console.log('proxy error', err);
          });
          proxy.on('proxyReq', (proxyReq, req, _res) => {
            // 强制移除 Origin 和 Referer，防止百度服务器返回 403
            proxyReq.removeHeader('Origin');
            proxyReq.removeHeader('Referer');
          });
          proxy.on('proxyRes', (proxyRes, req, _res) => {
            console.log('Received Response from the Target:', proxyRes.statusCode, req.url);
          });
        },
      },
      '/ocr-storage': {
        target: 'https://paddleocr-store-2.bj.bcebos.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/ocr-storage/, ''),
        configure: (proxy, _options) => {
          proxy.on('proxyReq', (proxyReq, req) => {
            console.log(`[ViteProxy] 转发存储请求: ${req.url}`);
            proxyReq.removeHeader('Origin');
            proxyReq.removeHeader('Referer');
          });
          proxy.on('proxyRes', (proxyRes, req) => {
            console.log(`[ViteProxy] 存储响应: ${proxyRes.statusCode} ${req.url}`);
          });
        },
      }
    }
  },
  optimizeDeps: {
    exclude: ['@sqlite.org/sqlite-wasm'],
  },
})