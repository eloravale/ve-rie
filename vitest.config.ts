import { defineConfig } from "vitest/config"
import path from "node:path"

export default defineConfig({
  root: path.resolve(__dirname),
  ssr: {
    external: ["node:sqlite", "sqlite"]
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    testTimeout: 30000,
    pool: "forks"
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src")
    }
  }
})
