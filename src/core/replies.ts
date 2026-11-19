import type { ResolvedRecord, SmsMessage } from "../shared/types";
import { isIntroText } from "./clicksend";
import { isReactionMessage } from "./reactions";

const FAILED_STATUS = /fail|undeliver|reject|bounce/i;

const AUTO_REPLY = [
  /\bauto(?:matic)?[- ]?repl(?:y|ies)\b/i,
  /\bautomated (?:message|text|response)\b/i,
  /\bout of (?:the )?office\b/i,
  /\boutside of (?:our )?(?:business |office )?hours\b/i,
  /\bafter[- ]hours\b/i,
  /\b(?:we are|we're|our office is) currently closed\b/i,
  /\b(?:you have been|you've been|you are) unsubscribed\b/i,
  /\bopt(?:ed)?[- ]out\b/i,
  /\byou will no longer receive\b/i,
  /\bdelivery (?:has )?failed\b/i,
  /\b(?:could not|couldn't|cannot) be delivered\b/i,
  /\bundeliver(?:ed|able)\b/i,
];

export function isFailedDelivery(message: SmsMessage): boolean {
  return FAILED_STATUS.test(message.messageStatus ?? "");
}

export function isSystemAutoReply(body: string): boolean {
  const text = body.trim();
  if (!text) return false;
  return AUTO_REPLY.some((pattern) => pattern.test(text));
}

/** A person on the support line actually sent this. Reactions, bots, and failed sends do not count. */
export function isGenuineAgentReply(message: SmsMessage): boolean {
  if (message.direction !== "outbound") return false;
  if (isReactionMessage(message.body)) return false;
  if (isFailedDelivery(message)) return false;
  if (isSystemAutoReply(message.body)) return false;
  if (isIntroText(message.body)) return false;
  return true;
}

export function genuineReplyAfter(messages: SmsMessage[], customerMessageId: string): SmsMessage | null {
  const inbound = messages.find((message) => message.id === customerMessageId);
  if (!inbound) return null;
  const inboundAt = Date.parse(inbound.sentAt);
  const replies = messages
    .filter((message) => isGenuineAgentReply(message) && Date.parse(message.sentAt) > inboundAt)
    .sort((a, b) => Date.parse(a.sentAt) - Date.parse(b.sentAt));
  return replies[0] ?? null;
}

export function formatChicagoTime(iso: string): string {
  const date = new Date(iso);
  const clock = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
  return `${clock} CT`;
}

export function resolvedLabel(record: ResolvedRecord): string {
  if (record.kind === "auto") {
    const when = formatChicagoTime(record.resolvedAt);
    const who = record.agentName?.trim();
    return who ? `Auto-resolved: replied by ${who} at ${when}` : `Auto-resolved: replied at ${when}`;
  }
  return "Resolved manually";
}
