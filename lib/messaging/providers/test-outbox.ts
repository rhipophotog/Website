import type { Channel, OutboundEmail, OutboundSms } from "../types";

/**
 * Where test-mode providers put messages instead of sending them. In-memory for now;
 * milestone 5 also writes them to the `messages` table so they show up in the inbox.
 */
export type RecordedMessage =
  | { channel: "email"; message: OutboundEmail; providerId: string; at: Date }
  | { channel: "sms"; message: OutboundSms; providerId: string; at: Date };

const recorded = new Map<string, RecordedMessage>();

export const testOutbox = {
  /** Records once per channel + idempotency key; a retry returns the first record. */
  record(entry: RecordedMessage): RecordedMessage {
    const key = `${entry.channel}:${entry.message.idempotencyKey}`;
    const existing = recorded.get(key);
    if (existing) return existing;
    recorded.set(key, entry);
    return entry;
  },
  list(channel?: Channel): RecordedMessage[] {
    const all = [...recorded.values()];
    return channel ? all.filter((m) => m.channel === channel) : all;
  },
  clear() {
    recorded.clear();
  },
};
