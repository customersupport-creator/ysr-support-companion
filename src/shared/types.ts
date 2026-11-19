import type { PanelId } from "./constants";

export type Direction = "inbound" | "outbound";
export type MessageSource = "ringcentral" | "airtable" | "demo";
export type Urgency = "RED" | "YELLOW" | "GREEN";

export interface SmsMessage {
  id: string;
  threadId: string;
  direction: Direction;
  body: string;
  /** ISO-8601 */
  sentAt: string;
  fromPhone: string;
  toPhone: string;
  source: MessageSource;
  /** RingCentral messageStatus, when the store sent one. */
  messageStatus?: string;
  /** Outbound sender name, when RingCentral provides it. */
  agentName?: string;
}

export interface ConsentWarning {
  phone: string;
  reason: string;
}

export interface Thread {
  id: string;
  customerPhone: string;
  messages: SmsMessage[];
  consentWarning: ConsentWarning | null;
}

export interface QueueCard {
  threadId: string;
  customerPhone: string;
  displayPhone: string;
  headline: string;
  waitMs: number;
  waitingSince: string;
  preview: string;
  urgency: Urgency;
  urgent: boolean;
  reasons: string[];
  rentalIds: string[];
  lastCustomerMessageId: string;
  /** thread id + message id, so a new customer text is a new queue item */
  key: string;
  facilityRecordId: string | null;
  facilityName: string | null;
  access: FacilityAccess | null;
  issues: IssueSummary[];
  value: ValueScore;
}

/** Local only. A newer inbound message than lastCustomerMessageId puts the number back. */
export interface ResolvedRecord {
  phone: string;
  lastCustomerMessageId: string;
  resolvedAt: string;
  kind?: "manual" | "auto";
  agentName?: string;
}

/** The urgent highlight was cleared for this exact customer message. */
export interface UrgentSeenRecord {
  phone: string;
  lastCustomerMessageId: string;
}

export interface UrgentListItem {
  threadId: string;
  customerPhone: string;
  displayPhone: string;
  rentalIds: string[];
  preview: string;
  waitMs: number;
  waitingSince: string;
  reasons: string[];
  unseen: boolean;
  lastCustomerMessageId: string;
}

export interface FlaggedCard {
  threadId: string;
  customerPhone: string;
  displayPhone: string;
  headline: string;
  reason: string;
  preview: string;
}

export interface SopRecord {
  id?: string;
  number: number;
  name: string;
  triggerKeywords: string;
  matchKeywords: string;
  lookups: string;
  steps: string;
  escalateTo: string;
  notes: string;
  status: string;
  source: "airtable" | "playbook";
}

export interface MatchedSop {
  sop: SopRecord;
  score: number;
  hits: string[];
}

export interface ReservationInfo {
  rentalId?: string;
  facility?: string;
  customerName?: string;
  start?: string;
  end?: string;
  plate?: string;
  status: "upcoming" | "active" | "ended" | "unknown";
}

export interface FacilityRecord {
  id: string;
  name: string;
  address: string;
  facilityId: string;
  status: string;
  notes: string;
  gps: string;
  stallCount: number | null;
  stallsByPlatform: string;
  towingCompany: string;
  salesTowAuthorization: string;
  landlord: string;
  doNotTowPlates: string;
  doNotTowVehicles: string;
  contactPerson: string;
  phone: string;
  email: string;
  access?: FacilityAccess | null;
}

export interface FacilityFacts {
  gateCode?: string;
  directions?: string;
  sizeLimit?: string;
  accessPoint?: string;
}

export interface AccessCodeEntry {
  label: string;
  code: string;
}

export interface FacilityAccess {
  accessType: string;
  codes: AccessCodeEntry[];
  instructions: string;
  confidence: "high" | "medium";
  codedGarageNoCode: boolean;
}

export interface FacilityListItem {
  id: string;
  name: string;
  address: string;
  status: string;
  access: FacilityAccess | null;
}

export type BookingSource = "monthly" | "lease" | "transient" | "sms";

export interface Booking {
  id: string;
  source: BookingSource;
  facilityName: string;
  platform: string;
  start?: string;
  end?: string;
  status: string;
  plate?: string;
  phone?: string;
}

