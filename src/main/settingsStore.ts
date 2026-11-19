import fs from "fs";
import path from "path";
import { app, safeStorage } from "electron";
import { AIRTABLE } from "../shared/constants";
import type { ConsentWarning, PublicSettings, ResolvedRecord, SettingsPatch, UrgentSeenRecord } from "../shared/types";

interface FileShape {
  demoMode: boolean;
  rcServer: "production" | "sandbox";
  rcClientId: string;
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
  sealed: Record<string, string>;
}

export interface Secrets {
  rcClientSecret: string;
  rcJwt: string;
  airtableToken: string;
  rcRefreshToken: string;
  rcAccessToken: string;
  rcAccessExpiresAt: number;
}

const SECRET_KEYS = ["rcClientSecret", "rcJwt", "airtableToken", "rcRefreshToken", "rcAccessToken"] as const;

function defaults(): FileShape {
  return {
    demoMode: true,
    rcServer: "production",
    rcClientId: "",
    notificationsEnabled: true,
    alwaysOnTop: false,
    available: true,
    openNumbersIn: "beetexting",
    beeTextingTemplate: "https://app.beetexting.com/",
    urgentSound: true,
    showAccessCodes: false,
    historyMonthlyTable: AIRTABLE.monthlyTableId,
    historyLeaseTable: AIRTABLE.leaseTableId,
    historyTransientTable: AIRTABLE.transientTableId,
    transientHighValueOver: 15,
    autoResolveOnReply: true,
    followUpMinutes: 15,
    endorseFollowUpMinutes: 30,
    facilityAlertCustomers: 3,
    facilityAlertHours: 3,
    consentPhones: [],
    sealed: {},
  };
}

export class SettingsStore {
  private file: FileShape = defaults();
  private memorySecrets: Secrets = emptySecrets();
  readonly path: string;
  readonly resolvedPath: string;
  readonly urgentSeenPath: string;

  constructor() {
    const dir = app.getPath("userData");
    this.path = path.join(dir, "settings.json");
    this.resolvedPath = path.join(dir, "resolved.json");
    this.urgentSeenPath = path.join(dir, "urgent-seen.json");
  }

  load(): void {
    const saved = readJson(this.path);
    this.file = {
      ...defaults(),
      ...saved,
      consentPhones: Array.isArray(saved.consentPhones) ? saved.consentPhones : [],
      sealed: saved.sealed && typeof saved.sealed === "object" ? saved.sealed : {},
    };
    this.file.openNumbersIn =
      this.file.openNumbersIn === "desktop" || this.file.openNumbersIn === "web" || this.file.openNumbersIn === "beetexting"
        ? this.file.openNumbersIn
        : "beetexting";
    if (!this.file.beeTextingTemplate?.startsWith("https://app.beetexting.com/")) {
      this.file.beeTextingTemplate = "https://app.beetexting.com/";
    }
    this.file.urgentSound = this.file.urgentSound !== false;
    this.file.showAccessCodes = this.file.showAccessCodes === true;
    this.file.historyMonthlyTable = this.file.historyMonthlyTable || AIRTABLE.monthlyTableId;
    this.file.historyLeaseTable = this.file.historyLeaseTable || AIRTABLE.leaseTableId;
    this.file.historyTransientTable = this.file.historyTransientTable || AIRTABLE.transientTableId;
    const over = Number(this.file.transientHighValueOver);
    this.file.transientHighValueOver = Number.isFinite(over) && over >= 0 ? over : 15;
    this.file.autoResolveOnReply = this.file.autoResolveOnReply !== false;
    this.file.followUpMinutes = positive(this.file.followUpMinutes, 15);
    this.file.endorseFollowUpMinutes = positive(this.file.endorseFollowUpMinutes, 30);
    this.file.facilityAlertCustomers = positive(this.file.facilityAlertCustomers, 3);
    this.file.facilityAlertHours = positive(this.file.facilityAlertHours, 3);
    this.memorySecrets = emptySecrets();
    for (const key of SECRET_KEYS) this.memorySecrets[key] = unseal(this.file.sealed[key] ?? "");
    this.memorySecrets.rcAccessExpiresAt = Number(unseal(this.file.sealed.rcAccessExpiresAt ?? "") || "0");
  }

  get demoMode(): boolean {
    return this.file.demoMode;
  }

  get available(): boolean {
    return this.file.available;
  }

  get openNumbersIn(): "beetexting" | "desktop" | "web" {
    return this.file.openNumbersIn;
  }

  get beeTextingTemplate(): string {
    return this.file.beeTextingTemplate;
  }

  get urgentSound(): boolean {
    return this.file.urgentSound !== false;
  }

  get autoResolveOnReply(): boolean {
    return this.file.autoResolveOnReply !== false;
  }

  set available(value: boolean) {
    this.file.available = value;
    this.persist();
  }

