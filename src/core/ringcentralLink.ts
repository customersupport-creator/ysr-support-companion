import { toE164 } from "./format";

/** RingCentral has no deep link to an existing SMS thread. This opens the composer for the number. */
export const RINGCENTRAL_WEB_SMS = "https://app.ringcentral.com/l/phone/sms";

/** BeeTexting is where the team actually replies. There is no documented thread deep link yet. */
export const BEETEXTING_HOME = "https://app.beetexting.com/";

export type OpenNumbersIn = "beetexting" | "desktop" | "web";

export function openActionLabel(mode: OpenNumbersIn): string {
  return mode === "beetexting" ? "Open in BeeTexting" : "Open in RingCentral";
}

export function beeTextingUrl(template: string, phone: string): string {
  const e164 = toE164(phone);
  if (!/^\+\d{10,15}$/.test(e164)) throw new Error("That number cannot be opened.");
  const digits = e164.replace(/\D/g, "");
  const raw = template.trim() || BEETEXTING_HOME;
  const url = raw
    .replaceAll("{number_e164}", encodeURIComponent(e164))
    .replaceAll("{number_digits}", encodeURIComponent(digits))
    .replaceAll("{number}", encodeURIComponent(e164));
  assertAllowedExternalUrl(url);
  return url;
}

export function ringCentralSmsUrl(phone: string): string {
  const e164 = toE164(phone);
  if (!/^\+\d{10,15}$/.test(e164)) throw new Error("That number cannot be opened.");
  const url = `rcapp://r/sms?type=new&number=${encodeURIComponent(e164)}`;
  assertAllowedExternalUrl(url);
  return url;
}

/** Desktop SMS composer, RingCentral web, and BeeTexting. No prefilled text. */
export function assertAllowedExternalUrl(url: string): void {
  if (/content=/i.test(url)) throw new Error("Refusing to prefill a message.");
  const desktop = url.startsWith("rcapp://r/sms");
  const web = url.startsWith("https://app.ringcentral.com/");
  const bee = url.startsWith("https://app.beetexting.com/");
  if (!desktop && !web && !bee) throw new Error("Blocked link.");
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("Blocked link.");
  }
  if (desktop && (parsed.protocol !== "rcapp:" || parsed.hostname !== "r" || !parsed.pathname.startsWith("/sms"))) {
    throw new Error("Blocked link.");
  }
  if (web && (parsed.protocol !== "https:" || parsed.hostname !== "app.ringcentral.com")) {
    throw new Error("Blocked link.");
  }
  if (bee && (parsed.protocol !== "https:" || parsed.hostname !== "app.beetexting.com")) {
    throw new Error("Blocked link.");
  }
}
