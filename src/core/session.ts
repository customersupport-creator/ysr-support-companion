import { SMS_HARD_LIMIT, SUPPORT_LINE_E164 } from "../shared/constants";
import type {
  ApprovalState,
  ConsentWarning,
  Correction,
  DraftBundle,
  DraftStatus,
  FacilityRecord,
  FlaggedCard,
  LearningView,
  OutboxItem,
  QueueCard,
  SmsMessage,
  SopRecord,
  Thread,
  ThreadView,
} from "../shared/types";
import {
  approveExact,
  ApprovalError,
  blockForConsent,
  canDraft,
  initialApproval,
  invalidate,
  logMine,
  markSent,
  noteCustomerMessage,
  presentDraft,
  rejectDraft,
  sendGuard,
  skipThread,
} from "./approval";
import { parseAgentCommand } from "./commands";
import { classifyCorrection, summarizeCorrections } from "./corrections";
import type { DraftEdit, Drafter } from "./draftTypes";
import { matchFacility } from "./facilityFacts";
import { formatPhoneDisplay } from "./format";
import { flaggedFromThreads, groupThreads, mergeMessages } from "./messages";
import { assessNeedsReply, queueFromThreads } from "./needsReply";
import { isReactionMessage } from "./reactions";
import { parseReservation } from "./reservation";
import { consentFor } from "./safety";

export interface SessionOptions {
  drafter: Drafter;
  now?: () => Date;
  agentName?: string;
  signature?: string;
  sops?: SopRecord[];
  facilities?: FacilityRecord[];
  consent?: ConsentWarning[];
  corrections?: Correction[];
}

export class DeskSession {
  private messages: SmsMessage[] = [];
  private threads: Thread[] = [];
  private approvals = new Map<string, ApprovalState>();
  private drafts = new Map<string, DraftBundle>();
  private draftMeta = new Map<string, { status: DraftStatus; error: string | null }>();
  private draftGen = new Map<string, number>();
  private corrections: Correction[];
  private outbox: OutboxItem[] = [];
  private selectedThreadId: string | null = null;
  private listeners = new Set<() => void>();
  private sops: SopRecord[];
  private facilities: FacilityRecord[];
  private consent: ConsentWarning[];
  private agentName: string;
  private signature: string;
  private readonly drafter: Drafter;
  private readonly now: () => Date;

  constructor(options: SessionOptions) {
    this.drafter = options.drafter;
    this.now = options.now ?? (() => new Date());
    this.agentName = options.agentName ?? "";
    this.signature = options.signature ?? "";
    this.sops = options.sops ?? [];
    this.facilities = options.facilities ?? [];
    this.consent = options.consent ?? [];
    this.corrections = options.corrections ?? [];
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }

  setMessages(messages: SmsMessage[]): void {
    this.messages = mergeMessages([], messages);
    this.rebuild();
  }

  upsertMessages(incoming: SmsMessage[]): void {
    this.messages = mergeMessages(this.messages, incoming);
    this.rebuild();
  }

  setSops(sops: SopRecord[]): void {
    this.sops = sops;
    this.emit();
  }

  setFacilities(facilities: FacilityRecord[]): void {
    this.facilities = facilities;
    this.emit();
  }

  setConsent(consent: ConsentWarning[]): void {
    this.consent = consent;
    this.rebuild();
  }

  setAgent(agentName: string, signature: string): void {
    this.agentName = agentName;
    this.signature = signature;
    this.emit();
  }

  getCorrections(): Correction[] {
    return this.corrections.map((item) => ({ ...item, kinds: [...item.kinds] }));
  }

  setCorrections(corrections: Correction[]): void {
    this.corrections = corrections.map((item) => ({ ...item, kinds: [...item.kinds] }));
    this.emit();
  }

  markCorrectionSynced(id: string): void {
    const found = this.corrections.find((item) => item.id === id);
    if (found) found.synced = true;
  }

  get selectedId(): string | null {
    return this.selectedThreadId;
  }

  queue(): QueueCard[] {
    return queueFromThreads(this.threads, this.now().getTime(), this.skippedIds());
  }

  flagged(): FlaggedCard[] {
    return flaggedFromThreads(this.threads);
  }

