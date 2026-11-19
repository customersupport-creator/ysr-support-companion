import type { ResolvedRecord } from "../shared/types";
import { toE164 } from "./format";

export function isResolvedForMessage(records: ResolvedRecord[], phone: string, messageId: string): boolean {
  const target = toE164(phone);
  return records.some((record) => toE164(record.phone) === target && record.lastCustomerMessageId === messageId);
}

export function upsertResolved(records: ResolvedRecord[], next: ResolvedRecord): ResolvedRecord[] {
  const phone = toE164(next.phone);
  return [...records.filter((record) => toE164(record.phone) !== phone), { ...next, phone }];
}

export function dropResolved(records: ResolvedRecord[], phone: string): ResolvedRecord[] {
  const target = toE164(phone);
  return records.filter((record) => toE164(record.phone) !== target);
}

export function resolvedOnDay(records: ResolvedRecord[], day: Date): ResolvedRecord[] {
  const start = new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime();
  const end = start + 24 * 60 * 60 * 1000;
  return records
    .filter((record) => {
      const at = Date.parse(record.resolvedAt);
      return at >= start && at < end;
    })
    .sort((a, b) => Date.parse(b.resolvedAt) - Date.parse(a.resolvedAt));
}
