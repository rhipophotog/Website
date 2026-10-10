export type Channel = "email" | "sms";

export type OutboundEmail = {
  to: string;
  subject: string;
  text: string;
  html?: string;
  /** Defaults to EMAIL_FROM. */
  from?: string;
  replyTo?: string;
  /** Extra headers, e.g. In-Reply-To / References for threading, List-Unsubscribe. */
  headers?: Record<string, string>;
  /** Small attachments such as a calendar invite. Content is plain text or base64. */
  attachments?: { filename: string; content: string; contentType?: string }[];
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
