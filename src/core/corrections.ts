import type { ChangeKind, Correction } from "../shared/types";

const TONE_WORDS = ["sorry", "please", "thanks", "hey", "happy", "glad", "ugh", "hear you"];

function factTokens(text: string): string {
  const nums = text.match(/\$?\d[\d.,]*/g) ?? [];
  const checks = text.match(/\[CHECK:[^\]]+\]/gi) ?? [];
  const urls = text.match(/https?:\/\/\S+/g) ?? [];
  return [...nums, ...checks, ...urls].map((token) => token.toLowerCase()).sort().join("|");
}

function toneTokens(text: string): string {
  const lower = text.toLowerCase();
  const hits = TONE_WORDS.filter((word) => lower.includes(word));
  const bangs = (text.match(/!/g) ?? []).length;
  return `${hits.join(",")}!${bangs}`;
}

export function classifyCorrection(before: string, after: string): ChangeKind[] {
  const kinds: ChangeKind[] = [];
  const delta = Math.abs(after.length - before.length);
  const ratio = delta / Math.max(before.length, 1);
  if (ratio >= 0.15 || delta >= 40) kinds.push("length");
  if (factTokens(before) !== factTokens(after)) kinds.push("facts");
  if (toneTokens(before) !== toneTokens(after)) kinds.push("tone");
  if (kinds.length === 0) kinds.push("tone");
  return kinds;
}

export function summarizeCorrections(items: Correction[]): string {
  if (items.length === 0) return "";
  const shorter = items.filter((item) => item.kinds.includes("length") && item.after.length < item.before.length).length;
  const longer = items.filter((item) => item.kinds.includes("length") && item.after.length > item.before.length).length;
  const tone = items.filter((item) => item.kinds.includes("tone")).length;
  const facts = items.filter((item) => item.kinds.includes("facts")).length;
  const lines: string[] = [];
  if (shorter > longer && shorter >= 2) lines.push("Prefers shorter replies.");
  else if (longer > shorter && longer >= 2) lines.push("Prefers longer replies.");
  if (tone >= 2) lines.push("Adds warmer wording.");
  if (facts >= 1) {
    lines.push("Often changes facts (codes, times, amounts, plates). Use only facts this agent has confirmed.");
  }
  if (lines.length === 0) lines.push("Has edited drafts before. Stay specific and keep it short.");
  return lines.join(" ");
}
