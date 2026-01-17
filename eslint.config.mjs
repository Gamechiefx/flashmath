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
    // Ignore all test files completely
    "tests/**",
  ]),
  {
    rules: {
      // Allow variables prefixed with underscore to be unused (common pattern for intentionally unused vars)
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          "argsIgnorePattern": "^_",
          "varsIgnorePattern": "^_",
          "caughtErrorsIgnorePattern": "^_"
        }
      ],
    },
  },
]);

export default eslintConfig;
