export type Channel = "email" | "sms";

export type OutboundEmail = {
  to: string;
  subject: string;
  text: string;
  html?: string;
  /** `run_id:step_id` for workflow sends, or a message id for one-off sends. */
  idempotencyKey: string;
};

export type OutboundSms = {
  to: string;
  body: string;
  idempotencyKey: string;
};

export type SendResult =
  | { status: "sent"; providerId: string }
  /** Test mode: captured in the outbox, nothing left the machine. */
  | { status: "recorded"; providerId: string }
  /** Blocked before reaching a provider (consent, DND, quiet hours, ...). */
  | { status: "skipped"; reason: string; retryAt?: Date };

export interface EmailProvider {
  readonly mode: "test" | "live";
  send(message: OutboundEmail): Promise<SendResult>;
}

export interface SmsProvider {
  readonly mode: "test" | "live";
  send(message: OutboundSms): Promise<SendResult>;
}
