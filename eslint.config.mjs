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
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts", "playwright-report/**", "test-results/**"]),
]);

export default eslintConfig;
