import nextVitals from "eslint-config-next/core-web-vitals.js";

const config = [
  ...nextVitals,
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

export default config;
