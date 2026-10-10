import type { AppEnv } from "@/lib/env";
import type { EmailProvider, SmsProvider } from "../types";
import { resendProvider } from "./resend";
import { testOutbox } from "./test-outbox";

/**
 * Provider adapters. Only code inside lib/messaging may import this module
 * (enforced by ESLint); everything else goes through sendEmail / sendSms.
 */

export class ProviderNotConfiguredError extends Error {
  constructor(channel: "email" | "sms") {
    super(
      channel === "email"
        ? "Email isn't set up: add RESEND_API_KEY and EMAIL_FROM."
        : "No live SMS provider is configured yet (SMS arrives in milestone 6).",
    );
    this.name = "ProviderNotConfiguredError";
  }
}

let counter = 0;
const nextId = (prefix: string) => `${prefix}_${Date.now().toString(36)}_${(counter++).toString(36)}`;

export const testEmailProvider: EmailProvider = {
  mode: "test",
  async send(message) {
    const entry = testOutbox.record({ channel: "email", message, providerId: nextId("test_email"), at: new Date() });
    return { status: "recorded", providerId: entry.providerId };
  },
};

export const testSmsProvider: SmsProvider = {
  mode: "test",
  async send(message) {
    const entry = testOutbox.record({ channel: "sms", message, providerId: nextId("test_sms"), at: new Date() });
    return { status: "recorded", providerId: entry.providerId };
  },
};

/**
 * Live providers only exist when APP_ENV=production. Anything else records.
 * Production without Resend credentials fails loudly rather than pretending to send.
 */
export function emailProviderFor(appEnv: AppEnv, creds: { RESEND_API_KEY?: string; EMAIL_FROM?: string } = {}): EmailProvider {
  if (appEnv !== "production") return testEmailProvider;
  if (creds.RESEND_API_KEY && creds.EMAIL_FROM) return resendProvider(creds.RESEND_API_KEY, creds.EMAIL_FROM);
  throw new ProviderNotConfiguredError("email");
}

export function smsProviderFor(appEnv: AppEnv): SmsProvider {
  if (appEnv !== "production") return testSmsProvider;
  throw new ProviderNotConfiguredError("sms");
}
