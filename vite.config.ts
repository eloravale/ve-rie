import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import path from "node:path"

export default defineConfig({
  root: "src/web",
  publicDir: "../../public",
  plugins: [react()],
  build: {
    outDir: "../../dist/web",
    emptyOutDir: true
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src")
    }
  },
  server: {
    host: true,
    port: 5173,
    proxy: {
      "/api": {
        target: process.env.API_ORIGIN || "http://127.0.0.1:8787",
        changeOrigin: false
      }
    }
  }
})