export type IssueCategory =
  | "lot-full"
  | "inaccessible"
  | "directions"
  | "towed"
  | "damage"
  | "refund"
  | "overcharge"
  | "pass"
  | "ticket"
  | "safety";

export interface IssueHit {
  category: IssueCategory;
  label: string;
  color: string;
  at: string;
  messageId: string;
  facility: string;
  rentalId: string;
  snippet: string;
  current: boolean;
}

export interface IssueSummary {
  category: IssueCategory;
  label: string;
  color: string;
  count: number;
  repeatFacility: boolean;
  current: boolean;
  latest: IssueHit;
}

export type CustomerTier = "high" | "regular" | "new";

export interface ValueScore {
  tier: CustomerTier;
  totalBookings: number;
  bookings90Days: number;
  bookings12Months: number;
  distinctMonths12: number;
  distinctMonths6: number;
  monthStreak: number;
  favoriteFacility: string | null;
  regularPattern: boolean;
  activeMonthlyOrLease: boolean;
  firstSeen: string | null;
  lastBooking: string | null;
  reason: string;
}

export interface HistoryMessage {
  id: string;
  direction: Direction;
  body: string;
  sentAt: string;
  agentName: string;
}

export interface CustomerHistoryPage {
  phone: string;
  messages: HistoryMessage[];
  nextCursor: string | null;
  bookings: Booking[];
}

export interface ThreadView {
  id: string;
  customerPhone: string;
  displayPhone: string;
  messages: Array<{
    id: string;
    direction: Direction;
    body: string;
    sentAt: string;
    reaction: boolean;
  }>;
  consent: ConsentWarning | null;
  card: QueueCard | null;
  rentalIds: string[];
  reservation: ReservationInfo | null;
  facility: FacilityRecord | null;
  matchedSops: MatchedSop[];
}

export interface FollowUpItem {
  id: string;
  phone: string;
  displayPhone: string;
  agentName: string;
  quote: string;
  promisedAt: string;
  dueAt: string;
  waitMinutes: number;
  kind: "standard" | "endorse";
  state: "pending" | "due" | "snoozed";
  toast: string;
}

export type CommitmentType = "refund" | "reimbursement" | "relocation" | "credit" | "callback" | "update";
export type CommitmentStatus = "open" | "waiting" | "done";

export interface CommitmentItem {
  id: string;
  phone: string;
  displayPhone: string;
  customerName: string;
  rentalId: string;
  facility: string;
  type: CommitmentType;
  typeLabel: string;
  amount: string;
  agentName: string;
  at: string;
  ageMs: number;
  snippet: string;
  status: CommitmentStatus;
  note: string;
  suggestDone: boolean;
  ageTone: "normal" | "amber" | "red";
}

export interface FacilityAlertCustomer {
  phone: string;
  displayPhone: string;
  snippet: string;
  at: string;
  messageId: string;
}

export interface FacilityAlertItem {
  id: string;
  facilityName: string;
  facilityRecordId: string | null;
  category: IssueCategory;
  phrase: string;
  customers: FacilityAlertCustomer[];
  newestAt: string;
  spanLabel: string;
  toast: string;
  urgent: boolean;
  access: FacilityAccess | null;
}

export interface FacilityIssueCount {
  facilityName: string;
  category: IssueCategory;
  label: string;
  customers: number;
}

export interface FollowUpOverride {
  id: string;
  doneAt?: string;
  snoozeUntil?: string;
}

export interface CommitmentOverride {
  id: string;
  status?: CommitmentStatus;
  note?: string;
}

export interface AlertDismissal {
  id: string;
  messageIds: string[];
  at: string;
}

