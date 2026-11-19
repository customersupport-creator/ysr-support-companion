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
