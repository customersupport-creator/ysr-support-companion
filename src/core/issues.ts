import type { Booking, IssueCategory, IssueHit, IssueSummary, SmsMessage } from "../shared/types";
import { ISSUE_RULES } from "./issueRules";
import { isReactionMessage } from "./reactions";
import { truncate } from "./format";

function time(iso: string): number {
  const value = Date.parse(iso);
  return Number.isNaN(value) ? 0 : value;
}

function openIds(messages: SmsMessage[]): Set<string> {
  const sorted = [...messages].sort((a, b) => time(a.sentAt) - time(b.sentAt));
  let lastOutbound = -1;
  sorted.forEach((message, index) => {
    if (message.direction === "outbound" && !isReactionMessage(message.body)) lastOutbound = index;
  });
  return new Set(
    sorted
      .slice(lastOutbound + 1)
      .filter((message) => message.direction === "inbound" && !isReactionMessage(message.body))
      .map((message) => message.id),
  );
}

function facilityIn(body: string, fallback: string): string {
  const named = body.match(/\bfacility\s*:\s*([^\n]+)/i)?.[1]?.trim();
  return named || fallback;
}

function rentalIn(body: string, fallback: string): string {
  return (
    body.match(/\brental\s*id\s*#?\s*:?\s*(\d{8,10})\b/i)?.[1] ||
    body.match(/\breservation\s*(?:id|#)?\s*:?\s*(\d{8,10})\b/i)?.[1] ||
    fallback
  );
}

export function detectIssues(messages: SmsMessage[], facilityName = "", rentalId = ""): IssueHit[] {
  const current = openIds(messages);
  const hits: IssueHit[] = [];
  for (const message of messages) {
    if (message.direction !== "inbound" || isReactionMessage(message.body)) continue;
    const rule = ISSUE_RULES.find((item) => item.pattern.test(message.body));
    if (!rule) continue;
    hits.push({
      category: rule.id,
      label: rule.label,
      color: rule.color,
      at: message.sentAt,
      messageId: message.id,
      facility: facilityIn(message.body, facilityName),
      rentalId: rentalIn(message.body, rentalId),
      snippet: truncate(message.body, 90),
      current: current.has(message.id),
    });
  }
  return hits.sort((a, b) => Number(b.current) - Number(a.current) || time(b.at) - time(a.at));
}

export function summarizeIssues(hits: IssueHit[]): IssueSummary[] {
  const groups = new Map<IssueCategory, IssueHit[]>();
  for (const hit of hits) {
    const list = groups.get(hit.category) ?? [];
    list.push(hit);
    groups.set(hit.category, list);
  }
  const summaries: IssueSummary[] = [];
  for (const [category, list] of groups) {
    const byFacility = new Map<string, number>();
    for (const hit of list) {
      const key = hit.facility.trim().toLowerCase();
      if (!key) continue;
      byFacility.set(key, (byFacility.get(key) ?? 0) + 1);
    }
    const latest = [...list].sort((a, b) => time(b.at) - time(a.at))[0];
    summaries.push({
      category,
      label: latest.label,
      color: latest.color,
      count: list.length,
      repeatFacility: [...byFacility.values()].some((count) => count >= 2),
      current: list.some((hit) => hit.current),
      latest,
    });
  }
  const newest = hits.filter((hit) => hit.current).sort((a, b) => time(b.at) - time(a.at))[0];
  return summaries.sort((a, b) => {
    const aOpen = a.category === newest?.category ? 1 : 0;
    const bOpen = b.category === newest?.category ? 1 : 0;
    return bOpen - aOpen || Number(b.current) - Number(a.current) || b.count - a.count || a.label.localeCompare(b.label);
  });
}

export function facilityFromBookings(bookings: Booking[]): string {
  return bookings.find((row) => row.facilityName.trim())?.facilityName ?? "";
}
