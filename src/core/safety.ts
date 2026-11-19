import type { ConsentWarning } from "../shared/types";
import { toE164 } from "./format";

export function isStopKeyword(body: string): boolean {
  return /^(stop|stopall|unsubscribe|stop texting)[.!]?\s*$/i.test(body.trim());
}

export function consentFor(phone: string, list: ConsentWarning[]): ConsentWarning | null {
  const target = toE164(phone);
  return list.find((item) => toE164(item.phone) === target) ?? null;
}
