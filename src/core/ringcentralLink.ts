import { toE164 } from "./format";

/** RingCentral has no deep link to an existing SMS thread. This opens the composer for the number. */
export const RINGCENTRAL_WEB_SMS = "https://app.ringcentral.com/l/phone/sms";

export function ringCentralSmsUrl(phone: string): string {
  const e164 = toE164(phone);
  if (!/^\+\d{10,15}$/.test(e164)) throw new Error("That number cannot be opened.");
  const url = `rcapp://r/sms?type=new&number=${encodeURIComponent(e164)}`;
  assertAllowedExternalUrl(url);
  return url;
}

/** Only the desktop SMS composer and the RingCentral web app are allowed. No prefilled text. */
export function assertAllowedExternalUrl(url: string): void {
  if (/content=/i.test(url)) throw new Error("Refusing to prefill a message.");
  const desktop = url.startsWith("rcapp://r/sms");
  const web = url.startsWith("https://app.ringcentral.com/");
  if (!desktop && !web) throw new Error("Blocked link.");
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
}
