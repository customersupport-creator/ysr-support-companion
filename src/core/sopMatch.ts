import type { MatchedSop, SmsMessage, SopRecord } from "../shared/types";
import { isReactionMessage } from "./reactions";

export function keywordLines(raw: string): string[] {
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));
}

/** Match keywords are one phrase per line. Triggers may also be comma-separated short phrases. */
export function phrases(raw: string): string[] {
  const out: string[] = [];
  for (const line of keywordLines(raw)) {
    const parts = line
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);
    if (parts.length > 1 && parts.every((part) => part.length <= 48)) out.push(...parts);
    else out.push(line);
  }
  return out;
}

export function containsPhrase(haystack: string, phrase: string): boolean {
  const needle = phrase.trim().toLowerCase();
  if (!needle) return false;
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(?:^|[^a-z0-9])${escaped}(?=$|[^a-z0-9])`, "i");
  return re.test(haystack.toLowerCase());
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

/**
 * Score SOPs against the customer's latest genuine texts.
 * Match keywords (one per line) weigh more than trigger keywords.
 * SOPs with no match keywords are internal or outbound and are not auto-suggested.
 */
export function matchSops(messages: SmsMessage[], sops: SopRecord[], limit = 3): MatchedSop[] {
  const inbound = messages
    .filter((m) => m.direction === "inbound" && !isReactionMessage(m.body))
    .sort((a, b) => Date.parse(a.sentAt) - Date.parse(b.sentAt));
  const recent = inbound.slice(-6);
  if (recent.length === 0) return [];

  const scored: MatchedSop[] = [];
  for (const sop of sops) {
    if (/retired|archived|disabled/i.test(sop.status)) continue;
    const matchPhrases = phrases(sop.matchKeywords);
    if (matchPhrases.length === 0) continue;
    const triggerPhrases = phrases(sop.triggerKeywords);
    let score = 0;
    const hits: string[] = [];
    recent.forEach((message, index) => {
      const weight = index === recent.length - 1 ? 2 : 1;
      for (const phrase of matchPhrases) {
        if (containsPhrase(message.body, phrase)) {
          score += 3 * weight;
          hits.push(phrase);
        }
      }
      for (const phrase of triggerPhrases) {
        if (containsPhrase(message.body, phrase)) {
          score += 1 * weight;
          hits.push(phrase);
        }
      }
    });
    if (score > 0) scored.push({ sop, score, hits: unique(hits) });
  }

  scored.sort(
    (a, b) => b.score - a.score || b.hits.length - a.hits.length || a.sop.number - b.sop.number,
  );
  return scored.slice(0, limit);
}
