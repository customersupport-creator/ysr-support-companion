import { describe, expect, it } from "vitest";
import { SUPPORT_LINE_E164 } from "../src/shared/constants";
import type { SmsMessage } from "../src/shared/types";
import { attentionHeadline } from "../src/core/format";
import { assessNeedsReply, queueFromThreads } from "../src/core/needsReply";
import { isReactionMessage } from "../src/core/reactions";
import { shouldAlertForWait } from "../src/core/alerts";
import { classifyUrgency } from "../src/core/urgency";
import { groupThreads } from "../src/core/messages";

const PHONE = "+16479895702";
const NOW = Date.parse("2026-11-19T18:00:00.000Z");

function msg(partial: Partial<SmsMessage> & Pick<SmsMessage, "id" | "direction" | "body" | "sentAt">): SmsMessage {
  return {
    threadId: PHONE,
    fromPhone: partial.direction === "outbound" ? SUPPORT_LINE_E164 : PHONE,
    toPhone: partial.direction === "outbound" ? PHONE : SUPPORT_LINE_E164,
    source: "demo",
    ...partial,
  };
}

describe("reaction filter", () => {
  it.each([
    "Liked “see you there”",
    'Loved "the spot"',
    "Emphasized “gate code”",
    "Disliked “nope”",
    "Laughed at “funny”",
    "Questioned “are you sure?”",
    "Liked an image",
    "Removed a like from “thanks”",
    "Removed a heart from “ok”",
  ])("ignores %s", (body) => {
    expect(isReactionMessage(body)).toBe(true);
  });

  it("keeps a real sentence that merely contains the word liked", () => {
    expect(isReactionMessage("I liked the spot but someone is in it")).toBe(false);
    expect(isReactionMessage("Emphasized the gate was broken")).toBe(false);
  });
});

describe("needs-reply detector", () => {
  it("needs a reply when the latest genuine customer text has no outbound after it", () => {
    const result = assessNeedsReply(
      [msg({ id: "1", direction: "inbound", body: "Someone is in my spot", sentAt: "2026-11-19T17:50:00.000Z" })],
      NOW,
    );
    expect(result?.message.id).toBe("1");
    expect(result?.waitMs).toBe(10 * 60 * 1000);
  });

  it("does not need a reply when an outbound follows the customer", () => {
    const result = assessNeedsReply(
      [
        msg({ id: "1", direction: "inbound", body: "Where is the spot?", sentAt: "2026-11-19T17:40:00.000Z" }),
        msg({ id: "2", direction: "outbound", body: "Alley behind the building.", sentAt: "2026-11-19T17:41:00.000Z" }),
      ],
      NOW,
    );
    expect(result).toBeNull();
  });

  it("needs a reply again after a newer customer text", () => {
    const result = assessNeedsReply(
      [
        msg({ id: "1", direction: "inbound", body: "Where is the spot?", sentAt: "2026-11-19T17:40:00.000Z" }),
        msg({ id: "2", direction: "outbound", body: "Alley.", sentAt: "2026-11-19T17:41:00.000Z" }),
        msg({ id: "3", direction: "inbound", body: "I still can't find it", sentAt: "2026-11-19T17:50:00.000Z" }),
      ],
      NOW,
    );
    expect(result?.message.id).toBe("3");
  });

  it("ignores a reaction that arrives after the real customer text", () => {
    const result = assessNeedsReply(
      [
        msg({ id: "1", direction: "inbound", body: "The gate code isn't working", sentAt: "2026-11-19T17:40:00.000Z" }),
        msg({ id: "2", direction: "inbound", body: "Liked “The gate code isn't working”", sentAt: "2026-11-19T17:41:00.000Z" }),
      ],
      NOW,
    );
    expect(result?.message.id).toBe("1");
  });

  it("does not treat a reaction after our reply as a new customer text", () => {
    const result = assessNeedsReply(
      [
        msg({ id: "1", direction: "inbound", body: "Will I get towed?", sentAt: "2026-11-19T17:20:00.000Z" }),
        msg({ id: "2", direction: "outbound", body: "You won't be towed in the right spot.", sentAt: "2026-11-19T17:22:00.000Z" }),
        msg({ id: "3", direction: "inbound", body: "Loved “You won't be towed in the right spot.”", sentAt: "2026-11-19T17:23:00.000Z" }),
      ],
      NOW,
    );
    expect(result).toBeNull();
  });

  it("still needs a reply when a reaction sits between the customer and no real answer", () => {
    const result = assessNeedsReply(
      [
        msg({ id: "1", direction: "inbound", body: "Code doesn't work", sentAt: "2026-11-19T17:00:00.000Z" }),
        msg({ id: "2", direction: "outbound", body: "Which code did you try?", sentAt: "2026-11-19T17:05:00.000Z" }),
        msg({ id: "3", direction: "inbound", body: "Emphasized “Which code did you try?”", sentAt: "2026-11-19T17:06:00.000Z" }),
        msg({ id: "4", direction: "inbound", body: "I'm stuck outside", sentAt: "2026-11-19T17:10:00.000Z" }),
      ],
      NOW,
    );
    expect(result?.message.id).toBe("4");
  });

  it("ignores a thread that is only reactions", () => {
    expect(
      assessNeedsReply([msg({ id: "1", direction: "inbound", body: "Loved “hi”", sentAt: "2026-11-19T17:00:00.000Z" })], NOW),
    ).toBeNull();
  });

  it("does not count an outbound with the same timestamp as a reply", () => {
    const result = assessNeedsReply(
      [
        msg({ id: "1", direction: "inbound", body: "Hello", sentAt: "2026-11-19T17:00:00.000Z" }),
        msg({ id: "2", direction: "outbound", body: "Hi", sentAt: "2026-11-19T17:00:00.000Z" }),
      ],
      NOW,
    );
    expect(result?.message.id).toBe("1");
  });

  it("builds a card with the playbook headline", () => {
    const threads = groupThreads(
      [msg({ id: "1", direction: "inbound", body: "I'm here and I can't park", sentAt: "2026-11-19T17:58:00.000Z" })],
      [],
    );
    const [card] = queueFromThreads(threads, NOW);
    expect(card.headline).toBe("Hey, number (647) 989-5702 needs your attention");
    expect(card.headline).toBe(attentionHeadline(PHONE));
    expect(card.urgency).toBe("RED");
    expect(card.preview).toContain("can't park");
  });
});

describe("urgency", () => {
  it("marks a tow red and urgent", () => {
    const result = classifyUrgency([
      msg({ id: "1", direction: "inbound", body: "My car was towed", sentAt: "2026-11-19T17:00:00.000Z" }),
    ]);
    expect(result.urgency).toBe("RED");
    expect(result.urgent).toBe(true);
  });

  it("marks a refund yellow", () => {
    const result = classifyUrgency([
      msg({ id: "1", direction: "inbound", body: "I need a refund", sentAt: "2026-11-19T17:00:00.000Z" }),
    ]);
    expect(result.urgency).toBe("YELLOW");
  });

  it("marks thanks green", () => {
    const result = classifyUrgency([
      msg({ id: "1", direction: "inbound", body: "Thanks!", sentAt: "2026-11-19T17:00:00.000Z" }),
    ]);
    expect(result.urgency).toBe("GREEN");
    expect(result.urgent).toBe(false);
  });

  it("alerts only after five minutes, once the wait has crossed that line", () => {
    expect(shouldAlertForWait(4 * 60 * 1000)).toBe(false);
    expect(shouldAlertForWait(5 * 60 * 1000)).toBe(true);
    expect(shouldAlertForWait(11 * 60 * 1000)).toBe(true);
  });
});
