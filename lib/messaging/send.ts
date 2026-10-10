import { serverEnv, type AppEnv } from "@/lib/env";
import { redactPhone } from "@/lib/redact";
import { canSendSms, type CanSendInput } from "./canSend";
import { emailProviderFor, smsProviderFor } from "./providers";
import type { OutboundEmail, OutboundSms, SendResult } from "./types";

/** The only way app code sends email. */
export async function sendEmail(message: OutboundEmail, appEnv?: AppEnv): Promise<SendResult> {
  const mode = appEnv ?? serverEnv().APP_ENV;
  // Only production needs credentials; test/development always record.
  return emailProviderFor(mode, mode === "production" ? serverEnv() : {}).send(message);
}

/** The only way app code sends SMS. Always checks canSendSms first. */
export async function sendSms(
  message: OutboundSms,
  gate: CanSendInput,
  appEnv: AppEnv = serverEnv().APP_ENV,
): Promise<SendResult> {
  const decision = canSendSms(gate);
  if (!decision.allowed) {
    console.info(`[sms] skipped ${redactPhone(message.to)}: ${decision.reason}`);
    return { status: "skipped", reason: decision.reason, retryAt: decision.retryAt };
  }
  return smsProviderFor(appEnv).send(message);
}
