import { SUPPORT_LINE_E164 } from "../shared/constants";
import type { SmsMessage } from "../shared/types";
import { attentionHeadline, digitsOnly } from "./format";

const LABELED =
  /\b(?:rental\s*(?:id|number|no\.?)?|reservation\s*(?:id|number)?|confirmation\s*(?:number|id)?)\s*[#:]?\s*(\d{8,10})\b/gi;

const PHONE_SHAPE = /(?:\+?1[\s.-]*)?(?:\(\d{3}\)[\s.-]*|\b\d{3}[\s.-])\d{3}[\s.-]\d{4}\b/g;
const DASHED_DATE = /\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/g;
const MONEY = /\$\s*\d[\d,]*(?:\.\d{2})?/g;

interface Hit {
  id: string;
  at: number;
  index: number;
}

function national(phone: string): string {
  const digits = digitsOnly(phone);
  if (digits.length === 11 && digits.startsWith("1")) return digits.slice(1);
  return digits;
}

function looksLikeDate(digits: string): boolean {
  if (digits.length !== 8) return false;
  const year = Number(digits.slice(0, 4));
  const month = Number(digits.slice(4, 6));
  const day = Number(digits.slice(6, 8));
  if (year >= 1900 && year <= 2100 && month >= 1 && month <= 12 && day >= 1 && day <= 31) return true;
  const monthFirst = Number(digits.slice(0, 2));
  const dayFirst = Number(digits.slice(2, 4));
  const yearFirst = Number(digits.slice(4, 8));
  return yearFirst >= 1900 && yearFirst <= 2100 && monthFirst >= 1 && monthFirst <= 12 && dayFirst >= 1 && dayFirst <= 31;
}

function isKnownPhone(digits: string, phones: string[]): boolean {
  const known = new Set(phones.map(national).filter((value) => value.length === 10));
  if (digits.length === 10 && known.has(digits)) return true;
  if (digits.length === 11 && digits.startsWith("1") && known.has(digits.slice(1))) return true;
  return false;
}

function maskNonIds(text: string): string {
  return text.replace(PHONE_SHAPE, " ").replace(DASHED_DATE, " ").replace(MONEY, " ");
}

/**
 * Rental IDs are 8–10 digits, usually 9. Labeled forms win.
 * A bare number is kept only when it is not a phone, a date, or a dollar amount.
 * Most recently mentioned ID is first.
 */
export function extractRentalIds(messages: SmsMessage[], customerPhone = ""): string[] {
  const phones = [customerPhone, SUPPORT_LINE_E164];
  const hits: Hit[] = [];
  const ordered = [...messages].sort((a, b) => Date.parse(a.sentAt) - Date.parse(b.sentAt));
  for (const message of ordered) {
    const at = Date.parse(message.sentAt) || 0;
    const labeledSpans: Array<{ start: number; end: number; id: string }> = [];
    for (const match of message.body.matchAll(LABELED)) {
      const id = match[1];
      if (!id || isKnownPhone(id, phones) || looksLikeDate(id)) continue;
      const start = match.index ?? 0;
      labeledSpans.push({ start, end: start + match[0].length, id });
      hits.push({ id, at, index: start });
    }
    const masked = maskNonIds(message.body);
    for (const match of masked.matchAll(/\b(\d{8,10})\b/g)) {
      const id = match[1];
      const index = match.index ?? 0;
      const covered = labeledSpans.some((span) => index >= span.start && index < span.end);
      if (covered) continue;
      if (isKnownPhone(id, phones) || looksLikeDate(id)) continue;
      const before = masked[index - 1] ?? "";
      const after = masked[index + id.length] ?? "";
      if (before === "$" || before === "(" || before === "-" || after === "-" || after === ")") continue;
      hits.push({ id, at, index });
    }
  }
  hits.sort((a, b) => b.at - a.at || b.index - a.index);
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const hit of hits) {
    if (seen.has(hit.id)) continue;
    seen.add(hit.id);
    ids.push(hit.id);
  }
  return ids;
}

export function attentionNotice(phone: string, rentalIds: string[]): string {
  const base = attentionHeadline(phone);
  if (rentalIds.length === 0) return base;
  if (rentalIds.length === 1) return `${base} (Rental ID ${rentalIds[0]})`;
  return `${base} (Rental IDs ${rentalIds.join(", ")})`;
}
