import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    include: ["shared/**/*.{test,spec}.{ts,tsx}"],
    root: ".",
  },
  resolve: {
    alias: {
      "@shared": path.resolve(__dirname, "shared"),
    },
  },
});
