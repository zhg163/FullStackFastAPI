import path from "node:path"
import { TanStackRouterVite } from "@tanstack/router-vite-plugin"
import react from "@vitejs/plugin-react-swc"
import { defineConfig } from "vite"

// https://vitejs.dev/config/
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  plugins: [react(), TanStackRouterVite()],
  server: {
    host: "0.0.0.0",
    port: 5173,
    strictPort: true,
    cors: true,
    // 明确允许的网络接口
    allowedHosts: [
      "localhost",
      "127.0.0.1",
      "0.0.0.0",
      "172.23.57.43",
      "172.18.0.1",
      "172.17.0.1",
      "8.149.132.119", // 新添加的外部IP
      "192.168.2.201"
    ],
    hmr: {
      port: 5173,
      host: "0.0.0.0",
      // 支持多个客户端连接
      clientPort: 5173,
    },
    proxy: {
      "^/api/.*": {
        target: "http://192.168.2.201:8000",
        changeOrigin: true,
        secure: false,
        ws: true,
        configure: (proxy, _options) => {
          proxy.on('error', (err, _req, _res) => {
            console.log('proxy error', err);
          });
          proxy.on('proxyReq', (proxyReq, req, _res) => {
            console.log('Sending Request to the Target:', req.method, req.url);
          });
          proxy.on('proxyRes', (proxyRes, req, _res) => {
            console.log('Received Response from the Target:', proxyRes.statusCode, req.url);
          });
        },
      },
    },
  },
})
