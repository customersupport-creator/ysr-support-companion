import { describe, expect, it } from "vitest";
import { INTRO_TEXT, clicksendFromEmail } from "../src/core/clicksend";
import { mergeMessages } from "../src/core/messages";
import { assessNeedsReply } from "../src/core/needsReply";
import { isGenuineAgentReply } from "../src/core/replies";
import { isStopKeyword } from "../src/core/safety";
import type { SmsMessage } from "../src/shared/types";
import { SUPPORT_LINE_E164 } from "../src/shared/constants";

const direct = (body: string, phone = "+13125550181") =>
  clicksendFromEmail({
    id: "direct-1",
    from: `"${phone}" <${phone}@sms.clicksend.com>`,
    subject: `SMS reply from ${phone}`,
    date: "2026-11-19T18:00:00.000Z",
    body: `You've received a reply from ${phone}:\n${body}\n\n--------------------------------------------------------------------------------\n\nOriginal Message on Thu, Nov 19, 2026 9:11 AM:\nHi! This is a sample outbound.`,
  });

describe("ClickSend email parsing", () => {
  it("reads the customer reply and ignores the original outbound", () => {
    const message = direct("The gate will not open.");
    expect(message?.fromPhone).toBe("+13125550181");
    expect(message?.body).toBe("The gate will not open.");
    expect(message?.source).toBe("clicksend");
    expect(message?.toPhone).toBe(SUPPORT_LINE_E164);
  });

  it("reads the Google Voice copy and collapses it with the ClickSend copy", () => {
    const voice = clicksendFromEmail({
      id: "voice-1",
      from: "CLICKSEND (SMS) <notice@txt.voice.google.com>",
      subject: "New text message from CLICKSEND (844) 429-4453",
      date: "2026-11-19T18:02:00.000Z",
      body: "SMS from +13125550181: The gate will not open.\nYOUR ACCOUNT\nThis email was sent to you because you asked for notifications.",
    });
    expect(voice?.body).toBe("The gate will not open.");
    const merged = mergeMessages(direct("The gate will not open.") ? [direct("The gate will not open.")!] : [], voice ? [voice] : []);
    expect(merged).toHaveLength(1);
  });

  it("does not treat the intro as a real reply, and does drop the item after a later reply", () => {
    const inbound = direct("Thanks!")!;
    const intro: SmsMessage = {
      ...inbound,
      id: "intro",
      direction: "outbound",
      body: INTRO_TEXT.replace("I’m", "I'm"),
      sentAt: "2026-11-19T18:01:00.000Z",
      fromPhone: SUPPORT_LINE_E164,
      toPhone: inbound.fromPhone,
      source: "ringcentral",
    };
    expect(isGenuineAgentReply(intro)).toBe(false);
    expect(assessNeedsReply([inbound, intro], Date.parse("2026-11-19T18:10:00.000Z"))?.message.id).toBe(inbound.id);
    const reply: SmsMessage = { ...intro, id: "real", body: "Spot 4 is open.", sentAt: "2026-11-19T18:05:00.000Z" };
    expect(assessNeedsReply([inbound, intro, reply], Date.parse("2026-11-19T18:10:00.000Z"))).toBeNull();
  });

  it("flags STOP and leaves a thanks text without an intro", () => {
    expect(isStopKeyword("STOP")).toBe(true);
    const thanks = direct("Thanks!", "+13125550182");
    expect(thanks?.body).toBe("Thanks!");
  });
});
