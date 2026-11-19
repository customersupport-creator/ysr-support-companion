import type { ConsentWarning, FlaggedCard, SmsMessage, Thread } from "../shared/types";
import { consentFor } from "./safety";
import { customerPhoneFor, formatPhoneDisplay, toE164, truncate } from "./format";
import { isReactionMessage } from "./reactions";

export function threadIdForMessage(message: Pick<SmsMessage, "fromPhone" | "toPhone">): string | null {
  return customerPhoneFor(message.fromPhone, message.toPhone);
}

export function mergeMessages(existing: SmsMessage[], incoming: SmsMessage[]): SmsMessage[] {
  const byId = new Map(existing.map((message) => [message.id, message]));
  for (const message of incoming) {
    if (byId.has(message.id)) continue;
    const sentAt = Date.parse(message.sentAt);
    const duplicate = [...byId.values()].some((current) => {
      if (current.threadId !== message.threadId || current.direction !== message.direction) return false;
      if (current.body !== message.body) return false;
      const delta = Math.abs(Date.parse(current.sentAt) - sentAt);
      return Number.isFinite(delta) && delta < 5000;
    });
    if (!duplicate) byId.set(message.id, message);
  }
  return [...byId.values()].sort(
    (a, b) => Date.parse(a.sentAt) - Date.parse(b.sentAt) || a.id.localeCompare(b.id),
  );
}

export function groupThreads(messages: SmsMessage[], consent: ConsentWarning[]): Thread[] {
  const grouped = new Map<string, SmsMessage[]>();
  for (const message of messages) {
    const id = message.threadId || threadIdForMessage(message);
    if (!id) continue;
    const list = grouped.get(id) ?? [];
    list.push({ ...message, threadId: id });
    grouped.set(id, list);
  }
  return [...grouped.entries()]
    .map(([id, msgs]) => ({
      id,
      customerPhone: toE164(id),
      messages: msgs,
      consentWarning: consentFor(id, consent),
    }))
    .sort((a, b) => a.customerPhone.localeCompare(b.customerPhone));
}

export function flaggedFromThreads(threads: Thread[]): FlaggedCard[] {
  return threads
    .filter((thread) => thread.consentWarning)
    .map((thread) => {
      const latest = [...thread.messages].reverse().find((message) => message.direction === "inbound" && !isReactionMessage(message.body));
      return {
        threadId: thread.id,
        customerPhone: thread.customerPhone,
        displayPhone: formatPhoneDisplay(thread.customerPhone),
        headline: `Hey, number ${formatPhoneDisplay(thread.customerPhone)} has a consent warning. Do not text.`,
        reason: thread.consentWarning?.reason ?? "Consent warning",
        preview: latest ? truncate(latest.body, 140) : "No customer text",
      };
    });
}
