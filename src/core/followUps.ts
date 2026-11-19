import type { FollowUpItem, FollowUpOverride, SmsMessage } from "../shared/types";
import { formatPhoneDisplay, truncate } from "./format";
import { toE164 } from "./format";
import { isReactionMessage } from "./reactions";
import { isFailedDelivery, isSystemAutoReply } from "./replies";

const ENDORSE = /\b(endorse|for processing)\b/i;
const PROMISE =
  /\b(checking on it|let me check|i'?ll update you|i will update you|will update you|get back to you|give me a few minutes|looking into (this|it)|i'?ll call you|i will call you|will call you|will relocate you|one moment)\b/i;

function time(iso: string): number {
  const value = Date.parse(iso);
  return Number.isNaN(value) ? 0 : value;
}

function countsAsOutbound(message: SmsMessage): boolean {
  return message.direction === "outbound" && !isReactionMessage(message.body) && !isFailedDelivery(message);
}

export function openFollowUps(input: {
  threads: Array<{ phone: string; messages: SmsMessage[] }>;
  now: Date;
  standardMinutes: number;
  endorseMinutes: number;
  overrides: FollowUpOverride[];
  manuallyResolvedPhones: Set<string>;
}): FollowUpItem[] {
  const now = input.now.getTime();
  const items: FollowUpItem[] = [];
  for (const thread of input.threads) {
    const phone = toE164(thread.phone);
    if (input.manuallyResolvedPhones.has(phone)) continue;
    const promises = thread.messages
      .filter((message) => countsAsOutbound(message) && !isSystemAutoReply(message.body) && (ENDORSE.test(message.body) || PROMISE.test(message.body)))
      .sort((a, b) => time(a.sentAt) - time(b.sentAt));
    const promise = promises[promises.length - 1];
    if (!promise) continue;
    const promisedAt = time(promise.sentAt);
    const later = thread.messages.some(
      (message) => countsAsOutbound(message) && time(message.sentAt) > promisedAt && message.id !== promise.id,
    );
    if (later) continue;
    const override = input.overrides.find((item) => item.id === promise.id);
    if (override?.doneAt) continue;
    const kind = ENDORSE.test(promise.body) ? "endorse" : "standard";
    const minutes = kind === "endorse" ? input.endorseMinutes : input.standardMinutes;
    let dueAt = promisedAt + minutes * 60_000;
    let state: FollowUpItem["state"] = now >= dueAt ? "due" : "pending";
    if (override?.snoozeUntil) {
      const snooze = time(override.snoozeUntil);
      if (snooze > now) {
        dueAt = snooze;
        state = "snoozed";
      } else if (now >= snooze) state = "due";
    }
    const waitMinutes = Math.max(0, Math.floor((now - promisedAt) / 60_000));
    const agentName = promise.agentName?.trim() || "Someone";
    const quote = truncate(promise.body, 48);
    const displayPhone = formatPhoneDisplay(phone);
    items.push({
      id: promise.id,
      phone,
      displayPhone,
      agentName,
      quote,
      promisedAt: promise.sentAt,
      dueAt: new Date(dueAt).toISOString(),
      waitMinutes,
      kind,
      state,
      toast: `Follow-up due: ${displayPhone}, ${agentName} said "${quote}" ${waitMinutes} min ago`,
    });
  }
  return items.sort((a, b) => Number(b.state === "due") - Number(a.state === "due") || time(a.promisedAt) - time(b.promisedAt));
}