  get alwaysOnTop(): boolean {
    return this.file.alwaysOnTop;
  }

  get notificationsEnabled(): boolean {
    return this.file.notificationsEnabled;
  }

  get consentPhones(): ConsentWarning[] {
    return this.file.consentPhones;
  }

  get secrets(): Secrets {
    return this.memorySecrets;
  }

  get rcServer(): "production" | "sandbox" {
    return this.file.rcServer;
  }

  get rcClientId(): string {
    return this.file.rcClientId;
  }

  secureStorageAvailable(): boolean {
    try {
      return safeStorage.isEncryptionAvailable();
    } catch {
      return false;
    }
  }

  toPublic(loggedIn: boolean): PublicSettings {
    return {
      demoMode: this.file.demoMode,
      rcServer: this.file.rcServer,
      rcClientId: this.file.rcClientId,
      hasRcSecret: Boolean(this.memorySecrets.rcClientSecret),
      hasRcJwt: Boolean(this.memorySecrets.rcJwt),
      rcLoggedIn: loggedIn,
      airtableTokenSet: Boolean(this.memorySecrets.airtableToken),
      notificationsEnabled: this.file.notificationsEnabled,
      alwaysOnTop: this.file.alwaysOnTop,
      available: this.file.available,
      openNumbersIn: this.file.openNumbersIn,
      beeTextingTemplate: this.file.beeTextingTemplate,
      urgentSound: this.file.urgentSound !== false,
      showAccessCodes: this.file.showAccessCodes === true,
      historyMonthlyTable: this.file.historyMonthlyTable || AIRTABLE.monthlyTableId,
      historyLeaseTable: this.file.historyLeaseTable || AIRTABLE.leaseTableId,
      historyTransientTable: this.file.historyTransientTable || AIRTABLE.transientTableId,
      transientHighValueOver: this.file.transientHighValueOver ?? 15,
      autoResolveOnReply: this.file.autoResolveOnReply !== false,
      followUpMinutes: positive(this.file.followUpMinutes, 15),
      endorseFollowUpMinutes: positive(this.file.endorseFollowUpMinutes, 30),
      facilityAlertCustomers: positive(this.file.facilityAlertCustomers, 3),
      facilityAlertHours: positive(this.file.facilityAlertHours, 3),
      consentPhones: this.file.consentPhones,
      secureStorage: this.secureStorageAvailable(),
    };
  }

  update(patch: SettingsPatch): { ok: boolean; message: string } {
    if (patch.beeTextingTemplate != null) {
      const next = patch.beeTextingTemplate.trim() || "https://app.beetexting.com/";
      if (!next.startsWith("https://app.beetexting.com/")) {
        return { ok: false, message: "BeeTexting links must start with https://app.beetexting.com/" };
      }
    }
    if (patch.demoMode != null) this.file.demoMode = patch.demoMode;
    if (patch.rcServer) this.file.rcServer = patch.rcServer;
    if (patch.rcClientId != null) this.file.rcClientId = patch.rcClientId.trim();
    if (patch.notificationsEnabled != null) this.file.notificationsEnabled = patch.notificationsEnabled;
    if (patch.alwaysOnTop != null) this.file.alwaysOnTop = patch.alwaysOnTop;
    if (patch.openNumbersIn === "desktop" || patch.openNumbersIn === "web" || patch.openNumbersIn === "beetexting") {
      this.file.openNumbersIn = patch.openNumbersIn;
    }
    if (patch.beeTextingTemplate != null) {
      this.file.beeTextingTemplate = patch.beeTextingTemplate.trim() || "https://app.beetexting.com/";
    }
    if (patch.urgentSound != null) this.file.urgentSound = patch.urgentSound;
    if (patch.showAccessCodes != null) this.file.showAccessCodes = patch.showAccessCodes;
    if (patch.historyMonthlyTable != null) this.file.historyMonthlyTable = patch.historyMonthlyTable.trim() || AIRTABLE.monthlyTableId;
    if (patch.historyLeaseTable != null) this.file.historyLeaseTable = patch.historyLeaseTable.trim() || AIRTABLE.leaseTableId;
    if (patch.historyTransientTable != null) this.file.historyTransientTable = patch.historyTransientTable.trim() || AIRTABLE.transientTableId;
    if (patch.transientHighValueOver != null && Number.isFinite(patch.transientHighValueOver) && patch.transientHighValueOver >= 0) {
      this.file.transientHighValueOver = patch.transientHighValueOver;
    }
    if (patch.autoResolveOnReply != null) this.file.autoResolveOnReply = patch.autoResolveOnReply;
    if (patch.followUpMinutes != null) this.file.followUpMinutes = positive(patch.followUpMinutes, 15);
    if (patch.endorseFollowUpMinutes != null) this.file.endorseFollowUpMinutes = positive(patch.endorseFollowUpMinutes, 30);
    if (patch.facilityAlertCustomers != null) this.file.facilityAlertCustomers = positive(patch.facilityAlertCustomers, 3);
    if (patch.facilityAlertHours != null) this.file.facilityAlertHours = positive(patch.facilityAlertHours, 3);
    if (patch.consentPhones) this.file.consentPhones = patch.consentPhones.filter((item) => item.phone.trim());
    const secretError = this.applySecrets(patch);
    this.persist();
    if (secretError) return { ok: false, message: secretError };
    return { ok: true, message: "Settings saved." };
  }

