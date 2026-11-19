import fs from "fs";
import path from "path";
import { app, safeStorage } from "electron";
import type { ConsentWarning, PublicSettings, SettingsPatch } from "../shared/types";

interface FileShape {
  demoMode: boolean;
  rcServer: "production" | "sandbox";
  rcClientId: string;
  llmProvider: "anthropic" | "openai";
  llmModel: string;
  agentName: string;
  signature: string;
  notificationsEnabled: boolean;
  alwaysOnTop: boolean;
  available: boolean;
  correctionsOptIn: boolean;
  correctionsTableId: string;
  consentPhones: ConsentWarning[];
  sealed: Record<string, string>;
}

export interface Secrets {
  rcClientSecret: string;
  rcJwt: string;
  airtableToken: string;
  llmApiKey: string;
  rcRefreshToken: string;
  rcAccessToken: string;
  rcAccessExpiresAt: number;
}

const SECRET_KEYS = ["rcClientSecret", "rcJwt", "airtableToken", "llmApiKey", "rcRefreshToken", "rcAccessToken"] as const;

function defaults(): FileShape {
  return {
    demoMode: true,
    rcServer: "production",
    rcClientId: "",
    llmProvider: "anthropic",
    llmModel: "claude-sonnet-4-5",
    agentName: "",
    signature: "",
    notificationsEnabled: true,
    alwaysOnTop: false,
    available: true,
    correctionsOptIn: false,
    correctionsTableId: "",
    consentPhones: [],
    sealed: {},
  };
}

export class SettingsStore {
  private file: FileShape = defaults();
  private memorySecrets: Secrets = emptySecrets();
  readonly path: string;
  readonly correctionsPath: string;

  constructor() {
    const dir = app.getPath("userData");
    this.path = path.join(dir, "settings.json");
    this.correctionsPath = path.join(dir, "corrections.json");
  }

  load(): void {
    this.file = { ...defaults(), ...readJson(this.path) };
    this.file.consentPhones = Array.isArray(this.file.consentPhones) ? this.file.consentPhones : [];
    this.file.sealed = this.file.sealed && typeof this.file.sealed === "object" ? this.file.sealed : {};
    this.memorySecrets = emptySecrets();
    for (const key of SECRET_KEYS) {
      this.memorySecrets[key] = unseal(this.file.sealed[key] ?? "");
    }
    const expires = this.file.sealed.rcAccessExpiresAt;
    this.memorySecrets.rcAccessExpiresAt = expires ? Number(unseal(expires) || "0") : 0;
  }

  get demoMode(): boolean {
    return this.file.demoMode;
  }

  get available(): boolean {
    return this.file.available;
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

  get correctionsOptIn(): boolean {
    return this.file.correctionsOptIn;
  }

  get correctionsTableId(): string {
    return this.file.correctionsTableId;
  }

  set correctionsTableId(value: string) {
    this.file.correctionsTableId = value;
    this.persist();
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

  get llmProvider(): "anthropic" | "openai" {
    return this.file.llmProvider;
  }

  get llmModel(): string {
    return this.file.llmModel;
  }

  get agentName(): string {
    return this.file.agentName;
  }

  get signature(): string {
    return this.file.signature;
  }

  secureStorageAvailable(): boolean {
    try {
      return safeStorage.isEncryptionAvailable();
    } catch {
      return false;
    }
  }

  toPublic(loggedIn: boolean, correctionsReady: boolean): PublicSettings {
    return {
      demoMode: this.file.demoMode,
      rcServer: this.file.rcServer,
      rcClientId: this.file.rcClientId,
      hasRcSecret: Boolean(this.memorySecrets.rcClientSecret),
      hasRcJwt: Boolean(this.memorySecrets.rcJwt),
      rcLoggedIn: loggedIn,
      airtableTokenSet: Boolean(this.memorySecrets.airtableToken),
      correctionsOptIn: this.file.correctionsOptIn,
      correctionsTableReady: correctionsReady,
      llmProvider: this.file.llmProvider,
      llmModel: this.file.llmModel,
      llmKeySet: Boolean(this.memorySecrets.llmApiKey),
      agentName: this.file.agentName,
      signature: this.file.signature,
      notificationsEnabled: this.file.notificationsEnabled,
      alwaysOnTop: this.file.alwaysOnTop,
      available: this.file.available,
      consentPhones: this.file.consentPhones,
      secureStorage: this.secureStorageAvailable(),
    };
  }

  update(patch: SettingsPatch): { ok: boolean; message: string } {
    if (patch.demoMode != null) this.file.demoMode = patch.demoMode;
    if (patch.rcServer) this.file.rcServer = patch.rcServer;
    if (patch.rcClientId != null) this.file.rcClientId = patch.rcClientId.trim();
    if (patch.llmProvider) this.file.llmProvider = patch.llmProvider;
    if (patch.llmModel != null) this.file.llmModel = patch.llmModel.trim() || defaults().llmModel;
    if (patch.agentName != null) this.file.agentName = patch.agentName.trim();
    if (patch.signature != null) this.file.signature = patch.signature;
    if (patch.notificationsEnabled != null) this.file.notificationsEnabled = patch.notificationsEnabled;
    if (patch.alwaysOnTop != null) this.file.alwaysOnTop = patch.alwaysOnTop;
    if (patch.correctionsOptIn != null) this.file.correctionsOptIn = patch.correctionsOptIn;
    if (patch.consentPhones) this.file.consentPhones = patch.consentPhones.filter((item) => item.phone.trim());

    const secretError = this.applySecrets(patch);
    this.persist();
    if (secretError) return { ok: false, message: secretError };
    return { ok: true, message: "Settings saved." };
  }

  private applySecrets(patch: SettingsPatch): string {
    const writes: Array<["rcClientSecret" | "rcJwt" | "airtableToken" | "llmApiKey", string | undefined, boolean | undefined]> = [
      ["rcClientSecret", patch.rcClientSecret, patch.clearRcSecret],
      ["rcJwt", patch.rcJwt, patch.clearRcJwt],
      ["airtableToken", patch.airtableToken, patch.clearAirtableToken],
      ["llmApiKey", patch.llmApiKey, patch.clearLlmApiKey],
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

  clearTokens(): void {
    this.memorySecrets.rcAccessToken = "";
    this.memorySecrets.rcRefreshToken = "";
    this.memorySecrets.rcAccessExpiresAt = 0;
    delete this.file.sealed.rcAccessToken;
    delete this.file.sealed.rcRefreshToken;
    delete this.file.sealed.rcAccessExpiresAt;
    this.persist();
  }

  private persist(): void {
    fs.mkdirSync(path.dirname(this.path), { recursive: true });
    const copy: FileShape = { ...this.file, sealed: { ...this.file.sealed } };
    fs.writeFileSync(this.path, JSON.stringify(copy, null, 2), "utf8");
  }
}

function emptySecrets(): Secrets {
  return {
    rcClientSecret: "",
    rcJwt: "",
    airtableToken: "",
    llmApiKey: "",
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
