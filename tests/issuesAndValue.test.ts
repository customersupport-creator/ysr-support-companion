import { describe, expect, it } from "vitest";
import { detectIssues, summarizeIssues } from "../src/core/issues";
import { scoreCustomer } from "../src/core/customerValue";
import type { Booking, SmsMessage } from "../src/shared/types";

const PHONE = "+13125550111";
const NOW = new Date("2026-11-19T18:00:00.000Z");

function inbound(id: string, body: string, sentAt: string): SmsMessage {
  return {
    id,
    threadId: PHONE,
    direction: "inbound",
    body,
    sentAt,
    fromPhone: PHONE,
    toPhone: "+13129995161",
    source: "demo",
  };
}

function transient(id: string, start: string): Booking {
  return {
    id,
    source: "transient",
    facilityName: "17 Raymond St",
    platform: "Parkwhiz",
    start,
    status: "Ended",
    phone: PHONE,
  };
}

describe("issue tags", () => {
  it("tags past issues, counts repeats, and puts the open issue first", () => {
    const hits = detectIssues(
      [
        inbound("1", "The lot was full and someone was in my spot at 17 Raymond.", "2026-08-01T15:00:00.000Z"),
        inbound("2", "Lot full again at 17 Raymond. All spots taken.", "2026-09-01T15:00:00.000Z"),
        inbound("3", "The keypad won't open and I can't get in.", "2026-11-19T17:50:00.000Z"),
      ],
      "17 Raymond St",
    );
    const summary = summarizeIssues(hits);
    expect(summary[0]?.label).toBe("Inaccessible");
    expect(summary[0]?.current).toBe(true);
    const lot = summary.find((item) => item.label === "Lot full");
    expect(lot?.count).toBe(2);
    expect(lot?.repeatFacility).toBe(true);
    expect(hits.find((hit) => hit.messageId === "3")?.snippet.length).toBeGreaterThan(0);
  });
});

describe("customer value", () => {
  it("treats 15 transient bookings as regular and 16 as high value", () => {
    const fifteen = Array.from({ length: 15 }, (_, index) => transient(`T${index}`, `2025-${String((index % 12) + 1).padStart(2, "0")}-04T15:00:00.000Z`));
    const regular = scoreCustomer({ bookings: fifteen, now: NOW, firstContact: "2025-01-04T15:00:00.000Z" });
    expect(regular.tier).toBe("regular");
    expect(regular.reason).toMatch(/Transient: 15 past bookings/);
    expect(regular.favoriteFacility).toBe("17 Raymond St");

    const sixteen = scoreCustomer({
      bookings: [...fifteen, transient("T15", "2025-06-04T15:00:00.000Z")],
      now: NOW,
      firstContact: "2025-01-04T15:00:00.000Z",
    });
    expect(sixteen.tier).toBe("high");
    expect(sixteen.reason).toBe("Transient: 16 past bookings, mostly 17 Raymond St");
    expect(sixteen.distinctMonths12).toBeGreaterThan(0);
  });

  it("keeps an active monthly high value and a first-month parker new", () => {
    const monthly = scoreCustomer({
      bookings: [
        {
          id: "M1",
          source: "monthly",
          facilityName: "17 Raymond St",
          platform: "SpotHero",
          start: "2026-03-01T15:00:00.000Z",
          end: "2027-03-01T15:00:00.000Z",
          status: "Active",
          phone: PHONE,
        },
      ],
      now: NOW,
    });
    expect(monthly.tier).toBe("high");
    expect(monthly.reason).toMatch(/Active monthly at 17 Raymond St/);

    const newbie = scoreCustomer({
      bookings: [transient("N1", "2026-11-10T15:00:00.000Z")],
      now: NOW,
      firstContact: "2026-11-10T15:00:00.000Z",
    });
    expect(newbie.tier).toBe("new");
  });
});
