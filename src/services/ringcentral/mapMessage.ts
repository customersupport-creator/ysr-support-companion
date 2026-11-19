import { SUPPORT_LINE_E164 } from "../../shared/constants";
import type { SmsMessage } from "../../shared/types";
import { customerPhoneFor, toE164 } from "../../core/format";

interface RcParty {
  phoneNumber?: string;
  name?: string;
}

interface RcRecord {
  id?: string | number;
  type?: string;
  subject?: string;
  direction?: string;
  creationTime?: string;
  messageStatus?: string;
  from?: RcParty;
  to?: RcParty[];
  attachments?: Array<{ type?: string; content?: string }>;
}

function asRecord(value: unknown): RcRecord | null {
  if (!value || typeof value !== "object") return null;
  return value as RcRecord;
}

export function mapRcMessage(value: unknown, source: SmsMessage["source"] = "ringcentral"): SmsMessage | null {
  const record = asRecord(value);
  if (!record?.id || !record.creationTime) return null;
  if (record.type && record.type !== "SMS") return null;
  const from = toE164(record.from?.phoneNumber ?? "");
  const to = toE164(record.to?.[0]?.phoneNumber ?? "");
  const customer = customerPhoneFor(from, to);
  if (!customer || customer === SUPPORT_LINE_E164) return null;
  const attachment = record.attachments?.find((item) => item.type === "Text" && item.content)?.content;
  const body = String(record.subject ?? attachment ?? "").trim();
  const direction =
    record.direction?.toLowerCase() === "outbound" || from === SUPPORT_LINE_E164 ? "outbound" : "inbound";
  return {
    id: String(record.id),
    threadId: customer,
    direction,
    body,
    sentAt: record.creationTime,
    fromPhone: from,
    toPhone: to,
    source,
    messageStatus: record.messageStatus?.trim() || undefined,
    agentName: direction === "outbound" ? record.from?.name?.trim() || undefined : undefined,
  };
}

/** Pull SMS records out of a WebSocket notification without treating customer text as commands. */
export function smsFromNotification(payload: unknown): SmsMessage[] {
  const found: SmsMessage[] = [];
  const visit = (node: unknown): void => {
    if (!node) return;
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (typeof node !== "object") return;
    const record = node as RcRecord & { body?: unknown; payload?: unknown };
    if (record.subject && (record.from || record.direction || record.type === "SMS")) {
      const mapped = mapRcMessage(record);
      if (mapped) found.push(mapped);
      return;
    }
    if ("body" in record) visit(record.body);
    if ("payload" in record) visit(record.payload);
  };
  visit(payload);
  return found;
}
