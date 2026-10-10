import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": import.meta.dirname },
  },
  test: {
    projects: [
      {
        extends: true,
        test: { name: "unit", include: ["tests/unit/**/*.test.ts"], environment: "node" },
      },
      {
        extends: true,
        // Needs Postgres at TEST_DATABASE_URL (the local Supabase DB, or any Postgres 15+).
        test: { name: "db", include: ["tests/db/**/*.test.ts"], environment: "node", testTimeout: 30_000, hookTimeout: 60_000 },
      },
    ],
  },
});
