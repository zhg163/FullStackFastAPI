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
    hmr: {
      port: 5173,
      host: "0.0.0.0",
    },
    proxy: {
      "^/api/.*": {
        target: "http://localhost:8000",
        changeOrigin: true,
        secure: false,
        ws: true,
      },
    },
  },
})
