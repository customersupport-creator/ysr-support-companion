import type { Booking, FacilityAccess, FacilityListItem, FacilityRecord, IssueSummary, SmsMessage, ValueScore } from "../shared/types";
import { parseFacilityAccess } from "./accessCodes";
import { bookingsForPhone, bookingsFromMessages, dedupeBookings } from "./bookings";
import { scoreCustomer, type ValueThresholds } from "./customerValue";
import { matchFacility, matchFacilityFromText } from "./facilityFacts";
import { detectIssues, summarizeIssues } from "./issues";
import { extractRentalIds } from "./rentalIds";
import { parseReservation } from "./reservation";

export interface CardContext {
  facility: FacilityRecord | null;
  facilityRecordId: string | null;
  facilityName: string | null;
  access: FacilityAccess | null;
  issues: IssueSummary[];
  value: ValueScore;
  rentalIds: string[];
  bookings: Booking[];
}

export function withAccess(facility: FacilityRecord): FacilityRecord {
  if (facility.access) return facility;
  return {
    ...facility,
    access: parseFacilityAccess({
      notes: facility.notes,
      towingCompany: facility.towingCompany,
      extra: facility.salesTowAuthorization,
    }),
  };
}

export function facilityList(facilities: FacilityRecord[]): FacilityListItem[] {
  return facilities.map(withAccess).map((facility) => ({
    id: facility.id,
    name: facility.name,
    address: facility.address,
    status: facility.status,
    access: facility.access ?? null,
  }));
}

export function resolveFacility(
  messages: SmsMessage[],
  facilities: FacilityRecord[],
  pickedId: string | null,
  now: Date,
): FacilityRecord | null {
  if (pickedId) {
    const picked = facilities.find((facility) => facility.id === pickedId);
    if (picked) return withAccess(picked);
  }
  const reservation = parseReservation(messages, now);
  const fromReservation = matchFacility(reservation, facilities);
  if (fromReservation) return withAccess(fromReservation);
  const text = messages.map((message) => message.body).join("\n");
  const fromText = matchFacilityFromText(text, facilities);
  return fromText ? withAccess(fromText) : null;
}

export function buildCardContext(input: {
  messages: SmsMessage[];
  phone: string;
  facilities: FacilityRecord[];
  pickedId: string | null;
  bookings: Booking[];
  now: Date;
  thresholds: ValueThresholds;
}): CardContext {
  const facility = resolveFacility(input.messages, input.facilities, input.pickedId, input.now);
  const rentalIds = extractRentalIds(input.messages, input.phone);
  const bookings = bookingsForPhone(
    dedupeBookings([...input.bookings, ...bookingsFromMessages(input.messages)]),
    input.phone,
    rentalIds,
  );
  const firstContact = [...input.messages].sort((a, b) => Date.parse(a.sentAt) - Date.parse(b.sentAt))[0]?.sentAt ?? null;
  const issues = summarizeIssues(detectIssues(input.messages, facility?.name ?? "", rentalIds[0] ?? ""));
  const value = scoreCustomer({
    bookings,
    firstContact,
    now: input.now,
    thresholds: input.thresholds,
  });
  return {
    facility,
    facilityRecordId: facility?.id ?? null,
    facilityName: facility?.name ?? null,
    access: facility?.access ?? null,
    issues,
    value,
    rentalIds,
    bookings,
  };
}
