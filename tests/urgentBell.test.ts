import { describe, expect, it } from "vitest";
import { DeskSession } from "../src/core/session";
import { unseenUrgentCount, urgentTitle } from "../src/core/urgentBell";
import { buildDemoMessages } from "../src/demo/fixtures";
import { PLAYBOOK_SOPS } from "../src/demo/playbookSops";

describe("urgent bell", () => {
  it("counts unseen urgent threads, keeps them after mark seen, and drops them when resolved", () => {
    const session = new DeskSession({ sops: PLAYBOOK_SOPS, facilities: [], consent: [] });
    session.setMessages(buildDemoMessages(new Date()));
    const items = session.urgentItems();
    expect(items.length).toBeGreaterThanOrEqual(2);
    expect(session.unseenUrgentCount()).toBe(items.length);
    expect(unseenUrgentCount(session.queue(), [])).toBe(items.length);
    expect(urgentTitle(items[0].displayPhone)).toBe(`URGENT: ${items[0].displayPhone} needs your attention`);

    session.markUrgentSeen();
    expect(session.unseenUrgentCount()).toBe(0);
    expect(session.urgentItems()).toHaveLength(items.length);

    const target = items[0];
    session.resolve(target.threadId);
    expect(session.urgentItems().some((item) => item.threadId === target.threadId)).toBe(false);
    expect(session.unseenUrgentCount()).toBe(0);
  });
});
