import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * Test database helpers. Creates a throwaway database on TEST_DATABASE_URL, applies the
 * Supabase auth shim (only if needed) and every migration, then runs SQL as a given user
 * the same way PostgREST does: `set role authenticated` + `request.jwt.claims`.
 * Uses the psql CLI so the tests need no extra npm dependencies.
 */

const ROOT = path.resolve(import.meta.dirname, "../..");
const ADMIN_URL = process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

export class SqlError extends Error {}

function psql(url: string, sql: string): string {
  try {
    return execFileSync("psql", [url, "-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1"], {
      input: sql,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
  } catch (error) {
    const stderr = (error as { stderr?: string }).stderr ?? String(error);
    throw new SqlError(stderr.trim());
  }
}

function withDatabase(url: string, name: string): string {
  const u = new URL(url);
  u.pathname = `/${name}`;
  return u.toString();
}

export type TestDb = {
  url: string;
  /** Run SQL as the database superuser (bypasses RLS). Returns raw output. */
  admin(sql: string): string;
  /** Run SQL as a signed-in user (`userId`) or as anon (`null`). Returns raw output of the last statement. */
  as(userId: string | null, sql: string): string;
  /** Like `as`, but wraps a SELECT and returns its rows as JSON. */
  rows<T = Record<string, unknown>>(userId: string | null, select: string): T[];
  /** Create an auth user the way GoTrue does (fires the invite trigger). */
  signUp(email: string): string;
  drop(): void;
};

export function createTestDb(): TestDb {
  const name = `rhipo_test_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
  psql(ADMIN_URL, `create database ${name};`);
  const url = withDatabase(ADMIN_URL, name);

  const hasAuth = psql(url, "select exists (select 1 from pg_namespace where nspname = 'auth');") === "t";
  if (!hasAuth) psql(url, readFileSync(path.join(ROOT, "tests/db/supabase-auth-shim.sql"), "utf8"));

  const migrationsDir = path.join(ROOT, "supabase/migrations");
  for (const file of readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort()) {
    psql(url, readFileSync(path.join(migrationsDir, file), "utf8"));
  }

  const as = (userId: string | null, sql: string) => {
    const claims = userId ? JSON.stringify({ sub: userId, role: "authenticated" }) : JSON.stringify({ role: "anon" });
    const role = userId ? "authenticated" : "anon";
    return psql(url, `set role ${role};\nselect set_config('request.jwt.claims', '${claims}', false);\n${sql}`)
      .split("\n")
      .slice(1) // drop set_config's output line
      .join("\n")
      .trim();
  };

  return {
    url,
    admin: (sql) => psql(url, sql),
    as,
    rows<T>(userId: string | null, select: string): T[] {
      const out = as(userId, `select coalesce(json_agg(t), '[]'::json) from (${select}) t;`);
      return JSON.parse(out) as T[];
    },
    signUp(email) {
      return psql(url, `insert into auth.users (id, email, raw_user_meta_data) values (gen_random_uuid(), '${email}', '{}') returning id;`);
    },
    drop() {
      psql(ADMIN_URL, `drop database if exists ${name} with (force);`);
    },
  };
}
