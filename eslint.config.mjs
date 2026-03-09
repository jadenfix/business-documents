import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FlatCompat } from "@eslint/eslintrc";
import nextVitals from "eslint-config-next/core-web-vitals.js";

const compat = new FlatCompat({
  baseDirectory: dirname(fileURLToPath(import.meta.url)),
});

export default [
  ...compat.config(nextVitals),
  {
    ignores: [
      ".next/**",
      "coverage/**",
      "drizzle/**",
      "node_modules/**",
      "playwright-report/**",
      "test-results/**",
    ],
  },
];
