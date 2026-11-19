import { describe, expect, it } from "vitest";
import { findCommitments } from "../src/core/commitments";
import { buildFacilityAlerts } from "../src/core/facilityAlerts";
import { openFollowUps } from "../src/core/followUps";
import type { SmsMessage } from "../src/shared/types";

const PHONE = "+13125550222";
const NOW = new Date("2026-11-19T18:00:00.000Z");

function sms(partial: Partial<SmsMessage> & Pick<SmsMessage, "id" | "direction" | "body" | "sentAt">): SmsMessage {
  return {
    threadId: PHONE,
    fromPhone: partial.direction === "outbound" ? "+13129995161" : PHONE,
    toPhone: partial.direction === "outbound" ? PHONE : "+13129995161",
    source: "demo",
    ...partial,
  };
}

describe("follow-up reminders", () => {
  const inbound = sms({ id: "in", direction: "inbound", body: "Any update?", sentAt: "2026-11-19T17:30:00.000Z" });
  const promise = sms({
    id: "promise",
    direction: "outbound",
    body: "Checking on it.",
    sentAt: "2026-11-19T17:40:00.000Z",
    agentName: "Avery",
  });

  it("is due 15 minutes after a promise and names who said it", () => {
    const [item] = openFollowUps({
      threads: [{ phone: PHONE, messages: [inbound, promise] }],
      now: NOW,
      standardMinutes: 15,
      endorseMinutes: 30,
      overrides: [],
      manuallyResolvedPhones: new Set(),
    });
    expect(item?.state).toBe("due");
    expect(item?.toast).toBe('Follow-up due: (312) 555-0222, Avery said "Checking on it." 20 min ago');
  });

  it("waits 30 minutes for an endorse promise and ignores a reaction", () => {
    const endorse = sms({
      id: "end",
      direction: "outbound",
      body: "I will endorse this for processing.",
      sentAt: "2026-11-19T17:40:00.000Z",
    });
    const reaction = sms({
      id: "tap",
      direction: "outbound",
      body: "Liked “Any update?”",
      sentAt: "2026-11-19T17:55:00.000Z",
    });
    const [item] = openFollowUps({
      threads: [{ phone: PHONE, messages: [inbound, endorse, reaction] }],
      now: NOW,
      standardMinutes: 15,
      endorseMinutes: 30,
      overrides: [],
      manuallyResolvedPhones: new Set(),
    });
    expect(item?.kind).toBe("endorse");
    expect(item?.state).toBe("pending");
  });

  it("clears when a later real outbound is sent, when snoozed, or when the thread was resolved", () => {
    const later = sms({ id: "later", direction: "outbound", body: "The spot is open.", sentAt: "2026-11-19T17:50:00.000Z" });
    expect(
      openFollowUps({
        threads: [{ phone: PHONE, messages: [inbound, promise, later] }],
        now: NOW,
        standardMinutes: 15,
        endorseMinutes: 30,
        overrides: [],
        manuallyResolvedPhones: new Set(),
      }),
    ).toEqual([]);
    const snoozed = openFollowUps({
      threads: [{ phone: PHONE, messages: [inbound, promise] }],
      now: NOW,
      standardMinutes: 15,
      endorseMinutes: 30,
      overrides: [{ id: "promise", snoozeUntil: "2026-11-19T18:30:00.000Z" }],
      manuallyResolvedPhones: new Set(),
    });
    expect(snoozed[0]?.state).toBe("snoozed");
    expect(
      openFollowUps({
        threads: [{ phone: PHONE, messages: [inbound, promise] }],
        now: NOW,
        standardMinutes: 15,
        endorseMinutes: 30,
        overrides: [{ id: "promise", doneAt: NOW.toISOString() }],
        manuallyResolvedPhones: new Set(),
      }),
    ).toEqual([]);
    expect(
      openFollowUps({
        threads: [{ phone: PHONE, messages: [inbound, promise] }],
        now: NOW,
        standardMinutes: 15,
        endorseMinutes: 30,
        overrides: [],
        manuallyResolvedPhones: new Set([PHONE]),
      }),
    ).toEqual([]);
  });
});

