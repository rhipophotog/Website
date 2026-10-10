import type { AppEnv } from "@/lib/env";
import type { EmailProvider, SmsProvider } from "../types";
import { testOutbox } from "./test-outbox";

/**
 * Provider adapters. Only code inside lib/messaging may import this module
 * (enforced by ESLint); everything else goes through sendEmail / sendSms.
 */

export class ProviderNotConfiguredError extends Error {
  constructor(channel: "email" | "sms") {
    super(
      `No live ${channel} provider is configured yet ` +
        `(email arrives in milestone 5, SMS in milestone 6).`,
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

/** Live providers only exist when APP_ENV=production. Anything else records. */
export function emailProviderFor(appEnv: AppEnv): EmailProvider {
  if (appEnv !== "production") return testEmailProvider;
  throw new ProviderNotConfiguredError("email");
}

export function smsProviderFor(appEnv: AppEnv): SmsProvider {
  if (appEnv !== "production") return testSmsProvider;
  throw new ProviderNotConfiguredError("sms");
}
