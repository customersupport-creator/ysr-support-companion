import type {
  ConsentWarning,
  FacilityRecord,
  FlaggedCard,
  QueueCard,
  SmsMessage,
  SopRecord,
  Thread,
  ThreadView,
} from "../shared/types";
import { matchFacility } from "./facilityFacts";
import { formatPhoneDisplay } from "./format";
import { flaggedFromThreads, groupThreads, mergeMessages } from "./messages";
import { queueFromThreads } from "./needsReply";
import { isReactionMessage } from "./reactions";
import { parseReservation } from "./reservation";
import { matchSops } from "./sopMatch";

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
    return queueFromThreads(this.threads, this.now().getTime());
  }

  flagged(): FlaggedCard[] {
    return flaggedFromThreads(this.threads);
  }

  select(threadId: string | null): void {
    this.selectedThreadId = threadId;
    this.emit();
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
