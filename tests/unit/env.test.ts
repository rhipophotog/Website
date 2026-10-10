import { describe, expect, it } from "vitest";
import { parseServerEnv } from "@/lib/env";

const base = {
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
};

describe("parseServerEnv", () => {
  it("defaults to development, never production", () => {
    const env = parseServerEnv(base);
    expect(env.APP_ENV).toBe("development");
    expect(env.STUDIO_TIME_ZONE).toBe("America/Los_Angeles");
    expect(env.NEXT_PUBLIC_GOOGLE_AUTH_ENABLED).toBe(false);
  });

  it("accepts production only when spelled out", () => {
    expect(parseServerEnv({ ...base, APP_ENV: "production" }).APP_ENV).toBe("production");
    expect(() => parseServerEnv({ ...base, APP_ENV: "prod" })).toThrow(/APP_ENV/);
  });

  it("names every missing variable", () => {
    expect(() => parseServerEnv({})).toThrow(/NEXT_PUBLIC_SUPABASE_URL[\s\S]*NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/);
  });

  it("parses the Google flag", () => {
    expect(parseServerEnv({ ...base, NEXT_PUBLIC_GOOGLE_AUTH_ENABLED: "true" }).NEXT_PUBLIC_GOOGLE_AUTH_ENABLED).toBe(true);
  });
});
