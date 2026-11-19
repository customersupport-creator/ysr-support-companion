import type { CommitmentItem, CommitmentOverride, CommitmentStatus, CommitmentType, SmsMessage } from "../shared/types";
import { formatPhoneDisplay, truncate } from "./format";
import { toE164 } from "./format";
import { isReactionMessage } from "./reactions";

const DAY = 24 * 60 * 60 * 1000;
const WINDOW = 30 * DAY;

const RULES: Array<{ type: CommitmentType; label: string; pattern: RegExp }> = [
  { type: "refund", label: "Refund", pattern: /\b(refund|endorse for refund|will be refunded|zelle)\b/i },
  { type: "reimbursement", label: "Reimbursement", pattern: /\b(reimburse|reimbursement|towing reimbursement)\b/i },
  { type: "relocation", label: "Relocation", pattern: /\b(will relocate|relocat(e|ing) you|move you to)\b/i },
  { type: "credit", label: "Credit", pattern: /\bcredit\b/i },
  { type: "callback", label: "Call-back", pattern: /\b(i'?ll call you|i will call you|will call you|call you back)\b/i },
  { type: "update", label: "Update", pattern: /\b(will update you|i'?ll update you|get back to you)\b/i },
];

const DONE_HINT = /\brefund (?:was )?(?:processed|sent|completed)\b|\brefund has been (?:sent|processed|completed)\b/i;

function time(iso: string): number {
  const value = Date.parse(iso);
  return Number.isNaN(value) ? 0 : value;
}

function amountIn(body: string): string {
  return body.match(/\$\s?\d[\d,]*(?:\.\d{2})?/)?.[0]?.replace(/\s/g, "") ?? "";
}

function nameIn(messages: SmsMessage[]): string {
  for (const message of messages) {
    const named = message.body.match(/\bname\s*:\s*([A-Za-z][A-Za-z .'-]{0,40})/i);
    if (named) return named[1].trim();
  }
  return "";
}

function rentalIn(messages: SmsMessage[]): string {
  for (const message of [...messages].reverse()) {
    const id = message.body.match(/\brental\s*id\s*#?\s*:?\s*(\d{8,10})\b/i)?.[1];
    if (id) return id;
  }
  return "";
}

function facilityIn(messages: SmsMessage[], fallback: string): string {
  for (const message of [...messages].reverse()) {
    const named = message.body.match(/\bfacility\s*:\s*([^\n]+)/i)?.[1]?.trim();
    if (named) return named;
  }
  return fallback;
}

export function findCommitments(input: {
  threads: Array<{ phone: string; messages: SmsMessage[]; facilityName: string }>;
  now: Date;
  overrides: CommitmentOverride[];
}): CommitmentItem[] {
  const now = input.now.getTime();
  const items: CommitmentItem[] = [];
  for (const thread of input.threads) {
    const phone = toE164(thread.phone);
    const customerName = nameIn(thread.messages);
    const rentalId = rentalIn(thread.messages);
    const facility = facilityIn(thread.messages, thread.facilityName);
    for (const message of thread.messages) {
      if (isReactionMessage(message.body)) continue;
      if (now - time(message.sentAt) > WINDOW) continue;
      const rule = RULES.find((item) => item.pattern.test(message.body));
      if (!rule) continue;
      const id = `${phone}:${message.id}:${rule.type}`;
      const override = input.overrides.find((item) => item.id === id);
      const later = thread.messages.filter((item) => time(item.sentAt) > time(message.sentAt) && item.direction === "outbound");
      const suggestDone = rule.type === "refund" && later.some((item) => DONE_HINT.test(item.body));
      const asked = /\?|what|send me|email|zelle name|your zelle/i.test(message.body) && message.direction === "outbound";
      const waiting = message.direction === "outbound" && asked && !thread.messages.some((item) => item.direction === "inbound" && time(item.sentAt) > time(message.sentAt));
      let status: CommitmentStatus = override?.status ?? (waiting ? "waiting" : "open");
      if (override?.status) status = override.status;
      const ageMs = Math.max(0, now - time(message.sentAt));
      items.push({
        id,
        phone,
        displayPhone: formatPhoneDisplay(phone),
        customerName,
        rentalId,
        facility,
        type: rule.type,
        typeLabel: rule.label,
        amount: amountIn(message.body),
        agentName: message.direction === "outbound" ? message.agentName?.trim() || "Agent" : "Customer",
        at: message.sentAt,
        ageMs,
        snippet: truncate(message.body, 90),
        status,
        note: override?.note ?? "",
        suggestDone: suggestDone && status !== "done",
        ageTone: ageMs > 72 * 60 * 60 * 1000 ? "red" : ageMs > 24 * 60 * 60 * 1000 ? "amber" : "normal",
      });
    }
  }
  return items.sort((a, b) => Number(a.status === "done") - Number(b.status === "done") || b.ageMs - a.ageMs);
}

export function commitmentsToCsv(items: CommitmentItem[]): string {
  const header = ["phone", "name", "rentalId", "facility", "type", "amount", "who", "when", "status", "note", "snippet"];
  const cell = (value: string) => {
    const text = value.replace(/"/g, '""');
    return /[",\n]/.test(text) ? `"${text}"` : text;
  };
  const lines = items.map((item) =>
    [item.displayPhone, item.customerName, item.rentalId, item.facility, item.typeLabel, item.amount, item.agentName, item.at, item.status, item.note, item.snippet]
      .map(cell)
      .join(","),
  );
  return [header.join(","), ...lines].join("\n");
}
