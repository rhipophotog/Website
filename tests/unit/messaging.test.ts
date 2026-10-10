import { afterEach, describe, expect, it } from "vitest";
import { canSendSms, type CanSendInput } from "@/lib/messaging/canSend";
import { emailProviderFor, ProviderNotConfiguredError, smsProviderFor } from "@/lib/messaging/providers";
import { testOutbox } from "@/lib/messaging/providers/test-outbox";
import { sendEmail, sendSms } from "@/lib/messaging/send";
import { redactEmail, redactPhone } from "@/lib/redact";

afterEach(() => testOutbox.clear());

const email = { to: "priya@example.com", subject: "Congratulations!", text: "Hi Priya", idempotencyKey: "run_1:s1" };
const sms = { to: "+14155550123", body: "Hi Priya", idempotencyKey: "run_1:s2" };
const gate: CanSendInput = {
  contact: { phone: "+14155550123", dnd_sms: false, stop_automations: false, time_zone: null },
  consent: { granted: true, text: "I agree to receive texts", source: "website_form", at: new Date() },
  automated: true,
  now: new Date(),
};

describe("provider selection", () => {
  it.each(["development", "test"] as const)("records instead of sending when APP_ENV=%s", (appEnv) => {
    expect(emailProviderFor(appEnv).mode).toBe("test");
    expect(smsProviderFor(appEnv).mode).toBe("test");
  });

  it("refuses production until a live provider is wired up", () => {
    expect(() => emailProviderFor("production")).toThrow(ProviderNotConfiguredError);
    expect(() => smsProviderFor("production")).toThrow(ProviderNotConfiguredError);
  });
});

describe("sendEmail in test mode", () => {
  it("records the message in the outbox", async () => {
    const result = await sendEmail(email, "test");
    expect(result.status).toBe("recorded");
    expect(testOutbox.list("email")).toHaveLength(1);
  });

  it("is idempotent: a retry with the same key records once", async () => {
    const first = await sendEmail(email, "test");
    const retry = await sendEmail({ ...email, text: "changed" }, "test");
    expect(retry).toEqual(first);
    expect(testOutbox.list("email")).toHaveLength(1);
  });
});

describe("canSendSms", () => {
  it("stays closed until milestone 6, even with consent", () => {
    expect(canSendSms(gate)).toEqual({ allowed: false, reason: "sms_not_enabled" });
  });

  it("blocks contacts without a phone number", () => {
    expect(canSendSms({ ...gate, contact: { ...gate.contact, phone: null } })).toEqual({ allowed: false, reason: "no_phone" });
  });

  it("sendSms goes through the gate and never reaches a provider while closed", async () => {
    const result = await sendSms(sms, gate, "production");
    expect(result).toMatchObject({ status: "skipped", reason: "sms_not_enabled" });
    expect(testOutbox.list("sms")).toHaveLength(0);
  });
});

describe("log redaction", () => {
  it("hides all but the last 4 digits of a phone number", () => {
    expect(redactPhone("+14155550123")).toBe("+1••••••0123");
    expect(redactPhone("+14155550123")).not.toContain("415555");
  });

  it("hides most of an email's local part", () => {
    expect(redactEmail("priya@example.com")).toBe("p••••@example.com");
  });
});
