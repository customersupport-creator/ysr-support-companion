export type AgentCommand =
  | { type: "approve"; option: "A" | "B" | "C" }
  | { type: "approve_mine" }
  | { type: "edit"; changes: string }
  | { type: "reject" }
  | { type: "mine"; text: string }
  | { type: "skip" }
  | { type: "redraft" }
  | { type: "unknown"; raw: string };

/**
 * Commands are parsed only from the agent command box, never from customer SMS.
 * MINE keeps the text after the colon exactly, aside from one leading space.
 */
export function parseAgentCommand(input: string): AgentCommand {
  const trimmed = input.trim();
  const approve = /^approve\s+([abc])\s*$/i.exec(trimmed);
  if (approve) {
    return { type: "approve", option: approve[1].toUpperCase() as "A" | "B" | "C" };
  }
  if (/^approve\s*$/i.test(trimmed)) return { type: "approve_mine" };
  const edit = /^edit\s*:\s*([\s\S]+)$/i.exec(input.trimStart());
  if (edit && edit[1].trim().length > 0) return { type: "edit", changes: edit[1].trim() };
  if (/^reject\s*$/i.test(trimmed)) return { type: "reject" };
  const mine = /^mine\s*:\s?([\s\S]*)$/i.exec(input.trimStart());
  if (mine) return { type: "mine", text: mine[1].replace(/\s+$/, "") };
  if (/^skip\s*$/i.test(trimmed)) return { type: "skip" };
  if (/^redraft\s*$/i.test(trimmed)) return { type: "redraft" };
  return { type: "unknown", raw: trimmed };
}
