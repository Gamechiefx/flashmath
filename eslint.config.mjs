import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Ignore standalone CommonJS server files (legitimate require() usage)
    "server.js",
    "server-redis.js",
    // Ignore utility scripts (CommonJS, run outside Next.js)
    "scripts/**",
    // Ignore test scripts (CommonJS)
    "tests/scripts/**",
    "tests/report-viewer/**",
    // Ignore test artifacts (generated files)
    "tests/**/trace/**",
    "tests/**/playwright-report/**",
    "tests/history/**",
    // Ignore arena test files (complex test infrastructure)
    "tests/arena/**",
  ]),
  // Playwright test fixtures use `use()` for fixture extension, not React's use() hook
  {
    files: ["tests/e2e/fixtures/**/*.ts"],
    rules: {
      "react-hooks/rules-of-hooks": "off",
    },
  },
  // Relax rules for test files - focus on src code quality
  {
    files: ["tests/**/*.ts", "tests/**/*.tsx"],
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": "warn",
      "prefer-const": "warn",
    },
  },
]);

export default eslintConfig;
