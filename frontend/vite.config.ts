import path from "node:path"
import { TanStackRouterVite } from "@tanstack/router-vite-plugin"
import react from "@vitejs/plugin-react-swc"
import { defineConfig, loadEnv } from "vite"

// https://vitejs.dev/config/
export default defineConfig(({ command, mode }) => {
  // 加载环境变量
  const env = loadEnv(mode, process.cwd(), '')
  
  // 确定API URL
  const apiUrl = env.VITE_API_URL || 'http://localhost:8000'
  
  // 确定HMR主机 - 优先使用环境变量，否则使用localhost
  const hmrHost = env.VITE_HMR_HOST || 'localhost'
  const hmrPort = parseInt(env.VITE_HMR_PORT || '5173')
  
  // 是否为生产环境
  const isProd = mode === 'production' || command === 'build'
  
  return {
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    plugins: [react(), TanStackRouterVite()],
    define: {
      // 确保环境变量在客户端可用
      'import.meta.env.VITE_API_URL': JSON.stringify(env.VITE_API_URL || 'http://8.149.132.119:8000'),
    },
    server: {
      host: "0.0.0.0",
      port: 5173,
      strictPort: true,
      cors: true,
      // 针对阿里云服务器优化
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      },
      // 明确允许的网络接口
      allowedHosts: [
        "localhost",
        "127.0.0.1",
        "0.0.0.0",
        "172.23.57.43",
        "172.18.0.1",
        "172.17.0.1",
        "8.149.132.119", // 阿里云外部IP
        "192.168.2.201"
      ],
      // 只在开发环境启用HMR
      hmr: isProd ? false : {
        port: hmrPort,
        host: hmrHost,
        // 支持多个客户端连接
        clientPort: hmrPort,
      },
      proxy: {
        "^/api/.*": {
          target: apiUrl,
          changeOrigin: true,
          secure: false,
          ws: true,
          // 阿里云服务器优化
          timeout: 60000,
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
    // 构建优化配置
    build: {
      // 针对阿里云服务器优化
      minify: 'esbuild',
      sourcemap: false,
      rollupOptions: {
        output: {
          // 禁用代码分割，避免网络传输问题
          manualChunks: undefined,
        }
      },
      // 增加构建内存限制
      chunkSizeWarningLimit: 1000,
    }
  }
})