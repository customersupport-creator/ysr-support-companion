import type {
  AlertDismissal,
  Booking,
  CommitmentOverride,
  CommitmentStatus,
  ConsentWarning,
  FacilityAlertItem,
  FacilityListItem,
  FacilityRecord,
  FlaggedCard,
  FollowUpOverride,
  QueueCard,
  ResolvedRecord,
  SmsMessage,
  UrgentListItem,
  UrgentSeenRecord,
  SopRecord,
  Thread,
  ThreadView,
} from "../shared/types";
import { buildFacilityAlerts } from "./facilityAlerts";
import { openFollowUps } from "./followUps";
import { commitmentsToCsv, findCommitments } from "./commitments";
import { buildCardContext, facilityList } from "./cardContext";
import { DEFAULT_VALUE_THRESHOLDS, type ValueThresholds } from "./customerValue";
import { formatPhoneDisplay, toE164 } from "./format";
import { flaggedFromThreads, groupThreads, mergeMessages } from "./messages";
import { assessNeedsReply, queueFromThreads } from "./needsReply";
import { isReactionMessage } from "./reactions";
import { genuineReplyAfter } from "./replies";
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
  private bookings: Booking[] = [];
  private picks = new Map<string, string>();
  private thresholds: ValueThresholds = { ...DEFAULT_VALUE_THRESHOLDS };
  private followUpOverrides: FollowUpOverride[] = [];
  private commitmentOverrides: CommitmentOverride[] = [];
  private alertDismissals: AlertDismissal[] = [];
  private alertHistory: FacilityAlertItem[] = [];
  private followUpMinutes = 15;
  private endorseFollowUpMinutes = 30;
  private facilityAlertCustomers = 3;
  private facilityAlertHours = 3;
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

  setBookings(rows: Booking[]): void {
    this.bookings = rows;
    this.emit();
  }

  addBookings(rows: Booking[]): void {
    this.bookings = [...this.bookings, ...rows];
    this.emit();
  }

  bookingsFor(phone: string): Booking[] {
    const thread = this.threads.find((item) => toE164(item.customerPhone) === toE164(phone));
    if (!thread) return [];
    return this.contextFor(thread).bookings;
  }

  setValueThresholds(thresholds: Partial<ValueThresholds>): void {
    this.thresholds = { ...this.thresholds, ...thresholds };
    this.emit();
  }

  setOpsSettings(input: {
    followUpMinutes?: number;
    endorseFollowUpMinutes?: number;
    facilityAlertCustomers?: number;
    facilityAlertHours?: number;
  }): void {
    if (input.followUpMinutes != null) this.followUpMinutes = input.followUpMinutes;
    if (input.endorseFollowUpMinutes != null) this.endorseFollowUpMinutes = input.endorseFollowUpMinutes;
    if (input.facilityAlertCustomers != null) this.facilityAlertCustomers = input.facilityAlertCustomers;
    if (input.facilityAlertHours != null) this.facilityAlertHours = input.facilityAlertHours;
    this.emit();
  }

  loadOps(input: {
    followUps?: FollowUpOverride[];
    commitments?: CommitmentOverride[];
    dismissals?: AlertDismissal[];
    history?: FacilityAlertItem[];
  }): void {
    this.followUpOverrides = input.followUps ?? [];
    this.commitmentOverrides = input.commitments ?? [];
    this.alertDismissals = input.dismissals ?? [];
    this.alertHistory = input.history ?? [];
    this.emit();
  }

  opsState(): {
    followUps: FollowUpOverride[];
    commitments: CommitmentOverride[];
    dismissals: AlertDismissal[];
    history: FacilityAlertItem[];
  } {
    return {
      followUps: this.followUpOverrides,
      commitments: this.commitmentOverrides,
      dismissals: this.alertDismissals,
      history: this.alertHistory,
    };
  }

  followUps() {
    const manual = new Set(
      this.resolvedToday()
        .filter((record) => record.kind !== "auto")
        .map((record) => toE164(record.phone)),
    );
    return openFollowUps({
      threads: this.threads.map((thread) => ({ phone: thread.customerPhone, messages: thread.messages })),
      now: this.now(),
      standardMinutes: this.followUpMinutes,
      endorseMinutes: this.endorseFollowUpMinutes,
      overrides: this.followUpOverrides,
      manuallyResolvedPhones: manual,
    });
  }

  commitments() {
    return findCommitments({
      threads: this.threadFacts(),
      now: this.now(),
      overrides: this.commitmentOverrides,
    });
  }

  facilityAlerts() {
    return buildFacilityAlerts({
      threads: this.threadFacts(),
      now: this.now(),
      customers: this.facilityAlertCustomers,
      windowHours: this.facilityAlertHours,
      dismissals: this.alertDismissals,
    }).active;
  }

  facilityIssueCounts() {
    return buildFacilityAlerts({
      threads: this.threadFacts(),
      now: this.now(),
      customers: this.facilityAlertCustomers,
      windowHours: this.facilityAlertHours,
      dismissals: this.alertDismissals,
    }).counts;
  }

  facilityAlertHistory(): FacilityAlertItem[] {
    const week = this.now().getTime() - 7 * 24 * 60 * 60 * 1000;
    return this.alertHistory.filter((item) => Date.parse(item.newestAt) >= week);
  }

  snoozeFollowUp(id: string, minutes: number): void {
    const until = new Date(this.now().getTime() + minutes * 60_000).toISOString();
    this.followUpOverrides = this.followUpOverrides.filter((item) => item.id !== id).concat({ id, snoozeUntil: until });
    this.emit();
  }

  completeFollowUp(id: string): void {
    this.followUpOverrides = this.followUpOverrides.filter((item) => item.id !== id).concat({ id, doneAt: this.now().toISOString() });
    this.emit();
  }

  updateCommitment(id: string, status: CommitmentStatus, note: string): void {
    this.commitmentOverrides = this.commitmentOverrides.filter((item) => item.id !== id).concat({ id, status, note });
    this.emit();
  }

  dismissFacilityAlert(id: string): void {
    const alert = this.facilityAlerts().find((item) => item.id === id);
    if (!alert) return;
    this.alertDismissals = this.alertDismissals.filter((item) => item.id !== id).concat({
      id,
      messageIds: alert.customers.map((customer) => customer.messageId),
      at: this.now().toISOString(),
    });
    this.alertHistory = [alert, ...this.alertHistory].slice(0, 40);
    this.emit();
  }

  commitmentCsv(): string {
    return commitmentsToCsv(this.commitments());
  }

  setFacilityPick(phone: string, facilityId: string | null): void {
    const key = toE164(phone);
    if (!facilityId) this.picks.delete(key);
    else this.picks.set(key, facilityId);
    this.emit();
  }

  messagesFor(phone: string): SmsMessage[] {
    const key = toE164(phone);
    return this.messages
      .filter((message) => toE164(message.threadId) === key || toE164(message.fromPhone) === key || toE164(message.toPhone) === key)
      .sort((a, b) => Date.parse(a.sentAt) - Date.parse(b.sentAt));
  }

  listFacilities(): FacilityListItem[] {
    return facilityList(this.facilities);
  }

  queue(): QueueCard[] {
    return queueFromThreads(this.threads, this.now().getTime(), this.resolved).map((card) => this.decorate(card));
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
      kind: "manual",
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

  /**
   * A real support-line reply after a waiting text. The number leaves the queue
   * because it no longer needs a reply, and this records who answered it.
   */
  autoResolveReplies(waiting: Map<string, string>): ResolvedRecord[] {
    const created: ResolvedRecord[] = [];
    for (const [phone, messageId] of waiting) {
      const thread = this.threads.find((item) => toE164(item.customerPhone) === phone);
      if (!thread) continue;
      const reply = genuineReplyAfter(thread.messages, messageId);
      if (!reply) continue;
      const record: ResolvedRecord = {
        phone,
        lastCustomerMessageId: messageId,
        resolvedAt: reply.sentAt,
        kind: "auto",
        agentName: reply.agentName?.trim() || "",
      };
      this.resolved = upsertResolved(this.resolved, record);
      created.push(record);
    }
    if (created.length) this.emit();
    return created;
  }

  resolvedToday(): ResolvedRecord[] {
    return resolvedOnDay(this.resolved, this.now()).filter((record) => {
      const thread = this.threads.find((item) => toE164(item.customerPhone) === toE164(record.phone));
      if (!thread) return false;
      const assessment = assessNeedsReply(thread.messages, this.now().getTime());
      if (record.kind === "auto") return assessment == null || assessment.message.id === record.lastCustomerMessageId;
      return assessment?.message.id === record.lastCustomerMessageId;
    });
  }

  threadView(threadId: string | null = this.selectedThreadId): ThreadView | null {
    if (!threadId) return null;
    const thread = this.threads.find((item) => item.id === threadId);
    if (!thread) return null;
    const reservation = parseReservation(thread.messages, this.now());
    const context = this.contextFor(thread);
    const facility = context.facility;
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

  private threadFacts() {
    return this.threads.map((thread) => {
      const context = this.contextFor(thread);
      return {
        phone: thread.customerPhone,
        messages: thread.messages,
        facilityName: context.facilityName ?? "",
        facilityRecordId: context.facilityRecordId,
        access: context.access,
      };
    });
  }

  private contextFor(thread: Thread) {
    return buildCardContext({
      messages: thread.messages,
      phone: thread.customerPhone,
      facilities: this.facilities,
      pickedId: this.picks.get(toE164(thread.customerPhone)) ?? null,
      bookings: this.bookings,
      now: this.now(),
      thresholds: this.thresholds,
    });
  }

  private decorate(card: QueueCard): QueueCard {
    const thread = this.threads.find((item) => item.id === card.threadId);
    if (!thread) return card;
    const context = this.contextFor(thread);
    return {
      ...card,
      facilityRecordId: context.facilityRecordId,
      facilityName: context.facilityName,
      access: context.access,
      issues: context.issues,
      value: context.value,
    };
  }

  private rebuild(): void {
    this.threads = groupThreads(this.messages, this.consent);
    this.emit();
  }
}
