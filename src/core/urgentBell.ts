import type { QueueCard, UrgentSeenRecord } from "../shared/types";
import { toE164 } from "./format";

/** Unresolved urgent threads, newest customer text first. */
export function urgentThreads(cards: QueueCard[]): QueueCard[] {
  return cards
    .filter((card) => card.urgent)
    .sort((a, b) => Date.parse(b.waitingSince) - Date.parse(a.waitingSince));
}

export function isUrgentUnseen(card: QueueCard, seen: UrgentSeenRecord[]): boolean {
  const phone = toE164(card.customerPhone);
  return !seen.some(
    (record) => toE164(record.phone) === phone && record.lastCustomerMessageId === card.lastCustomerMessageId,
  );
}

export function unseenUrgentCount(cards: QueueCard[], seen: UrgentSeenRecord[]): number {
  return urgentThreads(cards).filter((card) => isUrgentUnseen(card, seen)).length;
}

/** Remember the current urgent message for each number. A newer inbound text becomes unseen again. */
export function markUrgentSeen(seen: UrgentSeenRecord[], cards: QueueCard[]): UrgentSeenRecord[] {
  const next = seen.map((record) => ({ ...record, phone: toE164(record.phone) }));
  for (const card of urgentThreads(cards)) {
    if (!isUrgentUnseen(card, next)) continue;
    next.push({ phone: toE164(card.customerPhone), lastCustomerMessageId: card.lastCustomerMessageId });
  }
  return next;
}

export function urgentTitle(displayPhone: string): string {
  return `URGENT: ${displayPhone} needs your attention`;
}