  learning(): LearningView {
    return {
      summary: summarizeCorrections(this.corrections),
      corrections: this.getCorrections(),
    };
  }

  getOutbox(): OutboxItem[] {
    return [...this.outbox];
  }

  threadView(threadId: string | null = this.selectedThreadId): ThreadView | null {
    if (!threadId) return null;
    const thread = this.threads.find((item) => item.id === threadId);
    if (!thread) return null;
    const card = this.queue().find((item) => item.threadId === threadId) ?? null;
    return {
      id: thread.id,
      customerPhone: thread.customerPhone,
      displayPhone: formatPhoneDisplay(thread.customerPhone),
      messages: thread.messages.map((message) => ({
        id: message.id,
        direction: message.direction,
        body: message.body,
        sentAt: message.sentAt,
        reaction: isReactionMessage(message.body),
      })),
      consent: thread.consentWarning,
      card,
      approval: this.approvals.get(thread.id) ?? initialApproval(),
      draft: this.drafts.get(thread.id) ?? null,
      draftStatus: this.draftMeta.get(thread.id)?.status ?? "idle",
      draftError: this.draftMeta.get(thread.id)?.error ?? null,
      correctionSummary: summarizeCorrections(this.corrections.filter((item) => item.agent === (this.agentName || "Agent"))),
    };
  }

  async select(threadId: string | null): Promise<void> {
    this.selectedThreadId = threadId;
    this.emit();
    if (threadId) await this.ensureDraft(threadId);
  }

  async ensureDraft(threadId: string, force = false): Promise<void> {
    const thread = this.threads.find((item) => item.id === threadId);
    if (!thread) return;
    if (thread.consentWarning) {
      this.approvals.set(threadId, blockForConsent(this.approvals.get(threadId) ?? initialApproval()));
      this.drafts.delete(threadId);
      this.draftMeta.set(threadId, { status: "blocked", error: null });
      this.emit();
      return;
    }
    const latest = this.latestInboundId(thread);
    const state = this.approvals.get(threadId) ?? initialApproval();
    if (!canDraft(state, latest)) {
      this.draftMeta.set(threadId, { status: latest ? "skipped" : "idle", error: null });
      this.emit();
      return;
    }
    if (!latest || !assessNeedsReply(thread.messages, this.now().getTime())) {
      this.draftMeta.set(threadId, { status: "idle", error: null });
      this.emit();
      return;
    }
    const existing = this.drafts.get(threadId);
    if (!force && existing?.basedOnMessageId === latest && this.draftMeta.get(threadId)?.status === "ready") return;

    const gen = this.bump(threadId);
    this.draftMeta.set(threadId, { status: "drafting", error: null });
    this.emit();
    try {
      const bundle = await this.drafter.draft(this.draftInput(thread, latest));
      if (this.draftGen.get(threadId) !== gen) return;
      this.drafts.set(threadId, bundle);
      const current = this.approvals.get(threadId) ?? initialApproval();
      if (
        current.status !== "approved" &&
        current.status !== "mine_logged" &&
        current.status !== "skipped" &&
        current.status !== "consent_blocked"
      ) {
        this.approvals.set(threadId, presentDraft(current, latest));
      }
      this.draftMeta.set(threadId, { status: "ready", error: null });
    } catch (error) {
      if (this.draftGen.get(threadId) !== gen) return;
      this.draftMeta.set(threadId, {
        status: "error",
        error: error instanceof Error ? error.message : "Draft failed.",
      });
    }
    this.emit();
  }

