import type { PanelId } from "./constants";

export type Direction = "inbound" | "outbound";
export type MessageSource = "ringcentral" | "airtable" | "demo";
export type Urgency = "RED" | "YELLOW" | "GREEN";
export type CustomerMood = "calm" | "confused" | "worried" | "frustrated" | "angry";
export type DraftOptionId = "A" | "B" | "C";
export type ApprovalOptionId = DraftOptionId | "MINE";

export type ApprovalStatus =
  | "idle"
  | "draft_ready"
  | "approved"
  | "invalidated"
  | "mine_logged"
  | "rejected"
  | "skipped"
  | "consent_blocked"
  | "sent";

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
  skipped: boolean;
  lastCustomerMessageId: string;
  /** thread id + message id, so a new customer text counts as a new item */
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
  suggestedReplies: string;
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

export interface DraftOption {
  id: DraftOptionId;
  label: string;
  text: string;
}

export interface DraftBundle {
  threadId: string;
  basedOnMessageId: string;
  concern: string;
  mood: CustomerMood;
  reservation: ReservationInfo | null;
  facilityName: string | null;
  matchedSops: MatchedSop[];
  disagreementNotes: string[];
  sopNote: string;
  options: DraftOption[];
  agentQuestion: string;
  urgent: boolean;
  escalate: boolean;
  createdAt: string;
  engine: "local" | "anthropic" | "openai";
}

export interface ApprovalState {
  status: ApprovalStatus;
  approvedText: string | null;
  candidateText: string | null;
  optionId: ApprovalOptionId | null;
  basedOnMessageId: string | null;
  skippedAtMessageId: string | null;
  notice: string;
}

export type ChangeKind = "tone" | "length" | "facts";

export interface Correction {
  id: string;
  agent: string;
  threadId: string;
  customerPhone: string;
  before: string;
  after: string;
  kinds: ChangeKind[];
  at: string;
  synced: boolean;
}

export interface OutboxItem {
  id: string;
  threadId: string;
  to: string;
  text: string;
  at: string;
  demo: boolean;
}

export type DraftStatus = "idle" | "drafting" | "ready" | "blocked" | "skipped" | "error";

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
  approval: ApprovalState;
  draft: DraftBundle | null;
  draftStatus: DraftStatus;
  draftError: string | null;
  correctionSummary: string;
}

export interface LearningView {
  summary: string;
  corrections: Correction[];
}

export interface PublicSettings {
  demoMode: boolean;
  rcServer: "production" | "sandbox";
  rcClientId: string;
  hasRcSecret: boolean;
  hasRcJwt: boolean;
  rcLoggedIn: boolean;
  airtableTokenSet: boolean;
  correctionsOptIn: boolean;
  correctionsTableReady: boolean;
  llmProvider: "anthropic" | "openai";
  llmModel: string;
  llmKeySet: boolean;
  agentName: string;
  signature: string;
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
  llm: "demo" | "ready" | "off" | "error";
  llmDetail: string;
}

export interface AppSnapshot {
  settings: PublicSettings;
  connection: ConnectionState;
  queue: QueueCard[];
  flagged: FlaggedCard[];
  selectedThreadId: string | null;
  thread: ThreadView | null;
  learning: LearningView;
  outbox: OutboxItem[];
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
  llmApiKey?: string;
  clearLlmApiKey?: boolean;
  llmProvider?: "anthropic" | "openai";
  llmModel?: string;
  agentName?: string;
  signature?: string;
  notificationsEnabled?: boolean;
  alwaysOnTop?: boolean;
  correctionsOptIn?: boolean;
  consentPhones?: ConsentWarning[];
}

export interface CommandResult {
  ok: boolean;
  message: string;
  openConfirm?: boolean;
  confirmText?: string;
}

export interface SendResult {
  ok: boolean;
  message: string;
}

export interface YsrApi {
  getSnapshot(): Promise<AppSnapshot>;
  onSnapshot(cb: (snapshot: AppSnapshot) => void): () => void;
  setAvailable(value: boolean): Promise<void>;
  setAlwaysOnTop(value: boolean): Promise<void>;
  selectThread(threadId: string | null): Promise<void>;
  runCommand(threadId: string, command: string): Promise<CommandResult>;
  confirmSend(threadId: string, text: string): Promise<SendResult>;
  saveSettings(patch: SettingsPatch): Promise<SendResult>;
  testRingCentral(): Promise<SendResult>;
  testAirtable(): Promise<SendResult>;
  startOAuth(): Promise<SendResult>;
  disconnectRingCentral(): Promise<SendResult>;
  createCorrectionsTable(): Promise<SendResult>;
  simulateInbound(): Promise<SendResult>;
  getPanelHint(): Promise<PanelId[]>;
}
