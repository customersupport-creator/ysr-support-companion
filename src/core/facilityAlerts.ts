import type { AlertDismissal, FacilityAccess, FacilityAlertItem, FacilityIssueCount, IssueCategory, SmsMessage } from "../shared/types";
import { formatPhoneDisplay } from "./format";
import { toE164 } from "./format";
import { detectIssues } from "./issues";

const WATCHED: IssueCategory[] = ["lot-full", "inaccessible", "directions", "towed"];

const PHRASE: Record<string, string> = {
  "lot-full": "lot full or spot taken",
  inaccessible: "gate code not working",
  directions: "can't find the location",
  towed: "towing",
};

function time(iso: string): number {
  const value = Date.parse(iso);
  return Number.isNaN(value) ? 0 : value;
}

function shortFacility(name: string): string {
  const head = name.split("-")[0]?.trim() ?? name;
  return head || name;
}

export function buildFacilityAlerts(input: {
  threads: Array<{ phone: string; messages: SmsMessage[]; facilityName: string; facilityRecordId: string | null; access: FacilityAccess | null }>;
  now: Date;
  customers: number;
  windowHours: number;
  dismissals: AlertDismissal[];
}): { active: FacilityAlertItem[]; counts: FacilityIssueCount[] } {
  const now = input.now.getTime();
  const windowMs = input.windowHours * 60 * 60 * 1000;
  const weekMs = 7 * 24 * 60 * 60 * 1000;
  type Bucket = {
    facilityName: string;
    facilityRecordId: string | null;
    access: FacilityAccess | null;
    category: IssueCategory;
    label: string;
    hits: Array<{ phone: string; snippet: string; at: string; messageId: string }>;
  };
  const buckets = new Map<string, Bucket>();
  for (const thread of input.threads) {
    const facilityName = thread.facilityName.trim();
    if (!facilityName) continue;
    const phone = toE164(thread.phone);
    for (const hit of detectIssues(thread.messages, facilityName)) {
      if (!WATCHED.includes(hit.category)) continue;
      if (now - time(hit.at) > weekMs) continue;
      const key = `${facilityName.toLowerCase()}|${hit.category}`;
      const bucket = buckets.get(key) ?? {
        facilityName,
        facilityRecordId: thread.facilityRecordId,
        access: thread.access,
        category: hit.category,
        label: hit.label,
        hits: [],
      };
      if (!bucket.hits.some((item) => item.messageId === hit.messageId)) {
        bucket.hits.push({ phone, snippet: hit.snippet, at: hit.at, messageId: hit.messageId });
      }
      buckets.set(key, bucket);
    }
  }

  const counts: FacilityIssueCount[] = [...buckets.values()]
    .map((bucket) => ({
      facilityName: shortFacility(bucket.facilityName),
      category: bucket.category,
      label: bucket.label,
      customers: new Set(bucket.hits.map((hit) => hit.phone)).size,
    }))
    .sort((a, b) => b.customers - a.customers || a.facilityName.localeCompare(b.facilityName));

  const active: FacilityAlertItem[] = [];
  for (const bucket of buckets.values()) {
    const recent = bucket.hits.filter((hit) => now - time(hit.at) <= windowMs);
    const byPhone = new Map<string, (typeof recent)[number]>();
    for (const hit of recent) {
      const existing = byPhone.get(hit.phone);
      if (!existing || time(hit.at) > time(existing.at)) byPhone.set(hit.phone, hit);
    }
    const phones = [...byPhone.values()];
    if (phones.length < input.customers) continue;
    const id = `${bucket.facilityName.toLowerCase()}|${bucket.category}`;
    const dismissal = input.dismissals.find((item) => item.id === id);
    if (dismissal && recent.every((hit) => dismissal.messageIds.includes(hit.messageId))) continue;
    const newest = Math.max(...phones.map((hit) => time(hit.at)));
    const oldest = Math.min(...phones.map((hit) => time(hit.at)));
    const hours = Math.max(1, Math.round((newest - oldest) / (60 * 60 * 1000)) || 1);
    const spanLabel = hours === 1 ? "the last hour" : `the last ${hours} hours`;
    const phrase = PHRASE[bucket.category] ?? bucket.label.toLowerCase();
    const facilityName = shortFacility(bucket.facilityName);
    active.push({
      id,
      facilityName,
      facilityRecordId: bucket.facilityRecordId,
      category: bucket.category,
      phrase,
      customers: phones.map((hit) => ({
        phone: hit.phone,
        displayPhone: formatPhoneDisplay(hit.phone),
        snippet: hit.snippet,
        at: hit.at,
        messageId: hit.messageId,
      })),
      newestAt: new Date(newest).toISOString(),
      spanLabel,
      toast: `Facility alert: ${facilityName} - ${phones.length} customers report ${phrase} in ${spanLabel}`,
      urgent: bucket.category === "towed" || bucket.category === "inaccessible",
      access: bucket.access,
    });
  }
  return { active, counts };
}
