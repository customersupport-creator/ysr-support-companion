import { describe, expect, it } from "vitest";
import { attentionNotice, extractRentalIds } from "../src/core/rentalIds";
import type { SmsMessage } from "../src/shared/types";
import { SUPPORT_LINE_E164 } from "../src/shared/constants";

const PHONE = "+16479895702";

function msg(id: string, body: string, minutes: number, direction: "inbound" | "outbound" = "inbound"): SmsMessage {
  return {
    id,
    threadId: PHONE,
    direction,
    body,
    sentAt: new Date(Date.parse("2026-11-19T18:00:00.000Z") - minutes * 60_000).toISOString(),
    fromPhone: direction === "inbound" ? PHONE : SUPPORT_LINE_E164,
    toPhone: direction === "inbound" ? SUPPORT_LINE_E164 : PHONE,
    source: "demo",
  };
}

describe("rental id extractor", () => {
  it("prefers labeled SpotHero ids and orders the newest mention first", () => {
    const ids = extractRentalIds(
      [
        msg("old", "Chatbot reservation\nRental ID: 136244125", 40),
        msg("new", "I'm here. reservation 138424128", 5),
        msg("agent", "Checking rental #138424128 now", 4, "outbound"),
      ],
      PHONE,
    );
    expect(ids).toEqual(["138424128", "136244125"]);
  });

  it("reads confirmation numbers and a bare 9-digit id", () => {
    const ids = extractRentalIds([msg("1", "confirmation number 138424128 and also 136244125", 1)], PHONE);
    expect(ids[0]).toBe("136244125");
    expect(ids).toContain("138424128");
  });

  it("ignores phones, dates, dollar amounts, and short gate codes", () => {
    const ids = extractRentalIds(
      [
        msg(
          "1",
          "Call me at (647) 989-5702 or 312-999-5161. Gate code 4821. On 11/19/2026 I paid $25. The date 20261119 is not an id.",
          1,
        ),
      ],
      PHONE,
    );
    expect(ids).toEqual([]);
  });

  it("does not treat the customer's bare 10-digit phone as a rental id", () => {
    expect(extractRentalIds([msg("1", "My number is 6479895702", 1)], PHONE)).toEqual([]);
  });

  it("puts the rental id in the attention line when one is known", () => {
    expect(attentionNotice(PHONE, ["138424128"])).toBe(
      "Hey, number (647) 989-5702 needs your attention (Rental ID 138424128)",
    );
    expect(attentionNotice(PHONE, [])).toBe("Hey, number (647) 989-5702 needs your attention");
  });
});
