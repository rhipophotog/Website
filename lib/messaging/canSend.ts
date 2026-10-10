/**
 * The single gate every outbound SMS passes through (CLAUDE.md non-negotiable).
 *
 * Milestone 1 ships the gate closed: no SMS can be sent by anything until milestone 6
 * fills in the consent, DND, quiet-hours and stop-automations checks below and the
 * `consents` table exists. Keep this deny-by-default when extending it.
 */

export type SmsContact = {
  phone: string | null;
  dnd_sms: boolean;
  stop_automations: boolean;
  time_zone: string | null;
};

export type SmsConsent = {
  granted: boolean;
  text: string;
  source: string;
  at: Date;
};

export type CanSendInput = {
  contact: SmsContact;
  consent: SmsConsent | null;
  /** True for workflow sends; quiet hours and stop-automations only apply to these. */
  automated: boolean;
  now: Date;
};

export type CanSendDecision =
  | { allowed: true }
  | {
      allowed: false;
      reason: "sms_not_enabled" | "no_phone" | "no_consent" | "dnd" | "automations_stopped" | "quiet_hours";
      retryAt?: Date;
    };

export function canSendSms(input: CanSendInput): CanSendDecision {
  if (!input.contact.phone) return { allowed: false, reason: "no_phone" };
  return { allowed: false, reason: "sms_not_enabled" };
}
