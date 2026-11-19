import type { QueueCard, SmsMessage, Thread } from "../shared/types";
import { attentionHeadline, formatPhoneDisplay, truncate } from "./format";
import { isReactionMessage } from "./reactions";
import { classifyUrgency } from "./urgency";

export interface ReplyAssessment {
  message: SmsMessage;
  waitMs: number;
  waitingSince: string;
}

function time(iso: string): number {
  const value = Date.parse(iso);
  return Number.isNaN(value) ? 0 : value;
}

export function genuineMessages(messages: SmsMessage[]): SmsMessage[] {
  return messages.filter((m) => !isReactionMessage(m.body));
}

/**
 * A thread needs a reply when the latest genuine customer text has no
 * genuine outbound message after it. Reactions are ignored in both directions.
 */
export function assessNeedsReply(messages: SmsMessage[], nowMs: number): ReplyAssessment | null {
  const sorted = [...messages].sort((a, b) => time(a.sentAt) - time(b.sentAt) || a.id.localeCompare(b.id));
  const genuine = genuineMessages(sorted);
  let lastInbound: SmsMessage | null = null;
  for (const message of genuine) {
    if (message.direction === "inbound") lastInbound = message;
  }
  if (!lastInbound) return null;
  const inboundAt = time(lastInbound.sentAt);
  const replied = genuine.some(
    (message) => message.direction === "outbound" && time(message.sentAt) > inboundAt,
  );
  if (replied) return null;
  return {
    message: lastInbound,
    waitMs: Math.max(0, nowMs - inboundAt),
    waitingSince: lastInbound.sentAt,
  };
}

const URGENCY_RANK: Record<QueueCard["urgency"], number> = { RED: 0, YELLOW: 1, GREEN: 2 };

export function queueFromThreads(threads: Thread[], nowMs: number): QueueCard[] {
  const cards: QueueCard[] = [];
  for (const thread of threads) {
    if (thread.consentWarning) continue;
    const assessment = assessNeedsReply(thread.messages, nowMs);
    if (!assessment) continue;
    const urgency = classifyUrgency(thread.messages);
    cards.push({
      threadId: thread.id,
      customerPhone: thread.customerPhone,
      displayPhone: formatPhoneDisplay(thread.customerPhone),
      headline: attentionHeadline(thread.customerPhone),
      waitMs: assessment.waitMs,
      waitingSince: assessment.waitingSince,
      preview: truncate(assessment.message.body, 140),
      urgency: urgency.urgency,
      urgent: urgency.urgent,
      reasons: urgency.reasons,
      lastCustomerMessageId: assessment.message.id,
      key: `${thread.id}:${assessment.message.id}`,
    });
  }
  cards.sort((a, b) => URGENCY_RANK[a.urgency] - URGENCY_RANK[b.urgency] || b.waitMs - a.waitMs);
  return cards;
}
