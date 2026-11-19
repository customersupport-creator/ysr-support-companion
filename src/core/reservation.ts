import type { ReservationInfo, SmsMessage } from "../shared/types";

function field(blob: string, label: string): string | undefined {
  const match = blob.match(new RegExp(`(?:^|\\n)\\s*${label}\\s*[:\\-]\\s*(.+)`, "i"));
  const value = match?.[1]?.trim();
  return value ? value : undefined;
}

function parseWhen(raw: string | undefined): Date | undefined {
  if (!raw) return undefined;
  const parsed = Date.parse(raw);
  if (!Number.isNaN(parsed)) return new Date(parsed);
  return undefined;
}

export function parseReservation(messages: SmsMessage[], now: Date): ReservationInfo | null {
  const blob = messages
    .filter((m) => m.direction === "inbound")
    .map((m) => m.body)
    .join("\n");
  const rentalId = field(blob, "rental id");
  const facility = field(blob, "facility");
  const plate = field(blob, "plate");
  const customerName = field(blob, "name");
  const startRaw = field(blob, "start");
  const endRaw = field(blob, "end");
  if (!rentalId && !facility && !plate && !startRaw && !endRaw) return null;

  const start = parseWhen(startRaw);
  const end = parseWhen(endRaw);
  let status: ReservationInfo["status"] = "unknown";
  if (start && end) {
    if (now < start) status = "upcoming";
    else if (now > end) status = "ended";
    else status = "active";
  }

  return {
    rentalId,
    facility,
    customerName,
    start: startRaw,
    end: endRaw,
    plate,
    status,
  };
}