  rememberTokens(accessToken: string, refreshToken: string | undefined, expiresAt: number): void {
    this.memorySecrets.rcAccessToken = accessToken;
    this.memorySecrets.rcRefreshToken = refreshToken ?? "";
    this.memorySecrets.rcAccessExpiresAt = expiresAt;
    if (!this.secureStorageAvailable()) return;
    this.file.sealed.rcAccessToken = seal(accessToken);
    this.file.sealed.rcRefreshToken = refreshToken ? seal(refreshToken) : "";
    this.file.sealed.rcAccessExpiresAt = seal(String(expiresAt));
    this.persist();
  }

  loadResolved(): ResolvedRecord[] {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.resolvedPath, "utf8")) as ResolvedRecord[];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  saveResolved(records: ResolvedRecord[]): void {
    fs.mkdirSync(path.dirname(this.resolvedPath), { recursive: true });
    fs.writeFileSync(this.resolvedPath, JSON.stringify(records, null, 2), "utf8");
  }

  loadUrgentSeen(): UrgentSeenRecord[] {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.urgentSeenPath, "utf8")) as UrgentSeenRecord[];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  saveUrgentSeen(records: UrgentSeenRecord[]): void {
    fs.mkdirSync(path.dirname(this.urgentSeenPath), { recursive: true });
    fs.writeFileSync(this.urgentSeenPath, JSON.stringify(records, null, 2), "utf8");
  }

  clearTokens(): void {
    this.memorySecrets.rcAccessToken = "";
    this.memorySecrets.rcRefreshToken = "";
    this.memorySecrets.rcAccessExpiresAt = 0;
    delete this.file.sealed.rcAccessToken;
    delete this.file.sealed.rcRefreshToken;
    delete this.file.sealed.rcAccessExpiresAt;
    this.persist();
  }

  private applySecrets(patch: SettingsPatch): string {
    const writes: Array<["rcClientSecret" | "rcJwt" | "airtableToken", string | undefined, boolean | undefined]> = [
      ["rcClientSecret", patch.rcClientSecret, patch.clearRcSecret],
      ["rcJwt", patch.rcJwt, patch.clearRcJwt],
      ["airtableToken", patch.airtableToken, patch.clearAirtableToken],
    ];
    for (const [key, value, clear] of writes) {
      if (clear) {
        this.memorySecrets[key] = "";
        delete this.file.sealed[key];
        continue;
      }
      if (!value) continue;
      if (!this.secureStorageAvailable()) {
        return "Secure storage is unavailable, so the new secret was not written to disk. Other settings were saved.";
      }
      this.memorySecrets[key] = value;
      this.file.sealed[key] = seal(value);
    }
    return "";
  }

  saveEncrypted(fileName: string, value: unknown): void {
    if (!this.secureStorageAvailable()) return;
    const target = path.join(app.getPath("userData"), fileName);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, JSON.stringify({ sealed: seal(JSON.stringify(value)) }), "utf8");
  }

  loadEncrypted<T>(fileName: string): T | null {
    try {
      const target = path.join(app.getPath("userData"), fileName);
      const parsed = JSON.parse(fs.readFileSync(target, "utf8")) as { sealed?: string };
      const raw = unseal(parsed.sealed ?? "");
      if (!raw) return null;
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  private persist(): void {
    fs.mkdirSync(path.dirname(this.path), { recursive: true });
    fs.writeFileSync(this.path, JSON.stringify({ ...this.file, sealed: { ...this.file.sealed } }, null, 2), "utf8");
  }
}

function positive(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function emptySecrets(): Secrets {
  return {
    rcClientSecret: "",
    rcJwt: "",
    airtableToken: "",
    rcRefreshToken: "",
    rcAccessToken: "",
    rcAccessExpiresAt: 0,
  };
}

function readJson(file: string): Partial<FileShape> {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as Partial<FileShape>;
  } catch {
    return {};
  }
}

function seal(value: string): string {
  return `enc:${safeStorage.encryptString(value).toString("base64")}`;
}

function unseal(value: string): string {
  if (!value.startsWith("enc:")) return "";
  try {
    return safeStorage.decryptString(Buffer.from(value.slice(4), "base64"));
  } catch {
    return "";
  }
}
