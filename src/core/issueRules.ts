import type { IssueCategory } from "../shared/types";

export interface IssueRule {
  id: IssueCategory;
  label: string;
  color: string;
  pattern: RegExp;
}

/**
 * One rule list for past-issue tags. Patterns overlap the urgency keywords
 * where the playbook already treats the same words as urgent or yellow.
 */
export const ISSUE_RULES: IssueRule[] = [
  {
    id: "safety",
    label: "Safety",
    color: "#B91C1C",
    pattern: /\b(unsafe|injury|injured|hurt|accident|threat|threatened)\b/i,
  },
  {
    id: "towed",
    label: "Towed",
    color: "#B91C1C",
    pattern: /\b(towed|towing|tow truck|impound|booted|boot)\b/i,
  },
  {
    id: "damage",
    label: "Damage",
    color: "#9A3412",
    pattern: /\b(damage|damaged|scratched|dent|broken)\b/i,
  },
  {
    id: "inaccessible",
    label: "Inaccessible",
    color: "#5196A9",
    pattern:
      /\b(can'?t access|cannot access|can'?t get in|cannot get in|won'?t open|will not open|doesn'?t open|code (didn'?t|does not|doesn'?t) work|locked|chain|construction|blocked|keypad)\b/i,
  },
  {
    id: "lot-full",
    label: "Lot full",
    color: "#92400E",
    pattern: /\b(lot (?:is |was )?full|spot taken|someone (?:is |was )?in my spot|no spots|all spots taken|can'?t park|cannot park)\b/i,
  },
  {
    id: "ticket",
    label: "Ticket",
    color: "#7C3AED",
    pattern: /\b(ticket|citation|parking ticket)\b/i,
  },
  {
    id: "refund",
    label: "Refund",
    color: "#0F766E",
    pattern: /\b(refund|reimburse|reimbursement|money back)\b/i,
  },
  {
    id: "overcharge",
    label: "Overcharge",
    color: "#B45309",
    pattern: /\b(overcharge|double charg|charged twice|extension|extend)\b/i,
  },
  {
    id: "pass",
    label: "Pass",
    color: "#0369A1",
    pattern: /\b(parking pass|permit|display pass|hangtag|hang tag|qr code)\b/i,
  },
  {
    id: "directions",
    label: "Directions",
    color: "#4B5563",
    pattern: /\b(can'?t find|cannot find|where (is|do i)|how do i get|directions|lost)\b/i,
  },
];
