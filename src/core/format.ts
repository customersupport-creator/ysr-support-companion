import { SUPPORT_LINE_E164 } from "../shared/constants";

export function digitsOnly(input: string): string {
  return input.replace(/\D/g, "");
}

/** Normalize a phone number to E.164. US 10-digit numbers get +1. */
export function toE164(input: string): string {
  const digits = digitsOnly(input);
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (digits.length > 0) return `+${digits}`;
  return input.trim();
}

/** (647) 989-5702. Non-US numbers stay in a readable +E.164 form. */
export function formatPhoneDisplay(input: string): string {
  const digits = digitsOnly(input);
  const national = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  if (national.length === 10) {
    return `(${national.slice(0, 3)}) ${national.slice(3, 6)}-${national.slice(6)}`;
  }
  if (digits.length > 0) return `+${digits}`;
  return input.trim();
}

export function attentionHeadline(phone: string): string {
  return `Hey, number ${formatPhoneDisplay(phone)} needs your attention`;
}

export function formatWait(ms: number): string {
  const safe = Math.max(0, Math.floor(ms));
  const seconds = Math.floor(safe / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rem = minutes % 60;
  return rem === 0 ? `${hours}h` : `${hours}h ${rem}m`;
}

export function isSupportLine(phone: string): boolean {
  return toE164(phone) === SUPPORT_LINE_E164;
}

export function truncate(text: string, max: number): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  return `${flat.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

export function customerPhoneFor(fromPhone: string, toPhone: string): string | null {
  const from = toE164(fromPhone);
  const to = toE164(toPhone);
  if (from === SUPPORT_LINE_E164 && to !== SUPPORT_LINE_E164) return to;
  if (to === SUPPORT_LINE_E164 && from !== SUPPORT_LINE_E164) return from;
  if (from === SUPPORT_LINE_E164 && to === SUPPORT_LINE_E164) return null;
  return null;
}
