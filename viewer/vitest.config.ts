import path from "node:path";
import { defineConfig } from "vitest/config";

const projectRoot = path.resolve(__dirname, "..");

export default defineConfig({
  resolve: {
    alias: {
      "@shared": path.resolve(projectRoot, "shared"),
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: {
    include: [
      "../shared/**/*.test.ts",
    ],
  },
});
