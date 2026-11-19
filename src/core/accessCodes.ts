import type { AccessCodeEntry, FacilityAccess } from "../shared/types";

export interface AccessParseInput {
  notes?: string;
  towingCompany?: string;
  extra?: string;
}

interface FoundCode {
  label: string;
  code: string;
  index: number;
  hash: boolean;
}

const PLACEHOLDER = /^(?:1234|4321|1212|0000|1111|2222|3333|4444|5555|6666|7777|8888|9999)$/;

function normalize(text: string): string {
  return text
    .replace(/[\u2018\u2019\u2032]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/\u00a0/g, " ");
}

function collapseDigits(token: string): string | null {
  const trimmed = token.trim();
  if (/^(?:\d[\s\-]){2,7}\d$/.test(trimmed)) return trimmed.replace(/[\s\-]/g, "");
  if (/^\d{3,8}$/.test(trimmed)) return trimmed;
  return null;
}

function labelNear(before: string): string {
  const window = before.slice(-120).toLowerCase();
  const ranked: Array<{ index: number; label: string }> = [];
  const consider = (pattern: RegExp, label: string | ((match: RegExpMatchArray) => string)) => {
    for (const match of window.matchAll(pattern)) {
      ranked.push({ index: match.index ?? 0, label: typeof label === "string" ? label : label(match) });
    }
  };
  consider(/backup lockbox/g, "backup lockbox");
  consider(/lockbox/g, "lockbox");
  consider(/pedestrian/g, "pedestrian");
  consider(/main gate|\bmain\b/g, "main");
  consider(/\bleft\b/g, "left");
  consider(/\bmiddle\b/g, "middle");
  consider(/\bright\b/g, "right");
  consider(/garage\s*#?\s*(\d+)/g, (match) => `Garage ${match[1]}`);
  consider(/\bp\s*(\d+)\b/g, (match) => `P${match[1]}`);
  ranked.sort((a, b) => a.index - b.index);
  return ranked.length ? ranked[ranked.length - 1].label : "";
}

function pushCode(found: FoundCode[], label: string, raw: string, index: number, hash: boolean): void {
  const code = collapseDigits(raw.replace(/#/g, ""));
  if (!code) return;
  if (found.some((item) => item.code === code && item.label === label)) return;
  found.push({ label, code, index, hash });
}

function collectCodes(notes: string): FoundCode[] {
  const flat = notes.replace(/\s+/g, " ");
  const found: FoundCode[] = [];
  const patterns: RegExp[] = [
    /(?:code|keypad|passcode|combo(?:\s+lock)?|combination|press)\b[^.]{0,60}?([#]?\s*(?:\d[\s\-]){2,7}\d\s*#?|[#]?\s*\d{3,8}\s*#?)/gi,
    /([#]?(?:\d[\s\-]){2,7}\d#?|[#]?\d{3,8}#?)\s*(?:then\s+)?(?:press\s+)?(?:enter|garage|gate)?\s*code/gi,
    /\b(left|middle|right|main|pedestrian|backup lockbox|lockbox|garage\s*#?\s*\d+|p\s*\d+)\b[^.]{0,48}?([#]?(?:\d[\s\-]){2,7}\d|[ #]?\d{3,8}#?)/gi,
    /\bor\s+#?(\d{3,8})\b/gi,
  ];
  for (const pattern of patterns) {
    for (const match of flat.matchAll(pattern)) {
      const raw = match[2] && /[0-9]/.test(match[2]) ? match[2] : match[1];
      if (!raw || !/[0-9]/.test(raw)) continue;
      if (/^or\s+/i.test(match[0]) && !/code|keypad|lockbox|passcode/i.test(flat.slice(Math.max(0, (match.index ?? 0) - 40), match.index ?? 0))) {
        continue;
      }
      const index = (match.index ?? 0) + match[0].lastIndexOf(raw.trim().charAt(0));
      const before = notes.slice(Math.max(0, (match.index ?? 0) - 80), match.index ?? 0) + match[0].slice(0, match[0].indexOf(raw));
      const hash = /#$/.test(raw.trim()) || /press\s*#/i.test(match[0]);
      const labeled = match[2] && match[1] && !/^\d/.test(match[1]) ? labelNear(`${match[1]} `) : labelNear(before);
      pushCode(found, labeled, raw, index, hash);
    }
  }
  return found.sort((a, b) => a.index - b.index);
}

function rejectFalseCodes(notes: string, found: FoundCode[]): FoundCode[] {
  return found.filter((item) => {
    const around = notes.slice(Math.max(0, item.index - 24), item.index + item.code.length + 24);
    if (/\$\s*\d/.test(around) && !/code/i.test(around)) return false;
    if (/\d{1,2}\/\d{1,2}/.test(around) && item.code.length <= 4 && !/code|keypad|lockbox|passcode/i.test(around)) {
      return false;
    }
    if (/\b(minutes?|seconds?)\b/i.test(around) && !/code|keypad|lockbox|passcode/i.test(around)) return false;
    return true;
  });
}

function instructionsFor(notes: string, hash: boolean): string {
  const lines = notes
    .split(/\n+/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const kept = lines.filter((line) => {
    if (/^(garage|gate|keypad|lockbox|combo|combination|access|permanent)?\s*codes?\b[^a-z0-9]{0,8}[#(]?\d/i.test(line) && line.length < 48) {
      return false;
    }
    return /enter|press|arrow|fob|door|exit|option|button|pedestrian|backup|then\b|twice|automatic|lockbox|key\b|#/i.test(line);
  });
  const extra = hash ? "Press # after the code." : "";
  const text = [...kept, extra].filter(Boolean).join(" ");
  return text.length > 360 ? `${text.slice(0, 357).trimEnd()}…` : text;
}

function accessType(notes: string, labels: string[]): string {
  const lockbox = /lockbox/i.test(notes);
  const fob = /fob/i.test(notes);
  const gate = /\bgate\b/i.test(notes);
  const garage = /garage/i.test(notes);
  const keypad = /keypad/i.test(notes);
  const combo = /combo|combination/i.test(notes);
  const padlock = /padlock/i.test(notes);
  const passcode = /passcode/i.test(notes);
  const doors = ["left", "middle", "right"].every((label) => labels.includes(label));
  if (lockbox && fob) return "lockbox holding fob";
  if (garage && keypad && lockbox) return "garage keypad + backup lockbox";
  if (labels.includes("main") && labels.includes("pedestrian")) return "main gate + pedestrian gate";
  if (doors) return "garage keypads (3 doors)";
  if (combo && garage) return "combination lock / garage";
  if (combo) return "combo lock";
  if (padlock && gate) return "gate padlock";
  if (gate && keypad) return "gate keypad";
  if (lockbox) return "lockbox";
  if (keypad && garage) return "garage keypad";
  if (passcode) return "lot passcode";
  if (gate) return "gate";
  if (/code:\s*enter/i.test(notes) && !garage) return "lot code";
  if (garage) return "garage";
  return "access code";
}

function confidenceFor(notes: string, codes: AccessCodeEntry[]): "high" | "medium" {
  if (/\b\d{3,8}\s+or\s+#?\d{3,8}\b/i.test(notes)) return "medium";
  if (codes.length === 1 && PLACEHOLDER.test(codes[0].code)) return "medium";
  return "high";
}

/** Parse access codes out of facility notes. Real notes stay out of the repo; this is the rule set. */
export function parseFacilityAccess(input: AccessParseInput): FacilityAccess | null {
  const notes = normalize(input.notes ?? "");
  const context = normalize(`${input.towingCompany ?? ""}\n${input.extra ?? ""}`);
  const found = rejectFalseCodes(notes, collectCodes(notes));
  if (found.length === 0) {
    if (/coded\s+garage/i.test(`${notes}\n${context}`)) {
      return {
        accessType: "coded garage",
        codes: [],
        instructions: "Coded garage, no code on file.",
        confidence: "high",
        codedGarageNoCode: true,
      };
    }
    return null;
  }
  const codes = found.map((item) => ({ label: item.label, code: item.code }));
  return {
    accessType: accessType(notes, codes.map((item) => item.label)),
    codes,
    instructions: instructionsFor(notes, found.some((item) => item.hash) || /press\s*#/i.test(notes)),
    confidence: confidenceFor(notes, codes),
    codedGarageNoCode: false,
  };
}
