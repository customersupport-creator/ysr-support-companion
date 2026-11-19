import fs from "fs";
import path from "path";
import { app, safeStorage } from "electron";
import type { ConsentWarning, PublicSettings, ResolvedRecord, SettingsPatch } from "../shared/types";

interface FileShape {
  demoMode: boolean;
  rcServer: "production" | "sandbox";
  rcClientId: string;
  notificationsEnabled: boolean;
  alwaysOnTop: boolean;
  available: boolean;
  openNumbersIn: "desktop" | "web";
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
    openNumbersIn: "desktop",
    consentPhones: [],
    sealed: {},
  };
}

export class SettingsStore {
  private file: FileShape = defaults();
  private memorySecrets: Secrets = emptySecrets();
  readonly path: string;
  readonly resolvedPath: string;

  constructor() {
    const dir = app.getPath("userData");
    this.path = path.join(dir, "settings.json");
    this.resolvedPath = path.join(dir, "resolved.json");
  }

  load(): void {
    const saved = readJson(this.path);
    this.file = {
      ...defaults(),
      ...saved,
      consentPhones: Array.isArray(saved.consentPhones) ? saved.consentPhones : [],
      sealed: saved.sealed && typeof saved.sealed === "object" ? saved.sealed : {},
    };
    this.file.openNumbersIn = this.file.openNumbersIn === "web" ? "web" : "desktop";
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

  get openNumbersIn(): "desktop" | "web" {
    return this.file.openNumbersIn === "web" ? "web" : "desktop";
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
      openNumbersIn: this.file.openNumbersIn === "web" ? "web" : "desktop",
      consentPhones: this.file.consentPhones,
      secureStorage: this.secureStorageAvailable(),
    };
  }

  update(patch: SettingsPatch): { ok: boolean; message: string } {
    if (patch.demoMode != null) this.file.demoMode = patch.demoMode;
    if (patch.rcServer) this.file.rcServer = patch.rcServer;
    if (patch.rcClientId != null) this.file.rcClientId = patch.rcClientId.trim();
    if (patch.notificationsEnabled != null) this.file.notificationsEnabled = patch.notificationsEnabled;
    if (patch.alwaysOnTop != null) this.file.alwaysOnTop = patch.alwaysOnTop;
    if (patch.openNumbersIn === "desktop" || patch.openNumbersIn === "web") this.file.openNumbersIn = patch.openNumbersIn;
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

  private persist(): void {
    fs.mkdirSync(path.dirname(this.path), { recursive: true });
    fs.writeFileSync(this.path, JSON.stringify({ ...this.file, sealed: { ...this.file.sealed } }, null, 2), "utf8");
  }
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
