import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  use: {
    baseURL: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
    headless: true
  }
});
