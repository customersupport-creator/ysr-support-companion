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
  lastCustomerMessageId: string;
  /** thread id + message id, so a new customer text is a new queue item */
  key: string;
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
}

export interface FacilityFacts {
  gateCode?: string;
  directions?: string;
  sizeLimit?: string;
  accessPoint?: string;
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
  saveSettings(patch: SettingsPatch): Promise<ActionResult>;
  testRingCentral(): Promise<ActionResult>;
  testAirtable(): Promise<ActionResult>;
  startOAuth(): Promise<ActionResult>;
  disconnectRingCentral(): Promise<ActionResult>;
  simulateInbound(): Promise<ActionResult>;
  getPanelHint(): Promise<PanelId[]>;
}
