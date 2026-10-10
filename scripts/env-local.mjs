// Writes .env.local from the running local Supabase stack (`npx supabase start`).
import { execFileSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";

if (existsSync(".env.local") && !process.argv.includes("--force")) {
  console.error(".env.local already exists. Re-run with --force to overwrite it.");
  process.exit(1);
}

const out = execFileSync("npx", ["supabase", "status", "-o", "env"], { encoding: "utf8" });
const status = Object.fromEntries(
  out
    .split("\n")
    .map((line) => line.match(/^([A-Z_]+)="?(.*?)"?$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2]]),
);

const lines = [
  "APP_ENV=development",
  "STUDIO_TIME_ZONE=America/Los_Angeles",
  `NEXT_PUBLIC_SUPABASE_URL=${status.API_URL}`,
  `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=${status.PUBLISHABLE_KEY ?? status.ANON_KEY}`,
  `SUPABASE_SERVICE_ROLE_KEY=${status.SECRET_KEY ?? status.SERVICE_ROLE_KEY}`,
  "NEXT_PUBLIC_GOOGLE_AUTH_ENABLED=false",
  `TEST_DATABASE_URL=${status.DB_URL}`,
];
writeFileSync(".env.local", `${lines.join("\n")}\n`);
console.log("Wrote .env.local");
