import { describe, expect, it } from "vitest";
import { DeskSession } from "../src/core/session";
import { formatChicagoTime, isGenuineAgentReply, resolvedLabel } from "../src/core/replies";
import type { SmsMessage } from "../src/shared/types";
import { SUPPORT_LINE_E164 } from "../src/shared/constants";

const PHONE = "+13125550100";
const NOW = new Date("2026-11-19T18:10:00.000Z");

function sms(partial: Partial<SmsMessage> & Pick<SmsMessage, "id" | "direction" | "body" | "sentAt">): SmsMessage {
  return {
    threadId: PHONE,
    fromPhone: partial.direction === "outbound" ? SUPPORT_LINE_E164 : PHONE,
    toPhone: partial.direction === "outbound" ? PHONE : SUPPORT_LINE_E164,
    source: "demo",
    ...partial,
  };
}

function waitingSession(extra: SmsMessage[] = []): DeskSession {
  const session = new DeskSession({ now: () => NOW, facilities: [], sops: [], consent: [] });
  session.setMessages([
    sms({
      id: "in-1",
      direction: "inbound",
      body: "My car was towed and I'm stuck outside",
      sentAt: "2026-11-19T18:00:00.000Z",
    }),
    ...extra,
  ]);
  return session;
}

describe("auto-resolve on reply", () => {
  it("clears the queue and the urgent bell when a person replies", () => {
    const session = waitingSession();
    expect(session.queue()).toHaveLength(1);
    expect(session.urgentItems().length).toBeGreaterThan(0);
    const waiting = new Map(session.queue().map((card) => [card.customerPhone, card.lastCustomerMessageId]));
    session.upsertMessages([
      sms({
        id: "out-1",
        direction: "outbound",
        body: "I can see the spot. I'm checking it now.",
        sentAt: "2026-11-19T18:04:00.000Z",
        agentName: "Avery",
      }),
    ]);
    const created = session.autoResolveReplies(waiting);
    expect(session.queue()).toHaveLength(0);
    expect(session.urgentItems()).toHaveLength(0);
    expect(created).toHaveLength(1);
    expect(resolvedLabel(session.resolvedToday()[0])).toBe("Auto-resolved: replied by Avery at 12:04 PM CT");
  });

  it("does not treat a reaction as a reply", () => {
    const session = waitingSession();
    const waiting = new Map(session.queue().map((card) => [card.customerPhone, card.lastCustomerMessageId]));
    const reaction = sms({
      id: "react",
      direction: "outbound",
      body: "Liked “Someone is in my spot and I can't park”",
      sentAt: "2026-11-19T18:02:00.000Z",
    });
    expect(isGenuineAgentReply(reaction)).toBe(false);
    session.upsertMessages([reaction]);
    expect(session.autoResolveReplies(waiting)).toHaveLength(0);
    expect(session.queue()).toHaveLength(1);
  });

  it("does not treat a failed send or an auto-reply as a reply", () => {
    const session = waitingSession();
    const waiting = new Map(session.queue().map((card) => [card.customerPhone, card.lastCustomerMessageId]));
    session.upsertMessages([
      sms({
        id: "fail",
        direction: "outbound",
        body: "On my way.",
        sentAt: "2026-11-19T18:02:00.000Z",
        messageStatus: "DeliveryFailed",
      }),
      sms({
        id: "bot",
        direction: "outbound",
        body: "This is an automated message. We are currently closed.",
        sentAt: "2026-11-19T18:03:00.000Z",
      }),
    ]);
    expect(session.autoResolveReplies(waiting)).toHaveLength(0);
    expect(session.queue()).toHaveLength(1);
  });

  it("reopens the queue when the customer texts again", () => {
    const session = waitingSession();
    const waiting = new Map(session.queue().map((card) => [card.customerPhone, card.lastCustomerMessageId]));
    session.upsertMessages([
      sms({
        id: "out-1",
        direction: "outbound",
        body: "Spot is yours now.",
        sentAt: "2026-11-19T18:04:00.000Z",
        agentName: "Avery",
      }),
    ]);
    session.autoResolveReplies(waiting);
    expect(session.queue()).toHaveLength(0);
    session.upsertMessages([
      sms({
        id: "in-2",
        direction: "inbound",
        body: "Someone pulled into it again.",
        sentAt: "2026-11-19T18:08:00.000Z",
      }),
    ]);
    expect(session.queue().map((card) => card.lastCustomerMessageId)).toEqual(["in-2"]);
    expect(session.resolvedToday()).toHaveLength(0);
  });

  it("labels a manual resolve differently and formats Chicago time", () => {
    const session = waitingSession();
    const record = session.resolve(PHONE);
    expect(record?.kind).toBe("manual");
    expect(resolvedLabel(record!)).toBe("Resolved manually");
    expect(formatChicagoTime("2026-11-19T20:00:00.000Z")).toBe("2:00 PM CT");
  });
});
