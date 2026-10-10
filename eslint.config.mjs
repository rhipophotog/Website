import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // CLAUDE.md: no direct provider calls outside lib/messaging. Use sendEmail / sendSms.
    ignores: ["lib/messaging/**", "tests/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/lib/messaging/providers", "@/lib/messaging/providers/*", "**/messaging/providers", "**/messaging/providers/*"],
              message: "Send through sendEmail/sendSms from @/lib/messaging so consent and test-mode checks always run.",
            },
            { group: ["twilio", "resend", "postmark"], message: "Provider SDKs may only be used inside lib/messaging/providers." },
          ],
        },
      ],
    },
  },
  {
    // The service-role client bypasses RLS: only the public form and lead webhooks may use it.
    ignores: ["lib/supabase/admin.ts", "lib/leads/**", "lib/calendar/**", "app/f/**", "app/u/**", "app/book/**", "app/api/webhooks/**", "app/api/google/**", "tests/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/lib/supabase/admin", "**/supabase/admin"],
              message: "The service-role client is only for public forms, unsubscribe links and webhooks. Use @/lib/supabase/server.",
            },
            {
              group: ["@/lib/messaging/providers", "@/lib/messaging/providers/*", "**/messaging/providers", "**/messaging/providers/*"],
              message: "Send through sendEmail/sendSms from @/lib/messaging so consent and test-mode checks always run.",
            },
          ],
        },
      ],
    },
  },
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts", "playwright-report/**", "test-results/**"]),
]);

export default eslintConfig;
