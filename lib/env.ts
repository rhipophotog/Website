import { z } from "zod";

/**
 * Environment, validated once with Zod. Secrets only ever come from here (CLAUDE.md).
 * APP_ENV, not NODE_ENV, decides whether real email/SMS can be sent: a production
 * build running locally is still `development` unless APP_ENV says otherwise.
 */

export const appEnvSchema = z.enum(["development", "test", "production"]);
export type AppEnv = z.infer<typeof appEnvSchema>;

const flag = z
  .enum(["true", "false"])
  .default("false")
  .transform((v) => v === "true");

export const publicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  NEXT_PUBLIC_GOOGLE_AUTH_ENABLED: flag,
});

export const serverEnvSchema = publicEnvSchema.extend({
  APP_ENV: appEnvSchema.default("development"),
  STUDIO_TIME_ZONE: z.string().default("America/Los_Angeles"),
  // Only needed by admin scripts (owner bootstrap). Never sent to the browser.
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
});

export type PublicEnv = z.infer<typeof publicEnvSchema>;
export type ServerEnv = z.infer<typeof serverEnvSchema>;

function format(error: z.ZodError) {
  return error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n");
}

export function parseServerEnv(source: Record<string, string | undefined>): ServerEnv {
  const result = serverEnvSchema.safeParse(source);
  if (!result.success) {
    throw new Error(`Invalid environment variables:\n${format(result.error)}`);
  }
  return result.data;
}

let cached: ServerEnv | undefined;

export function serverEnv(): ServerEnv {
  if (typeof window !== "undefined") {
    throw new Error("serverEnv() must not be called in the browser");
  }
  cached ??= parseServerEnv(process.env);
  return cached;
}

/**
 * Public values must be referenced as literal `process.env.NEXT_PUBLIC_*` so Next.js
 * can inline them into the browser bundle.
 */
export function publicEnv(): PublicEnv {
  const result = publicEnvSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    NEXT_PUBLIC_GOOGLE_AUTH_ENABLED: process.env.NEXT_PUBLIC_GOOGLE_AUTH_ENABLED,
  });
  if (!result.success) {
    throw new Error(`Invalid public environment variables:\n${format(result.error)}`);
  }
  return result.data;
}
