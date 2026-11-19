import type { Booking, BookingSource, SmsMessage } from "../shared/types";
import { phonesMatch } from "./phoneMatch";

const SOURCE_RANK: Record<BookingSource, number> = {
  monthly: 4,
  lease: 4,
  transient: 3,
  sms: 1,
};

function when(row: Booking): number {
  const value = Date.parse(row.start || row.end || "");
  return Number.isNaN(value) ? 0 : value;
}

function filled(preferred: string | undefined, fallback: string | undefined): string | undefined {
  const value = preferred?.trim() || fallback?.trim();
  return value || undefined;
}

/** Keep one row per reservation id. Airtable rows win over text parsed from SMS. Newest start first. */
export function dedupeBookings(rows: Booking[]): Booking[] {
  const byId = new Map<string, Booking>();
  for (const row of rows) {
    const id = row.id.trim();
    if (!id) continue;
    const existing = byId.get(id);
    if (!existing) {
      byId.set(id, { ...row, id });
      continue;
    }
    const prefer = SOURCE_RANK[row.source] >= SOURCE_RANK[existing.source] ? row : existing;
    const other = prefer === row ? existing : row;
    byId.set(id, {
      id,
      source: prefer.source,
      facilityName: filled(prefer.facilityName, other.facilityName) ?? "",
      platform: filled(prefer.platform, other.platform) ?? "",
      start: filled(prefer.start, other.start),
      end: filled(prefer.end, other.end),
      status: filled(prefer.status, other.status) ?? "",
      plate: filled(prefer.plate, other.plate),
      phone: filled(prefer.phone, other.phone),
    });
  }
  return [...byId.values()].sort((a, b) => when(b) - when(a) || a.id.localeCompare(b.id));
}

export function bookingsForPhone(rows: Booking[], phone: string, rentalIds: string[]): Booking[] {
  const ids = new Set(rentalIds.map((id) => id.trim()).filter(Boolean));
  const matched = rows.filter((row) => {
    if (row.phone && phonesMatch(row.phone, phone)) return true;
    if (row.source === "transient" || row.source === "sms") return ids.has(row.id);
    return ids.has(row.id);
  });
  return dedupeBookings(matched);
}

/** SpotHero-style rental blocks in either direction. Transient lookup still uses the id. */
export function bookingsFromMessages(messages: SmsMessage[]): Booking[] {
  const rows: Booking[] = [];
  for (const message of messages) {
    const id =
      message.body.match(/\brental\s*id\s*#?\s*:?\s*(\d{8,10})\b/i)?.[1] ||
      message.body.match(/\breservation\s*(?:id|#|number)?\s*:?\s*(\d{8,10})\b/i)?.[1];
    if (!id) continue;
    const facility = message.body.match(/\bfacility\s*:\s*([^\n]+)/i)?.[1]?.trim() ?? "";
    const plate = message.body.match(/\b(?:plate|license)\s*:\s*([A-Za-z0-9-]+)/i)?.[1];
    const start = message.body.match(/\bstart\s*:\s*([^\n]+)/i)?.[1]?.trim();
    const end = message.body.match(/\bend\s*:\s*([^\n]+)/i)?.[1]?.trim();
    rows.push({
      id,
      source: "sms",
      facilityName: facility,
      platform: "SpotHero",
      start,
      end,
      status: "",
      plate,
    });
  }
  return rows;
}
