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

/** Cloudflare's documented test keys: always pass. Used until real keys are set. */
export const TURNSTILE_TEST_SITE_KEY = "1x00000000000000000000AA";
export const TURNSTILE_TEST_SECRET_KEY = "1x0000000000000000000000000000000AA";

const optionalSecret = z
  .string()
  .optional()
  .transform((v) => v?.trim() || undefined);

export const publicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  NEXT_PUBLIC_GOOGLE_AUTH_ENABLED: flag,
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: z
    .string()
    .optional()
    .transform((v) => v?.trim() || TURNSTILE_TEST_SITE_KEY),
});

export const serverEnvSchema = publicEnvSchema.extend({
  APP_ENV: appEnvSchema.default("development"),
  STUDIO_TIME_ZONE: z.string().default("America/Los_Angeles"),
  // Server only. Used by the public inquiry form, lead webhooks and admin scripts. Never sent to the browser.
  SUPABASE_SERVICE_ROLE_KEY: optionalSecret,
  TURNSTILE_SECRET_KEY: z
    .string()
    .optional()
    .transform((v) => v?.trim() || TURNSTILE_TEST_SECRET_KEY),
  // Salt for hashing visitor IPs (rate limiting). Any random string.
  LEAD_IP_SALT: z
    .string()
    .optional()
    .transform((v) => v?.trim() || "rhipo-lead-ip"),
  // Meta Lead Ads webhook
  META_APP_SECRET: optionalSecret,
  META_VERIFY_TOKEN: optionalSecret,
  META_PAGE_ACCESS_TOKEN: optionalSecret,
  META_GRAPH_VERSION: z.string().regex(/^v\d+\.\d+$/).default("v23.0"),
  // Google Ads lead form webhook ("key" field in the Google Ads lead form settings)
  GOOGLE_ADS_WEBHOOK_KEY: optionalSecret,
  // Email (milestone 5): Resend
  RESEND_API_KEY: optionalSecret,
  RESEND_WEBHOOK_SECRET: optionalSecret,
  // "RHIPO Photography <hello@yourdomain.com>"
  EMAIL_FROM: optionalSecret,
  // Where client replies go. An address on a Resend receiving domain threads them into the app.
  EMAIL_REPLY_TO: optionalSecret,
  // The owner's own inbox: gets a copy of every client reply and new-lead alerts.
  OWNER_NOTIFY_EMAIL: optionalSecret,
  // Signs unsubscribe links. Falls back to a value derived from the service role key.
  UNSUBSCRIBE_SECRET: optionalSecret,
  // Public base URL for links in emails, e.g. https://crm.yourdomain.com. Vercel's production URL is used if unset.
  APP_URL: optionalSecret,
  VERCEL_PROJECT_PRODUCTION_URL: optionalSecret,
});

/** Base URL for links inside emails (unsubscribe, forms). */
export function appUrl(env: ServerEnv = serverEnv()): string {
  if (env.APP_URL) return env.APP_URL.replace(/\/$/, "");
  if (env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${env.VERCEL_PROJECT_PRODUCTION_URL}`;
  return "http://localhost:3000";
}

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
    NEXT_PUBLIC_TURNSTILE_SITE_KEY: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
  });
  if (!result.success) {
    throw new Error(`Invalid public environment variables:\n${format(result.error)}`);
  }
  return result.data;
}
