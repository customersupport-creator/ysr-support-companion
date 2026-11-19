import type { CustomerMood, DraftBundle, DraftOption, DraftOptionId } from "../../shared/types";
import { buildDraftSystemPrompt, buildDraftUserPayload } from "../../core/prompt";
import { matchSops } from "../../core/sopMatch";
import { collectDisagreementNotes } from "../../core/disagreement";
import { scrubGeneratedDraft } from "../../core/safety";
import { classifyUrgency } from "../../core/urgency";
import type { DraftInput, Drafter } from "../../core/draftTypes";

const MOODS: CustomerMood[] = ["calm", "confused", "worried", "frustrated", "angry"];

export function createLlmDrafter(options: {
  provider: "anthropic" | "openai";
  apiKey: string;
  model: string;
  playbook: string;
  fetchImpl?: typeof fetch;
}): Drafter {
  const fetchImpl = options.fetchImpl ?? fetch;
  return {
    async draft(input: DraftInput): Promise<DraftBundle> {
      const matched = matchSops(input.thread.messages, input.sops);
      const system = buildDraftSystemPrompt(options.playbook, input.correctionSummary);
      const user = buildDraftUserPayload(input, matched);
      const raw =
        options.provider === "openai"
          ? await openAi(fetchImpl, options.apiKey, options.model, system, user)
          : await anthropic(fetchImpl, options.apiKey, options.model, system, user);
      return bundleFromModel(input, matched, raw, options.provider);
    },
  };
}

async function anthropic(
  fetchImpl: typeof fetch,
  apiKey: string,
  model: string,
  system: string,
  user: string,
): Promise<string> {
  const response = await fetchImpl("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 1800,
      system,
      messages: [{ role: "user", content: user }],
    }),
  });
  if (!response.ok) throw new Error(`Anthropic request failed (${response.status}).`);
  const json = (await response.json()) as { content?: Array<{ text?: string }> };
  const text = json.content?.map((part) => part.text ?? "").join("\n").trim();
  if (!text) throw new Error("Anthropic returned an empty draft.");
  return text;
}

async function openAi(
  fetchImpl: typeof fetch,
  apiKey: string,
  model: string,
  system: string,
  user: string,
): Promise<string> {
  const response = await fetchImpl("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.4,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  if (!response.ok) throw new Error(`OpenAI request failed (${response.status}).`);
  const json = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const text = json.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error("OpenAI returned an empty draft.");
  return text;
}

function bundleFromModel(
  input: DraftInput,
  matched: ReturnType<typeof matchSops>,
  raw: string,
  provider: "anthropic" | "openai",
): DraftBundle {
  const parsed = parseJson(raw);
  const urgency = classifyUrgency(input.thread.messages);
  const violations: string[] = [];
  const options = normalizeOptions(parsed.options, violations);
  if (options.length < 2) throw new Error("The model did not return two reply options.");
  const mood = MOODS.includes(parsed.mood as CustomerMood) ? (parsed.mood as CustomerMood) : "worried";
  const notes = collectDisagreementNotes(matched.map((item) => item.sop));
  if (typeof parsed.disagreementNote === "string" && parsed.disagreementNote.trim().toLowerCase().startsWith("tell hazel")) {
    notes.push(parsed.disagreementNote.trim());
  }
  const sopNumbers = matched.map((item) => item.sop.number);
  return {
    threadId: input.thread.id,
    basedOnMessageId: input.latestCustomerMessageId,
    concern: String(parsed.concern || "The model did not summarize the concern.").slice(0, 600),
    mood,
    reservation: input.reservation,
    facilityName: input.facility?.name ?? null,
    matchedSops: matched,
    disagreementNotes: [...new Set(notes)],
    sopNote: sopNumbers.length ? `Using SOP ${sopNumbers.join(" and ")}.` : "No keyword match.",
    options,
    agentQuestion: String(parsed.agentQuestion || ""),
    urgent: Boolean(parsed.urgent) || urgency.urgent || sopNumbers.some((n) => n === 13 || n === 23 || n === 25),
    escalate: Boolean(parsed.escalate) || urgency.urgent,
    createdAt: input.nowIso,
    engine: provider,
  };
}

function normalizeOptions(value: unknown, violations: string[]): DraftOption[] {
  if (!Array.isArray(value)) return [];
  const options: DraftOption[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const id = String((item as { id?: string }).id || "").toUpperCase();
    if (id !== "A" && id !== "B" && id !== "C") continue;
    if (options.some((option) => option.id === id)) continue;
    const scrubbed = scrubGeneratedDraft(String((item as { text?: string }).text || ""));
    violations.push(...scrubbed.violations);
    if (!scrubbed.text.trim()) continue;
    const label =
      id === "A" ? "Recommended" : id === "B" ? "Warmer or shorter" : "Clarifying question";
    options.push({ id: id as DraftOptionId, label, text: scrubbed.text.trim() });
  }
  return options;
}

function parseJson(raw: string): Record<string, unknown> {
  const trimmed = raw.trim().replace(/^```json\s*/i, "").replace(/```$/i, "");
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("The model did not return JSON.");
  const parsed = JSON.parse(trimmed.slice(start, end + 1)) as unknown;
  if (!parsed || typeof parsed !== "object") throw new Error("The model JSON was empty.");
  return parsed as Record<string, unknown>;
}
