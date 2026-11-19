import type { SmsMessage, Urgency } from "../shared/types";
import { isReactionMessage } from "./reactions";

export interface UrgencyResult {
  urgency: Urgency;
  urgent: boolean;
  reasons: string[];
}

const THANKS = /^(thanks|thank you|ty|ok|okay|got it|perfect|great|sounds good|you'?re welcome)[.!\s]*$/i;

export function classifyUrgency(messages: SmsMessage[]): UrgencyResult {
  const inbound = messages
    .filter((m) => m.direction === "inbound" && !isReactionMessage(m.body))
    .sort((a, b) => Date.parse(a.sentAt) - Date.parse(b.sentAt));
  const latest = inbound[inbound.length - 1];
  if (!latest) return { urgency: "GREEN", urgent: false, reasons: ["No customer text"] };

  const latestText = latest.body.trim();
  if (THANKS.test(latestText)) {
    return { urgency: "GREEN", urgent: false, reasons: ["Thanks or confirmation"] };
  }

  const context = inbound
    .slice(-4)
    .map((m) => m.body)
    .join("\n");

  const reasons: string[] = [];
  let red = false;

  if (/\b(towed|towing|tow truck|impound)\b/i.test(context)) {
    red = true;
    reasons.push("Towed");
  }
  if (/\b(damage|damaged|injury|injured|hurt|accident|unsafe)\b/i.test(context)) {
    red = true;
    reasons.push("Damage, injury, or safety");
  }
  if (
    /\b(lawyer|attorney|lawsuit|sue|suing|chargeback|bbb|scam)\b/i.test(context) ||
    /\breport you\b/i.test(context) ||
    /\bdispute\b/i.test(context)
  ) {
    red = true;
    reasons.push("Threat or chargeback");
  }

  const onSite =
    /\b(i'?m here|i am here|on site|at the (lot|gate|spot)|arrived|stuck|locked out)\b/i.test(context) ||
    /\b(can'?t|cannot|cant)\s+(park|get in|get out)\b/i.test(context) ||
    /\bgate (won'?t|will not|doesn'?t|does not)\b/i.test(context);
  if (onSite) {
    red = true;
    reasons.push("On site and can't park or get in/out");
  }

  const blocking =
    /\boverstay\b/i.test(context) ||
    (/\b(blocking|won't move|wont move|still in my spot)\b/i.test(context) &&
      /\b(spot|parked|car)\b/i.test(context));
  if (blocking && /\b(blocking|overstay|won't move|wont move|still in my spot)\b/i.test(context)) {
    red = true;
    reasons.push("Overstay blocking another customer");
  }

  const angry =
    /\b(furious|ridiculous|unacceptable|pissed|worst|idiot)\b/i.test(context) ||
    /\bare you (a )?bot\b/i.test(context) ||
    reasons.some((r) => r === "Threat or chargeback" || r === "Towed" || r === "Damage, injury, or safety");

  if (red) {
    return { urgency: "RED", urgent: angry || /\b(stuck|unsafe|locked out)\b/i.test(context), reasons };
  }

  const yellowReasons: string[] = [];
  if (/\b(refund|reimburse|reimbursement|zelle|money back)\b/i.test(context) || /\bcancel\b/i.test(context)) {
    yellowReasons.push("Refund");
  }
  if (/\b(relocat|another spot|nearby spot)\b/i.test(context)) yellowReasons.push("Relocation");
  if (/\b(extend|extension|more time|ends soon|end time)\b/i.test(context)) {
    yellowReasons.push("Extension near end time");
  }
  if (
    /\b(can'?t find|cannot find|where (is|do)|which spot|right spot|confused)\b/i.test(context)
  ) {
    yellowReasons.push("Confused about the spot");
  }
  if (/\b(spot taken|lot full|someone is in my spot)\b/i.test(context)) {
    yellowReasons.push("Spot taken or lot full");
  }

  if (yellowReasons.length > 0) {
    return {
      urgency: "YELLOW",
      urgent: angry,
      reasons: yellowReasons,
    };
  }

  return { urgency: "GREEN", urgent: angry, reasons: ["Question or confirmation"] };
}
