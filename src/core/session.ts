import type {
  ConsentWarning,
  FacilityRecord,
  FlaggedCard,
  QueueCard,
  ResolvedRecord,
  SmsMessage,
  UrgentListItem,
  UrgentSeenRecord,
  SopRecord,
  Thread,
  ThreadView,
} from "../shared/types";
import { matchFacility } from "./facilityFacts";
import { formatPhoneDisplay, toE164 } from "./format";
import { flaggedFromThreads, groupThreads, mergeMessages } from "./messages";
import { assessNeedsReply, queueFromThreads } from "./needsReply";
import { isReactionMessage } from "./reactions";
import { extractRentalIds } from "./rentalIds";
import { dropResolved, resolvedOnDay, upsertResolved } from "./resolved";
import { parseReservation } from "./reservation";
import { matchSops } from "./sopMatch";
import { isUrgentUnseen, markUrgentSeen, urgentThreads } from "./urgentBell";

export interface SessionOptions {
  now?: () => Date;
  sops?: SopRecord[];
  facilities?: FacilityRecord[];
  consent?: ConsentWarning[];
}

/** Read-only desk state: queue, consent flags, and SOP/facility lookup. Nothing is sent. */
export class DeskSession {
  private messages: SmsMessage[] = [];
  private threads: Thread[] = [];
  private listeners = new Set<() => void>();
  private selectedThreadId: string | null = null;
  private sops: SopRecord[];
  private facilities: FacilityRecord[];
  private consent: ConsentWarning[];
  private resolved: ResolvedRecord[] = [];
  private urgentSeen: UrgentSeenRecord[] = [];
  private readonly now: () => Date;

  constructor(options: SessionOptions = {}) {
    this.now = options.now ?? (() => new Date());
    this.sops = options.sops ?? [];
    this.facilities = options.facilities ?? [];
    this.consent = options.consent ?? [];
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

  get selectedId(): string | null {
    return this.selectedThreadId;
  }

  queue(): QueueCard[] {
    return queueFromThreads(this.threads, this.now().getTime(), this.resolved);
  }

  flagged(): FlaggedCard[] {
    return flaggedFromThreads(this.threads);
  }

  select(threadId: string | null): void {
    this.selectedThreadId = threadId;
    this.emit();
  }

  setResolved(records: ResolvedRecord[]): void {
    this.resolved = records.map((record) => ({ ...record, phone: toE164(record.phone) }));
    this.emit();
  }

  getResolved(): ResolvedRecord[] {
    return this.resolved.map((record) => ({ ...record }));
  }

  /** Hide this number until a newer customer message arrives. Does not send anything. */
  resolve(threadId: string): ResolvedRecord | null {
    const thread = this.threads.find((item) => item.id === threadId);
    if (!thread) return null;
    const assessment = assessNeedsReply(thread.messages, this.now().getTime());
    if (!assessment) return null;
    const record: ResolvedRecord = {
      phone: thread.customerPhone,
      lastCustomerMessageId: assessment.message.id,
      resolvedAt: this.now().toISOString(),
    };
    this.resolved = upsertResolved(this.resolved, record);
    this.emit();
    return record;
  }

  unresolve(phone: string): void {
    this.resolved = dropResolved(this.resolved, phone);
    this.emit();
  }

  setUrgentSeen(records: UrgentSeenRecord[]): void {
    this.urgentSeen = records.map((record) => ({ ...record, phone: toE164(record.phone) }));
    this.emit();
  }

  getUrgentSeen(): UrgentSeenRecord[] {
    return this.urgentSeen.map((record) => ({ ...record }));
  }

  urgentItems(): UrgentListItem[] {
    return urgentThreads(this.queue()).map((card) => ({
      threadId: card.threadId,
      customerPhone: card.customerPhone,
      displayPhone: card.displayPhone,
      rentalIds: card.rentalIds,
      preview: card.preview,
      waitMs: card.waitMs,
      waitingSince: card.waitingSince,
      reasons: card.reasons,
      unseen: isUrgentUnseen(card, this.urgentSeen),
      lastCustomerMessageId: card.lastCustomerMessageId,
    }));
  }

  unseenUrgentCount(): number {
    return this.urgentItems().filter((item) => item.unseen).length;
  }

  markUrgentSeen(): void {
    this.urgentSeen = markUrgentSeen(this.urgentSeen, this.queue());
    this.emit();
  }

  resolvedToday(): ResolvedRecord[] {
    return resolvedOnDay(this.resolved, this.now()).filter((record) => {
      const thread = this.threads.find((item) => toE164(item.customerPhone) === toE164(record.phone));
      if (!thread) return false;
      const assessment = assessNeedsReply(thread.messages, this.now().getTime());
      return assessment?.message.id === record.lastCustomerMessageId;
    });
  }

  threadView(threadId: string | null = this.selectedThreadId): ThreadView | null {
    if (!threadId) return null;
    const thread = this.threads.find((item) => item.id === threadId);
    if (!thread) return null;
    const reservation = parseReservation(thread.messages, this.now());
    const facility = matchFacility(reservation, this.facilities);
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
      card: this.queue().find((item) => item.threadId === threadId) ?? null,
      rentalIds: extractRentalIds(thread.messages, thread.customerPhone),
      reservation,
      facility,
      matchedSops: matchSops(thread.messages, this.sops),
    };
  }

  private rebuild(): void {
    this.threads = groupThreads(this.messages, this.consent);
    this.emit();
  }
}