  async runCommand(threadId: string, commandText: string): Promise<{
    ok: boolean;
    message: string;
    openConfirm?: boolean;
    confirmText?: string;
  }> {
    const thread = this.threads.find((item) => item.id === threadId);
    if (!thread) return { ok: false, message: "That thread is not loaded." };
    const command = parseAgentCommand(commandText);
    const state = this.approvals.get(threadId) ?? initialApproval();
    try {
      switch (command.type) {
        case "approve": {
          const option = this.drafts.get(threadId)?.options.find((item) => item.id === command.option);
          if (!option) return { ok: false, message: `No option ${command.option} to approve.` };
          this.approvals.set(threadId, approveExact(state, option.text, option.id));
          this.emit();
          return {
            ok: true,
            message: `Option ${option.id} approved. Confirm to send this exact text.`,
            openConfirm: true,
            confirmText: option.text,
          };
        }
        case "approve_mine": {
          if (state.status !== "mine_logged" || state.candidateText == null) {
            return { ok: false, message: "There is no MINE text waiting. Use APPROVE A, B, or C." };
          }
          const text = state.candidateText;
          this.approvals.set(threadId, approveExact(state, text, "MINE"));
          this.emit();
          return { ok: true, message: "Your text is approved. Confirm to send it.", openConfirm: true, confirmText: text };
        }
        case "edit": {
          const previous = this.drafts.get(threadId);
          if (!previous) return { ok: false, message: "Nothing to edit yet." };
          const before = previous.options.find((item) => item.id === "A")?.text ?? previous.options[0]?.text ?? "";
          const gen = this.bump(threadId);
          this.approvals.set(threadId, invalidate(state, "Edit cleared the approval. Approve the new text."));
          this.draftMeta.set(threadId, { status: "drafting", error: null });
          this.emit();
          const edit: DraftEdit = { changes: command.changes, previousText: before, previous };
          const bundle = await this.drafter.draft(this.draftInput(thread, previous.basedOnMessageId, edit));
          if (this.draftGen.get(threadId) !== gen) return { ok: true, message: "A newer draft replaced that edit." };
          this.drafts.set(threadId, bundle);
          const redrafted = presentDraft(this.approvals.get(threadId) ?? initialApproval(), previous.basedOnMessageId);
          this.approvals.set(threadId, {
            ...redrafted,
            notice: "Redrafted. The previous approval is cleared. Approve the new text.",
          });
          const after = bundle.options.find((item) => item.id === "A")?.text ?? "";
          this.recordCorrection(thread, before, after);
          this.draftMeta.set(threadId, { status: "ready", error: null });
          this.emit();
          return { ok: true, message: "Redrafted. The previous approval is cleared. Approve the new text." };
        }
        case "reject": {
          this.approvals.set(threadId, rejectDraft(state));
          this.drafts.delete(threadId);
          this.draftMeta.set(threadId, { status: "idle", error: null });
          this.emit();
          return { ok: true, message: "Discarded. Use REDRAFT if you want new options." };
        }
        case "redraft": {
          const latest = this.latestInboundId(thread);
          if (!latest) return { ok: false, message: "No customer text to draft from." };
          if (thread.consentWarning) return { ok: false, message: "Consent warning. Drafting is blocked." };
          this.approvals.set(threadId, initialApproval());
          this.drafts.delete(threadId);
          await this.ensureDraft(threadId, true);
          return { ok: true, message: "New options are ready. Approve one before sending." };
        }
        case "mine": {
          if (!command.text.trim()) return { ok: false, message: "Add the text after MINE:." };
          const before = this.drafts.get(threadId)?.options.find((item) => item.id === "A")?.text;
          this.approvals.set(threadId, logMine(state, command.text));
          if (before && before !== command.text) this.recordCorrection(thread, before, command.text);
          this.emit();
          return { ok: true, message: "Logged your text unchanged. It still needs APPROVE, then a confirm click." };
        }
        case "skip": {
          const latest = this.latestInboundId(thread);
          if (!latest) return { ok: false, message: "Nothing to skip." };
          this.approvals.set(threadId, skipThread(state, latest));
          this.drafts.delete(threadId);
          this.draftMeta.set(threadId, { status: "skipped", error: null });
          this.emit();
          return { ok: true, message: "Skipped until this customer sends a new message." };
        }
        default:
          return {
            ok: false,
            message: "Use APPROVE A, APPROVE B, APPROVE C, EDIT: …, REJECT, MINE: …, SKIP, or REDRAFT.",
          };
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Command failed.";
      return { ok: false, message };
    }
  }

  /** Throws unless this exact text is the approved text for the thread. Does not send. */
  previewSend(threadId: string, text: string): { to: string; text: string } {
    const thread = this.threads.find((item) => item.id === threadId);
    if (!thread) throw new ApprovalError("That thread is not loaded.");
    if (thread.consentWarning || consentFor(thread.customerPhone, this.consent)) {
      throw new ApprovalError("Consent warning: drafting and sending are blocked for this contact.");
    }
    const state = this.approvals.get(threadId) ?? initialApproval();
    sendGuard(state, text);
    if (text.length > SMS_HARD_LIMIT) {
      throw new ApprovalError(`That text is over ${SMS_HARD_LIMIT} characters. Shorten it and approve the shorter text.`);
    }
    return { to: thread.customerPhone, text };
  }

  commitSent(threadId: string, text: string, messageId: string, demo: boolean): void {
    const thread = this.threads.find((item) => item.id === threadId);
    if (!thread) throw new ApprovalError("That thread is not loaded.");
    sendGuard(this.approvals.get(threadId) ?? initialApproval(), text);
    const sentAt = this.now().toISOString();
    this.messages = mergeMessages(this.messages, [
      {
        id: messageId,
        threadId,
        direction: "outbound",
        body: text,
        sentAt,
        fromPhone: SUPPORT_LINE_E164,
        toPhone: thread.customerPhone,
        source: demo ? "demo" : "ringcentral",
      },
    ]);
    this.approvals.set(threadId, markSent(this.approvals.get(threadId) ?? initialApproval()));
    this.outbox.unshift({ id: messageId, threadId, to: thread.customerPhone, text, at: sentAt, demo });
    this.outbox = this.outbox.slice(0, 30);
    this.rebuild();
  }

  approvalFor(threadId: string): ApprovalState {
    return this.approvals.get(threadId) ?? initialApproval();
  }

  private recordCorrection(thread: Thread, before: string, after: string): void {
    if (!before || before === after) return;
    this.corrections.push({
      id: newId(),
      agent: this.agentName || "Agent",
      threadId: thread.id,
      customerPhone: thread.customerPhone,
      before,
      after,
      kinds: classifyCorrection(before, after),
      at: this.now().toISOString(),
      synced: false,
    });
  }

  private draftInput(thread: Thread, latestCustomerMessageId: string, edit?: DraftEdit) {
    const now = this.now();
    const reservation = parseReservation(thread.messages, now);
    return {
      thread,
      latestCustomerMessageId,
      sops: this.sops,
      facility: matchFacility(reservation, this.facilities),
      reservation,
      correctionSummary: summarizeCorrections(
        this.corrections.filter((item) => item.agent === (this.agentName || "Agent")),
      ),
      agentName: this.agentName,
      signature: this.signature,
      nowIso: now.toISOString(),
      edit,
    };
  }

  private rebuild(): void {
    const previousLatest = new Map(this.threads.map((thread) => [thread.id, this.latestInboundId(thread)]));
    this.threads = groupThreads(this.messages, this.consent);
    for (const thread of this.threads) {
      const latest = this.latestInboundId(thread);
      const state = this.approvals.get(thread.id) ?? initialApproval();
      if (thread.consentWarning) {
        this.approvals.set(thread.id, blockForConsent(state));
        this.drafts.delete(thread.id);
        this.draftMeta.set(thread.id, { status: "blocked", error: null });
        continue;
      }
      let current = state;
      if (current.status === "consent_blocked") current = initialApproval();
      const prior = previousLatest.get(thread.id);
      if (latest && prior && prior !== latest) {
        current = noteCustomerMessage(current, latest);
        if (current.approvedText == null) this.drafts.delete(thread.id);
      }
      this.approvals.set(thread.id, current);
    }
    this.emit();
  }

  private skippedIds(): Set<string> {
    const ids = new Set<string>();
    for (const thread of this.threads) {
      const state = this.approvals.get(thread.id);
      const latest = this.latestInboundId(thread);
      if (state?.status === "skipped" && state.skippedAtMessageId === latest) ids.add(thread.id);
    }
    return ids;
  }

  private latestInboundId(thread: Thread): string | null {
    const assessment = assessNeedsReply(thread.messages, this.now().getTime());
    if (assessment) return assessment.message.id;
    const inbound = thread.messages.filter((message) => message.direction === "inbound" && !isReactionMessage(message.body));
    return inbound.length ? inbound[inbound.length - 1].id : null;
  }

  private bump(threadId: string): number {
    const next = (this.draftGen.get(threadId) ?? 0) + 1;
    this.draftGen.set(threadId, next);
    return next;
  }
}

function newId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID();
  return `corr-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
