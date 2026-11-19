import type { FacilityFacts, FacilityRecord, ReservationInfo } from "../shared/types";

export function extractFacilityFacts(notes: string): FacilityFacts {
  const gateCode = notes.match(/gate code[:\s]+([A-Za-z0-9#*]+)/i)?.[1];
  const directions = notes.match(/https?:\/\/\S+/)?.[0];
  const sizeLimit = notes.match(/size limit[:\s]+([^.\n]+)/i)?.[1]?.trim();
  const accessPoint = notes.match(/access point[:\s]+([^.\n]+)/i)?.[1]?.trim();
  return { gateCode, directions, sizeLimit, accessPoint };
}

export function matchFacility(
  reservation: ReservationInfo | null,
  facilities: FacilityRecord[],
): FacilityRecord | null {
  const query = reservation?.facility?.trim().toLowerCase();
  if (!query) return null;
  let best: { facility: FacilityRecord; score: number } | null = null;
  const tokens = query.split(/[^a-z0-9]+/).filter((token) => token.length > 2);
  for (const facility of facilities) {
    const name = facility.name.toLowerCase();
    const address = facility.address.toLowerCase();
    let score = 0;
    if (name.includes(query) || query.includes(name.split("-")[0].trim())) score += 5;
    for (const token of tokens) {
      if (name.includes(token)) score += 2;
      if (address.includes(token)) score += 1;
    }
    if (!best || score > best.score) best = { facility, score };
  }
  if (!best || best.score < 2) return null;
  return best.facility;
}

const STREET_NOISE = new Set(["spot", "only", "garage", "street", "north", "south", "east", "west", "the", "and", "lot", "ave", "avenue"]);

/** Match a facility when the thread mentions its street number and name, or its address. */
export function matchFacilityFromText(text: string, facilities: FacilityRecord[]): FacilityRecord | null {
  const hay = text.toLowerCase();
  let best: { facility: FacilityRecord; score: number } | null = null;
  for (const facility of facilities) {
    let score = 0;
    const short = facility.name.split("-")[0]?.trim().toLowerCase() ?? "";
    if (short.length > 4 && hay.includes(short)) score += 8;
    const address = facility.address.toLowerCase();
    const street = address.match(/\d+\s+[a-z0-9]+/);
    if (street && hay.includes(street[0])) score += 6;
    const number = facility.name.match(/\d+/);
    const word = facility.name.toLowerCase().match(/[a-z]{4,}/g)?.find((token) => !STREET_NOISE.has(token));
    if (number && word && hay.includes(number[0]) && hay.includes(word)) score += 5;
    if (!best || score > best.score) best = { facility, score };
  }
  if (!best || best.score < 5) return null;
  return best.facility;
}
