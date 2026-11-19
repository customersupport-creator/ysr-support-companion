import { describe, expect, it } from "vitest";
import type { SmsMessage, SopRecord } from "../src/shared/types";
import { containsPhrase, matchSops } from "../src/core/sopMatch";
import { PLAYBOOK_SOPS } from "../src/demo/playbookSops";

function inbound(body: string): SmsMessage {
  return {
    id: "1",
    threadId: "+13125550100",
    direction: "inbound",
    body,
    sentAt: "2026-11-19T17:00:00.000Z",
    fromPhone: "+13125550100",
    toPhone: "+13129995161",
    source: "demo",
  };
}

describe("SOP keyword matching", () => {
  it("matches a tow to SOP 13 and not a direction word like toward", () => {
    const tow = matchSops([inbound("My car was towed from the lot")], PLAYBOOK_SOPS);
    expect(tow[0]?.sop.number).toBe(13);
    expect(containsPhrase("toward the entrance", "tow")).toBe(false);
    expect(containsPhrase("they towed the car", "tow")).toBe(false);
    expect(containsPhrase("they towed the car", "towed")).toBe(true);
    expect(containsPhrase("call a tow", "tow")).toBe(true);
  });

  it("matches a gate code problem to SOP 11", () => {
    const matched = matchSops([inbound("The gate code doesn't work and I can't get in")], PLAYBOOK_SOPS);
    expect(matched[0]?.sop.number).toBe(11);
  });

  it("matches a refund to SOP 5", () => {
    const matched = matchSops([inbound("I need a refund for this reservation")], PLAYBOOK_SOPS);
    expect(matched[0]?.sop.number).toBe(5);
  });

  it("matches each match-keyword line on its own, case insensitive", () => {
    const sop = PLAYBOOK_SOPS.find((item) => item.number === 13);
    expect(sop?.matchKeywords.split("\n").length).toBeGreaterThan(1);
    const matched = matchSops([inbound("The IMPOUND lot has my car")], PLAYBOOK_SOPS);
    expect(matched.some((item) => item.sop.number === 13)).toBe(true);
    expect(matched.find((item) => item.sop.number === 13)?.hits).toContain("impound");
  });

  it("does not auto-suggest an internal SOP with empty match keywords", () => {
    const internal = PLAYBOOK_SOPS.find((item) => item.number === 7) as SopRecord;
    expect(internal.matchKeywords.trim()).toBe("");
    const matched = matchSops([inbound("please do the internal relocation and create IE")], [internal]);
    expect(matched).toEqual([]);
  });

  it("does not let a short keyword match inside a longer word", () => {
    const onlyTow: SopRecord = {
      number: 99,
      name: "Tow word",
      triggerKeywords: "",
      matchKeywords: "tow",
      lookups: "",
      steps: "",
      escalateTo: "",
      notes: "",
      status: "Active",
      source: "playbook",
    };
    expect(matchSops([inbound("head toward the tower")], [onlyTow])).toEqual([]);
    expect(matchSops([inbound("call a tow")], [onlyTow])[0]?.sop.number).toBe(99);
  });
});