export interface PublicSettings {
  demoMode: boolean;
  rcServer: "production" | "sandbox";
  rcClientId: string;
  hasRcSecret: boolean;
  hasRcJwt: boolean;
  rcLoggedIn: boolean;
  airtableTokenSet: boolean;
  notificationsEnabled: boolean;
  alwaysOnTop: boolean;
  available: boolean;
  openNumbersIn: "beetexting" | "desktop" | "web";
  beeTextingTemplate: string;
  urgentSound: boolean;
  showAccessCodes: boolean;
  historyMonthlyTable: string;
  historyLeaseTable: string;
  historyTransientTable: string;
  transientHighValueOver: number;
  autoResolveOnReply: boolean;
  followUpMinutes: number;
  endorseFollowUpMinutes: number;
  facilityAlertCustomers: number;
  facilityAlertHours: number;
  consentPhones: ConsentWarning[];
  secureStorage: boolean;
}

export interface ConnectionState {
  mode: "demo" | "live";
  ringcentral: "demo" | "connected" | "disconnected" | "error";
  ringcentralDetail: string;
  subscription: "off" | "live" | "reconnecting";
  airtable: "demo" | "connected" | "off" | "error";
  airtableDetail: string;
}

export interface AppSnapshot {
  settings: PublicSettings;
  connection: ConnectionState;
  queue: QueueCard[];
  flagged: FlaggedCard[];
  selectedThreadId: string | null;
  thread: ThreadView | null;
  resolvedToday: ResolvedRecord[];
  urgentItems: UrgentListItem[];
  unseenUrgentCount: number;
  facilities: FacilityListItem[];
  followUps: FollowUpItem[];
  commitments: CommitmentItem[];
  facilityAlerts: FacilityAlertItem[];
  facilityAlertHistory: FacilityAlertItem[];
  facilityIssueCounts: FacilityIssueCount[];
  banner: string | null;
}

export interface SettingsPatch {
  demoMode?: boolean;
  rcServer?: "production" | "sandbox";
  rcClientId?: string;
  rcClientSecret?: string;
  rcJwt?: string;
  clearRcSecret?: boolean;
  clearRcJwt?: boolean;
  airtableToken?: string;
  clearAirtableToken?: boolean;
  notificationsEnabled?: boolean;
  alwaysOnTop?: boolean;
  openNumbersIn?: "beetexting" | "desktop" | "web";
  beeTextingTemplate?: string;
  urgentSound?: boolean;
  showAccessCodes?: boolean;
  historyMonthlyTable?: string;
  historyLeaseTable?: string;
  historyTransientTable?: string;
  transientHighValueOver?: number;
  autoResolveOnReply?: boolean;
  followUpMinutes?: number;
  endorseFollowUpMinutes?: number;
  facilityAlertCustomers?: number;
  facilityAlertHours?: number;
  consentPhones?: ConsentWarning[];
}

export interface ActionResult {
  ok: boolean;
  message: string;
}

export interface YsrApi {
  getSnapshot(): Promise<AppSnapshot>;
  onSnapshot(cb: (snapshot: AppSnapshot) => void): () => void;
  setAvailable(value: boolean): Promise<void>;
  setAlwaysOnTop(value: boolean): Promise<void>;
  selectThread(threadId: string | null): Promise<void>;
  resolveThread(threadId: string): Promise<ActionResult>;
  unresolvePhone(phone: string): Promise<ActionResult>;
  copyText(text: string): Promise<ActionResult>;
  openNumber(phone: string): Promise<ActionResult>;
  markUrgentSeen(): Promise<void>;
  onUrgentChime?(listener: () => void): () => void;
  saveSettings(patch: SettingsPatch): Promise<ActionResult>;
  testRingCentral(): Promise<ActionResult>;
  testAirtable(): Promise<ActionResult>;
  startOAuth(): Promise<ActionResult>;
  disconnectRingCentral(): Promise<ActionResult>;
  simulateInbound(): Promise<ActionResult>;
  getPanelHint(): Promise<PanelId[]>;
  refreshFacilities(): Promise<ActionResult>;
  setFacilityPick(phone: string, facilityId: string | null): Promise<void>;
  loadHistory(phone: string, cursor?: string | null): Promise<CustomerHistoryPage>;
  snoozeFollowUp(id: string, minutes: number): Promise<void>;
  completeFollowUp(id: string): Promise<void>;
  updateCommitment(id: string, status: CommitmentStatus, note: string): Promise<void>;
  dismissFacilityAlert(id: string): Promise<void>;
  commitmentCsv(): Promise<string>;
}
