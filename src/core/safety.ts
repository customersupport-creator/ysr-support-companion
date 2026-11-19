import type { ConsentWarning } from "../shared/types";
import { toE164 } from "./format";

const FENCE_OPEN = "<untrusted_customer_text>";
const FENCE_CLOSE = "</untrusted_customer_text>";

/** Wrap customer text so a model treats it as data, not as instructions. */
export function fenceCustomerText(body: string): string {
  const stripped = body.replace(/<\/?untrusted_customer_text>/gi, "");
  return `${FENCE_OPEN}\n${stripped}\n${FENCE_CLOSE}`;
}

export function isStopKeyword(body: string): boolean {
  return /^(stop|stopall|unsubscribe|stop texting)[.!]?\s*$/i.test(body.trim());
}

export function consentFor(phone: string, list: ConsentWarning[]): ConsentWarning | null {
  const target = toE164(phone);
  return list.find((item) => toE164(item.phone) === target) ?? null;
}

export interface ScrubResult {
  text: string;
  violations: string[];
}

/**
 * Last-line filter for generated drafts. MINE text is never passed through here.
 * An amount the agent typed in EDIT is allowed; a promise the model invented is not.
 */
export function scrubGeneratedDraft(text: string): ScrubResult {
  let next = text;
  const violations: string[] = [];
  const rules: Array<{ re: RegExp; replace: string; violation: string }> = [
    {
      re: /\b(?:\d[ -]*?){13,19}\b/g,
      replace: "[CHECK: do not collect card numbers]",
      violation: "card number",
    },
    {
      re: /\bwe admit (?:fault|liability)\b/gi,
      replace: "we're reviewing what happened",
      violation: "fault admission",
    },
    {
      re: /\b(?:it is |it's |this is )?our fault\b/gi,
      replace: "we're reviewing what happened",
      violation: "fault admission",
    },
    {
      re: /\bthe tow was invalid\b/gi,
      replace: "we're reviewing the tow",
      violation: "tow validity",
    },
    {
      re: /\bwe will reimburse you\b/gi,
      replace: "we'll review whether a reimbursement applies",
      violation: "reimbursement promise",
    },
    {
      re: /\b(?:refund|reimburse) you \$\d+(?:\.\d{2})?\b/gi,
      replace: "review the refund ([CHECK: refund amount])",
      violation: "promised amount",
    },
  ];
  for (const rule of rules) {
    if (rule.re.test(next)) {
      violations.push(rule.violation);
      rule.re.lastIndex = 0;
      next = next.replace(rule.re, rule.replace);
    }
  }
  return { text: next, violations };
}