describe("commitments", () => {
  it("keeps the written amount and only suggests Done", () => {
    const items = findCommitments({
      now: NOW,
      overrides: [],
      threads: [
        {
          phone: "+17735550111",
          facilityName: "500 Wabash Lot",
          messages: [
            sms({
              id: "ask",
              direction: "inbound",
              body: "Please refund $18 to Zelle. Name: Pat",
              sentAt: "2026-11-17T12:00:00.000Z",
              threadId: "+17735550111",
              fromPhone: "+17735550111",
            }),
          ],
        },
        {
          phone: "+17735550112",
          facilityName: "",
          messages: [
            sms({
              id: "ask2",
              direction: "inbound",
              body: "I need a refund",
              sentAt: "2026-11-15T12:00:00.000Z",
              threadId: "+17735550112",
              fromPhone: "+17735550112",
            }),
            sms({
              id: "sent",
              direction: "outbound",
              body: "Your refund was sent.",
              sentAt: "2026-11-16T12:00:00.000Z",
              threadId: "+17735550112",
              agentName: "Avery",
            }),
          ],
        },
      ],
    });
    const amber = items.find((item) => item.phone === "+17735550111");
    expect(amber?.amount).toBe("$18");
    expect(amber?.customerName).toBe("Pat");
    expect(amber?.status).toBe("open");
    expect(amber?.ageTone).toBe("amber");
    const suggested = items.find((item) => item.phone === "+17735550112");
    expect(suggested?.suggestDone).toBe(true);
    expect(suggested?.status).toBe("open");
    expect(suggested?.ageTone).toBe("red");
  });
});

describe("facility alerts", () => {
  function report(phone: string, at: string): SmsMessage {
    return sms({
      id: `m-${phone}`,
      direction: "inbound",
      body: "The gate code isn't working at 17 Raymond and I can't get in.",
      sentAt: at,
      threadId: phone,
      fromPhone: phone,
    });
  }

  const threads = ["+13125550301", "+13125550302", "+16475550110"].map((phone, index) => ({
    phone,
    facilityName: "17 Raymond St. - Spot #4 or 5 Only",
    facilityRecordId: "recRAY17",
    access: null,
    messages: [report(phone, `2026-11-19T${16 + index}:10:00.000Z`)],
  }));

  it("raises an alert at three customers and stays quiet at two", () => {
    const raised = buildFacilityAlerts({
      threads,
      now: NOW,
      customers: 3,
      windowHours: 3,
      dismissals: [],
    });
    expect(raised.active).toHaveLength(1);
    expect(raised.active[0]?.toast).toMatch(/Facility alert: 17 Raymond St\. - 3 customers report gate code not working/);
    expect(raised.active[0]?.urgent).toBe(true);
    const quiet = buildFacilityAlerts({
      threads: threads.slice(0, 2),
      now: NOW,
      customers: 3,
      windowHours: 3,
      dismissals: [],
    });
    expect(quiet.active).toHaveLength(0);
    expect(quiet.counts[0]?.customers).toBe(2);
  });

  it("re-alerts when a new report arrives after dismissal", () => {
    const id = "17 raymond st. - spot #4 or 5 only|inaccessible";
    const hidden = buildFacilityAlerts({
      threads,
      now: NOW,
      customers: 3,
      windowHours: 3,
      dismissals: [{ id, messageIds: threads.map((thread) => `m-${thread.phone}`), at: NOW.toISOString() }],
    });
    expect(hidden.active).toHaveLength(0);
    const extra = {
      ...threads[0],
      messages: [
        ...threads[0].messages,
        sms({
          id: "new-report",
          direction: "inbound",
          body: "Still can't get in at 17 Raymond. The keypad won't open.",
          sentAt: "2026-11-19T17:50:00.000Z",
          threadId: threads[0].phone,
          fromPhone: threads[0].phone,
        }),
      ],
    };
    const again = buildFacilityAlerts({
      threads: [extra, threads[1], threads[2]],
      now: NOW,
      customers: 3,
      windowHours: 3,
      dismissals: [{ id, messageIds: threads.map((thread) => `m-${thread.phone}`), at: NOW.toISOString() }],
    });
    expect(again.active).toHaveLength(1);
  });
});
