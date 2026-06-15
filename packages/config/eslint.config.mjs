import { config as baseConfig } from "@repo/eslint-config/base";

/** @type {import("eslint").Linter.Config[]} */
export default [
  ...baseConfig,
  {
    files: ["src/**/*.{ts,tsx,js,mjs,cjs}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: ["apps/*", "apps/**"], message: "@repo/config must stay leaf-only." },
            { group: ["infra/*", "infra/**"], message: "@repo/config must stay leaf-only." },
            { group: ["services/*", "services/**"], message: "@repo/config must stay leaf-only." },
            { group: ["@repo/db", "@repo/db/*"], message: "@repo/config cannot depend on @repo/db." },
          ],
        },
      ],
    },
  },
];
