import type { SmsMessage } from "../../shared/types";
import { clicksendFromEmail, type InboundEmail } from "../../core/clicksend";

interface GmailList {
  messages?: Array<{ id: string }>;
  nextPageToken?: string;
}

interface GmailPart {
  mimeType?: string;
  body?: { data?: string };
  parts?: GmailPart[];
}

interface GmailFull {
  id: string;
  internalDate?: string;
  payload?: GmailPart & { headers?: Array<{ name: string; value: string }> };
}

function decode(data: string): string {
  const padded = data.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(padded, "base64").toString("utf8");
}

function header(message: GmailFull, name: string): string {
  const found = message.payload?.headers?.find((item) => item.name.toLowerCase() === name.toLowerCase());
  return found?.value ?? "";
}

function plainText(part: GmailPart | undefined): string {
  if (!part) return "";
  if (part.mimeType === "text/plain" && part.body?.data) return decode(part.body.data);
  for (const child of part.parts ?? []) {
    const text = plainText(child);
    if (text) return text;
  }
  if (part.body?.data && part.mimeType?.startsWith("text/")) return decode(part.body.data);
  return "";
}

/** Read-only Gmail client. It lists and reads messages. It cannot send. */
export class GmailClient {
  constructor(
    private readonly accessToken: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async listClicksendReplies(maxPages = 3): Promise<SmsMessage[]> {
    const query = '(from:sms.clicksend.com OR subject:"New text message from CLICKSEND") newer_than:7d';
    const ids: string[] = [];
    let pageToken = "";
    for (let page = 0; page < maxPages; page += 1) {
      const params = new URLSearchParams({ q: query, maxResults: "50" });
      if (pageToken) params.set("pageToken", pageToken);
      const response = await this.fetchImpl(`https://gmail.googleapis.com/gmail/v1/users/me/messages?${params}`, {
        headers: { Authorization: `Bearer ${this.accessToken}`, Accept: "application/json" },
      });
      if (!response.ok) throw new Error(`Gmail read failed (${response.status}).`);
      const json = (await response.json()) as GmailList;
      ids.push(...(json.messages ?? []).map((item) => item.id));
      if (!json.nextPageToken) break;
      pageToken = json.nextPageToken;
    }
    const messages: SmsMessage[] = [];
    for (const id of ids) {
      const response = await this.fetchImpl(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(id)}?format=full`,
        { headers: { Authorization: `Bearer ${this.accessToken}`, Accept: "application/json" } },
      );
      if (!response.ok) continue;
      const json = (await response.json()) as GmailFull;
      const email: InboundEmail = {
        id: json.id,
        from: header(json, "From"),
        subject: header(json, "Subject"),
        date: json.internalDate ? new Date(Number(json.internalDate)).toISOString() : header(json, "Date"),
        body: plainText(json.payload),
      };
      const parsed = clicksendFromEmail(email);
      if (parsed) messages.push(parsed);
    }
    return messages;
  }
}
