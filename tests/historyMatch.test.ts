import { describe, expect, it } from "vitest";
import { bookingsForPhone, dedupeBookings } from "../src/core/bookings";
import { phoneKey, phonesMatch } from "../src/core/phoneMatch";
import type { Booking } from "../src/shared/types";

describe("phone matching", () => {
  it("strips formatting and hidden direction marks", () => {
    expect(phoneKey("\u200e(949) 315-9107\u200f")).toBe("9493159107");
    expect(phonesMatch("+1 732-757-5003", "17327575003")).toBe(true);
    expect(phonesMatch("\u200e+1 (647) 989-5702\u200e", "+16479895702")).toBe(true);
    expect(phonesMatch("3125550144", "+13125550199")).toBe(false);
  });
});

describe("booking match and dedupe", () => {
  const sms: Booking = {
    id: "138420011",
    source: "sms",
    facilityName: "",
    platform: "SpotHero",
    start: "2026-11-01T15:00:00.000Z",
    status: "",
    plate: "GATE1",
  };
  const transient: Booking = {
    id: "138420011",
    source: "transient",
    facilityName: "17 Raymond St",
    platform: "Parkwhiz",
    start: "2026-11-01T15:00:00.000Z",
    status: "Ended",
  };
  const older: Booking = {
    id: "136244125",
    source: "monthly",
    facilityName: "500 Wabash Lot",
    platform: "SpotHero",
    start: "2026-08-01T15:00:00.000Z",
    status: "Active",
    phone: "(647) 989-5702",
  };

  it("keeps one row per id, prefers Airtable, and sorts newest first", () => {
    const rows = dedupeBookings([sms, transient, older]);
    expect(rows.map((row) => row.id)).toEqual(["138420011", "136244125"]);
    expect(rows[0]?.facilityName).toBe("17 Raymond St");
    expect(rows[0]?.plate).toBe("GATE1");
    expect(rows[0]?.source).toBe("transient");
  });

  it("matches monthly by phone and transient only by rental id", () => {
    const matched = bookingsForPhone([transient, older], "+16479895702", ["138420011"]);
    expect(matched.map((row) => row.id).sort()).toEqual(["136244125", "138420011"]);
    const other = bookingsForPhone([transient, older], "+13125550144", []);
    expect(other).toEqual([]);
  });
});
