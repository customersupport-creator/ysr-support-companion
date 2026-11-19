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
}
