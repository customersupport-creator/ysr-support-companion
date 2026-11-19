import { describe, expect, it } from "vitest";
import { DeskSession } from "../src/core/session";
import { SUPPORT_LINE_E164 } from "../src/shared/constants";
import type { SmsMessage } from "../src/shared/types";

const PHONE = "+16479895702";
const NOW = new Date("2026-11-19T18:00:00.000Z");

function inbound(id: string, minutesAgo: number): SmsMessage {
  return {
    id,
    threadId: PHONE,
    direction: "inbound",
    body: "Someone is in my spot",
    sentAt: new Date(NOW.getTime() - minutesAgo * 60_000).toISOString(),
    fromPhone: PHONE,
    toPhone: SUPPORT_LINE_E164,
    source: "demo",
  };
}

describe("resolve and reopen", () => {
  it("removes the number until a newer customer message arrives", () => {
    let clock = NOW;
    const session = new DeskSession({ now: () => clock });
    session.setMessages([inbound("m1", 8)]);
    expect(session.queue().map((card) => card.threadId)).toEqual([PHONE]);

    const record = session.resolve(PHONE);
    expect(record?.lastCustomerMessageId).toBe("m1");
    expect(session.queue()).toEqual([]);
    expect(session.resolvedToday()).toHaveLength(1);

    session.setMessages([inbound("m1", 8)]);
    expect(session.queue()).toEqual([]);

    session.upsertMessages([inbound("m2", 1)]);
    expect(session.queue().map((card) => card.lastCustomerMessageId)).toEqual(["m2"]);
    expect(session.resolvedToday()).toEqual([]);
  });

  it("un-resolve puts the same message back in the queue", () => {
    const session = new DeskSession({ now: () => NOW });
    session.setMessages([inbound("m1", 8)]);
    session.resolve(PHONE);
    session.unresolve(PHONE);
    expect(session.queue()[0]?.lastCustomerMessageId).toBe("m1");
  });

  it("does not list a resolve from yesterday as resolved today", () => {
    const yesterday = new Date("2026-11-18T18:00:00.000Z");
    let clock = yesterday;
    const session = new DeskSession({ now: () => clock });
    session.setMessages([inbound("m1", 8)]);
    session.resolve(PHONE);
    clock = NOW;
    expect(session.resolvedToday()).toEqual([]);
    expect(session.queue()).toEqual([]);
  });
});
