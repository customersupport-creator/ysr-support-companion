import type { Booking, CustomerTier, ValueScore } from "../shared/types";

export interface ValueThresholds {
  /** Transient customers are high value when deduped bookings are strictly greater than this. */
  transientBookings: number;
  newWithinDays: number;
}

export const DEFAULT_VALUE_THRESHOLDS: ValueThresholds = {
  transientBookings: 15,
  newWithinDays: 30,
};

const DAY = 24 * 60 * 60 * 1000;

export const EMPTY_VALUE: ValueScore = {
  tier: "new",
  totalBookings: 0,
  bookings90Days: 0,
  bookings12Months: 0,
  distinctMonths12: 0,
  distinctMonths6: 0,
  monthStreak: 0,
  favoriteFacility: null,
  regularPattern: false,
  activeMonthlyOrLease: false,
  firstSeen: null,
  lastBooking: null,
  reason: "",
};

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function addMonths(date: Date, count: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + count, 1);
}

function bookingTime(row: Booking): number {
  const value = Date.parse(row.start || row.end || "");
  return Number.isNaN(value) ? 0 : value;
}

function activeContract(row: Booking, now: number): boolean {
  if (row.source !== "monthly" && row.source !== "lease") return false;
  if (/\b(ended|expired|cancelled|canceled|closed|inactive)\b/i.test(row.status)) return false;
  const end = row.end ? Date.parse(row.end) : NaN;
  if (!Number.isNaN(end) && end < now) return false;
  return /\b(active|current|ongoing)\b/i.test(row.status);
}

function favorite(rows: Booking[]): string | null {
  const counts = new Map<string, { name: string; count: number }>();
  for (const row of rows) {
    const name = row.facilityName.trim();
    if (!name) continue;
    const key = name.toLowerCase();
    const current = counts.get(key) ?? { name, count: 0 };
    current.count += 1;
    counts.set(key, current);
  }
  const ranked = [...counts.values()].sort((a, b) => b.count - a.count);
  if (!ranked[0] || ranked[0].count < 2) return ranked[0]?.name ?? null;
  return ranked[0].name;
}

function regularPattern(rows: Booking[]): boolean {
  const buckets = new Map<string, number>();
  for (const row of rows) {
    const at = bookingTime(row);
    if (!at) continue;
    const date = new Date(at);
    const key = `${date.getDay()}:${Math.floor(date.getHours() / 2)}`;
    buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }
  return [...buckets.values()].some((count) => count >= 3);
}

function streak(monthKeys: Set<string>, now: Date): number {
  let run = 0;
  for (let offset = 0; offset < 12; offset += 1) {
    const key = monthKey(addMonths(now, -offset));
    if (!monthKeys.has(key)) break;
    run += 1;
  }
  return run;
}

export function scoreCustomer(input: {
  bookings: Booking[];
  firstContact?: string | null;
  now: Date;
  thresholds?: Partial<ValueThresholds>;
}): ValueScore {
  const thresholds = { ...DEFAULT_VALUE_THRESHOLDS, ...input.thresholds };
  const now = input.now.getTime();
  const dated = input.bookings
    .map((row) => ({ row, at: bookingTime(row) }))
    .filter((item) => item.at > 0)
    .sort((a, b) => a.at - b.at);
  const months12 = new Set<string>();
  const months6 = new Set<string>();
  let bookings12 = 0;
  let bookings90 = 0;
  for (const item of dated) {
    const age = now - item.at;
    if (age <= 365 * DAY) {
      bookings12 += 1;
      months12.add(monthKey(new Date(item.at)));
    }
    if (age <= 183 * DAY) months6.add(monthKey(new Date(item.at)));
    if (age <= 90 * DAY) bookings90 += 1;
  }
  const contact = input.firstContact ? Date.parse(input.firstContact) : NaN;
  const firstBooking = dated[0]?.at;
  const first = [contact, firstBooking].filter((value) => !Number.isNaN(value) && value > 0);
  const firstSeenMs = first.length ? Math.min(...first) : NaN;
  const firstSeen = Number.isNaN(firstSeenMs) ? null : new Date(firstSeenMs).toISOString();
  const last = dated.length ? dated[dated.length - 1] : null;
  const active = input.bookings.some((row) => activeContract(row, now));
  const fav = favorite(input.bookings);
  const monthStreak = streak(months12, input.now);
  const total = input.bookings.length;
  const high = active || total > thresholds.transientBookings;
  const isNew = !high && !Number.isNaN(firstSeenMs) && now - firstSeenMs <= thresholds.newWithinDays * DAY;
  const tier: CustomerTier = high ? "high" : isNew || Number.isNaN(firstSeenMs) ? "new" : "regular";
  let reason: string;
  if (active) reason = fav ? `Active monthly at ${fav}` : "Active monthly or lease";
  else if (tier === "new") reason = "New customer, first seen within 30 days";
  else reason = `Transient: ${total} past bookings${fav ? `, mostly ${fav}` : ""}`;
  return {
    tier,
    totalBookings: input.bookings.length,
    bookings90Days: bookings90,
    bookings12Months: bookings12,
    distinctMonths12: months12.size,
    distinctMonths6: months6.size,
    monthStreak,
    favoriteFacility: fav,
    regularPattern: regularPattern(input.bookings),
    activeMonthlyOrLease: active,
    firstSeen,
    lastBooking: last ? new Date(last.at).toISOString() : null,
    reason,
  };
}
