import { describe, expect, it } from "vitest";
import { shouldAlertForWait } from "../src/core/alerts";
import { DeskSession } from "../src/core/session";
import { DEMO_CONSENT, DEMO_FACILITIES, DEMO_PHONES, buildDemoMessages } from "../src/demo/fixtures";
import { PLAYBOOK_SOPS } from "../src/demo/playbookSops";

function sessionAt(now = new Date("2026-11-19T18:00:00.000Z")): DeskSession {
  const session = new DeskSession({
    now: () => now,
    sops: PLAYBOOK_SOPS,
    facilities: DEMO_FACILITIES,
    consent: DEMO_CONSENT,
  });
  session.setMessages(buildDemoMessages(now));
  return session;
}

describe("demo queue", () => {
  it("lists unanswered numbers and hides reactions, answered threads, and consent contacts", () => {
    const session = sessionAt();
    const ids = session.queue().map((card) => card.threadId);
    expect(ids).toContain(DEMO_PHONES.taken);
    expect(ids).toContain(DEMO_PHONES.towed);
    expect(ids).not.toContain(DEMO_PHONES.reactionDone);
    expect(ids).not.toContain(DEMO_PHONES.answered);
    expect(ids).not.toContain(DEMO_PHONES.consent);
    expect(session.flagged().some((card) => card.threadId === DEMO_PHONES.consent)).toBe(true);
    const taken = session.queue().find((card) => card.threadId === DEMO_PHONES.taken);
    expect(taken?.headline).toBe("Hey, number (647) 989-5702 needs your attention");
    expect(taken?.urgency).toBe("RED");
    expect(shouldAlertForWait(taken?.waitMs ?? 0)).toBe(true);
    const gate = session.queue().find((card) => card.threadId === DEMO_PHONES.gate);
    expect(gate).toBeTruthy();
    expect(shouldAlertForWait((gate?.waitMs ?? 60_000) - 60_000)).toBe(false);
  });

  it("looks up the SOP and facility without drafting a reply", () => {
    const session = sessionAt();
    session.select(DEMO_PHONES.taken);
    const view = session.threadView();
    expect(view?.matchedSops[0]?.sop.number).toBe(2);
    expect(view?.facility?.name).toContain("Raymond");
    expect(view?.reservation?.rentalId).toBe("SH-88421");
    expect(JSON.stringify(view)).not.toMatch(/APPROVE|suggestedReplies/);
  });

  it("shows a consent warning and no queue card for that number", () => {
    const session = sessionAt();
    session.select(DEMO_PHONES.consent);
    const view = session.threadView();
    expect(view?.consent?.reason).toMatch(/Do not text/);
    expect(view?.card).toBeNull();
  });
});
