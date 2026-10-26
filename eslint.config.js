// ESLint root config (CodeCity CyberDefense) — Flat Config Format (ESLint 9.x)
// Nutzt @typescript-eslint/parser + @typescript-eslint/eslint-plugin direkt

import eslint from "@eslint/js";
import tseslint from "@typescript-eslint/eslint-plugin";
import parser from "@typescript-eslint/parser";

export default [
  eslint.configs.recommended,
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.turbo/**",
      "**/*.d.ts",
      "**/*.d.ts.map",
      "**/*.js",
      "**/*.js.map",
      "**/vite.config.*",
    ],
  },
  {
    files: ["backend/src/**/*.ts", "backend/tests/**/*.ts"],
    languageOptions: {
      parser,
      globals: {
        // Node.js globals
        process: "readonly",
        console: "writable",
        Buffer: "readonly",
        btoa: "readonly",
        NodeJS: "readonly",
        setTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        clearTimeout: "readonly",
        fetch: "readonly",
        crypto: "readonly",
        /** Global since Node 17; the export tests deep-copy a result with it. */
        structuredClone: "readonly",
        // TypeScript/ESNext
        navigator: "readonly",
      },
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      "@typescript-eslint": tseslint,
    },
    rules: {
      ...eslint.configs.recommended.rules,
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/consistent-type-imports": "error",
    },
  },
  {
    files: [
      "frontend/src/**/*.ts",
      "frontend/src/**/*.tsx",
      "frontend/tests/**/*.ts",
      "frontend/tests/**/*.tsx",
      "backend/tests/**/*.ts",
    ],
    languageOptions: {
      parser,
      globals: {
        // Vitest injects these — the test files do not import them
        describe: "readonly",
        it: "readonly",
        expect: "readonly",
        vi: "readonly",
        beforeEach: "readonly",
        afterEach: "readonly",
        beforeAll: "readonly",
        afterAll: "readonly",
        // Browser globals
        window: "readonly",
        document: "readonly",
        navigator: "readonly",
        localStorage: "readonly",
        fetch: "readonly",
        crypto: "readonly",
        console: "writable",
        setTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        clearTimeout: "readonly",
        alert: "readonly",
        requestAnimationFrame: "readonly",
        cancelAnimationFrame: "readonly",
        // React JSX runtime
        React: "readonly",
        JSX: "readonly",
        // Node.js globals (Vite exposes some)
        process: "readonly",
        Buffer: "readonly",
        btoa: "readonly",
        // TypeScript/ESNext
        AbortController: "readonly",
        AbortSignal: "readonly",
        URL: "readonly",
        URLSearchParams: "readonly",
        ReadableStream: "readonly",
        WritableStream: "readonly",
      },
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      "@typescript-eslint": tseslint,
    },
    rules: {
      ...eslint.configs.recommended.rules,
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/consistent-type-imports": "error",
    },
  },
  {
    // One door for numbers: the UI language, not the browser's locale, decides
    // how a count is grouped. `formatCount(lang, n)` and `formatDecimal(lang, n)`
    // in frontend/src/i18n.ts are those doors; everywhere else a bare
    // toLocaleString() is a locale-blind number waiting to print "5,000" inside
    // a German card. The selector also catches `date.toLocaleString()` — a full
    // datetime should go through the same doors; `toLocaleDateString` and
    // `toLocaleTimeString` stay available, they carry no count.
    files: ["frontend/src/**/*.ts", "frontend/src/**/*.tsx"],
    ignores: ["frontend/src/i18n.ts", "frontend/src/i18n/**"],
    languageOptions: { parser },
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "CallExpression[callee.property.name=/^(toLocaleString|toLocaleFormat)$/]",
          message:
            "Format counts through formatCount(lang, n) from src/i18n.ts so they follow the UI language, not the browser.",
        },
      ],
    },
  },
];
