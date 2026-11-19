import type { SopRecord } from "../shared/types";

/** Stems from the playbook SOP titles. A table row that shares none of them has been renamed or renumbered. */
const NAME_STEMS: Record<number, string[]> = {
  1: ["contact", "missed", "spothero"],
  2: ["spot", "taken", "full"],
  3: ["blocked", "tight"],
  4: ["find", "direction"],
  5: ["refund"],
  6: ["date", "back"],
  7: ["relocation", "internal"],
  8: ["lot change", "notice"],
  9: ["closing", "close"],
  10: ["line"],
  11: ["access", "gate", "code"],
  12: ["monthly", "fob"],
  13: ["tow"],
  14: ["overstay"],
  15: ["extension", "extend"],
  16: ["angry", "find"],
  17: ["partial", "refund"],
  18: ["plate", "license"],
  19: ["right spot", "spot"],
  20: ["renew", "payment", "monthly"],
  21: ["operator", "relocation", "maintenance"],
  22: ["rule", "price", "notice"],
  23: ["damage", "injury"],
  24: ["delay", "compensation"],
  25: ["hostile", "chargeback", "bot", "privacy"],
  26: ["oversize", "size", "vehicle"],
};

function violatesHardRule(blob: string): boolean {
  return /admit (fault|liability)|our fault|we (caused|are liable)|tow was invalid|the tow was illegal|we will (definitely )?reimburse/.test(
    blob,
  );
}

/**
 * When an Airtable SOP disagrees with the playbook, callers follow the table
 * and surface a note telling Hazel. Playbook-fallback rows never disagree with themselves.
 */
export function disagreementNotes(sop: SopRecord): string[] {
  if (sop.source !== "airtable") return [];
  const notes: string[] = [];
  const blob = `${sop.name}\n${sop.steps}\n${sop.suggestedReplies}\n${sop.notes}`.toLowerCase();
  if (violatesHardRule(blob)) {
    notes.push(
      `Tell Hazel: Airtable SOP ${sop.number} (${sop.name}) conflicts with a playbook hard rule. The draft follows the table. Do not send an admission of fault or a reimbursement promise unless you typed that text yourself.`,
    );
  }
  const stems = NAME_STEMS[sop.number];
  if (stems && sop.name.trim() && !stems.some((stem) => sop.name.toLowerCase().includes(stem))) {
    notes.push(
      `Tell Hazel: Airtable SOP ${sop.number} is named "${sop.name}", which does not match the playbook title for that number. Following the table.`,
    );
  }
  return notes;
}

export function collectDisagreementNotes(sops: SopRecord[]): string[] {
  const notes: string[] = [];
  for (const sop of sops) notes.push(...disagreementNotes(sop));
  return [...new Set(notes)];
}
