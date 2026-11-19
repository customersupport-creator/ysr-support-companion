import { SUPPORT_LINE_E164 } from "../shared/constants";
import type { SmsMessage } from "../shared/types";
import { toE164 } from "./format";

/** The support line's standard first text. It is not a finished reply. */
export const INTRO_TEXT =
  "Thank you for contacting Yourspotrented.com. I’m checking your reservation details now. Please give me a moment.";

const CLICKSEND_ADDRESS = /([+]?\d{10,15})@sms\.clicksend\.com/i;
const SUBJECT_NUMBER = /SMS reply from\s+(\+?\d{10,15})/i;
const VOICE_SUBJECT = /new text message from clicksend/i;
const DIRECT_BODY =
  /you'?ve received a reply from\s+\+?\d{10,15}:\s*([\s\S]*?)(?:\r?\n-{5,}|\r?\noriginal message\b|$)/i;
const VOICE_BODY = /SMS from\s+(\+\d{10,15})\s*:\s*([\s\S]*?)(?:\r?\nYOUR ACCOUNT|\r?\nThis email was sent to you|$)/i;

export interface InboundEmail {
  id: string;
  from: string;
  subject: string;
  date: string;
  body: string;
}

function normalizeCopy(body: string): string {
  return body.replace(/\r\n/g, "\n").replace(/\u00a0/g, " ").trim();
}

export function isIntroText(body: string): boolean {
  const flat = (value: string) => value.trim().replace(/[\u2018\u2019]/g, "'").replace(/\s+/g, " ");
  return flat(body) === flat(INTRO_TEXT);
}

/** One customer text from a ClickSend notification email, or null when it is not one. */
export function clicksendFromEmail(email: InboundEmail): SmsMessage | null {
  const fromAddress = email.from.match(CLICKSEND_ADDRESS)?.[1] ?? "";
  const subjectNumber = email.subject.match(SUBJECT_NUMBER)?.[1] ?? "";
  const direct = email.body.match(DIRECT_BODY);
  const voice = !direct && VOICE_SUBJECT.test(email.subject) ? email.body.match(VOICE_BODY) : null;
  const phone = toE164(voice?.[1] || fromAddress || subjectNumber);
  const body = normalizeCopy(direct?.[1] || voice?.[2] || "");
  if (!phone.startsWith("+") || phone.length < 11 || !body) return null;
  const sentAt = new Date(email.date).toISOString();
  if (Number.isNaN(Date.parse(sentAt))) return null;
  return {
    id: `clicksend:${email.id}`,
    threadId: phone,
    direction: "inbound",
    body,
    sentAt,
    fromPhone: phone,
    toPhone: SUPPORT_LINE_E164,
    source: "clicksend",
  };
}
