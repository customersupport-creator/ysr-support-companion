import { GENERAL_LIMIT_PER_MIN, MESSAGE_STORE_LIMIT_PER_MIN, SUPPORT_LINE_E164 } from "../../shared/constants";
import { retryDelayMs, SlidingWindowLimiter } from "../../core/rateLimit";
import { mapRcMessage } from "./mapMessage";
import type { SmsMessage } from "../../shared/types";

export interface RcTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
}

export interface RingCentralOptions {
  server: string;
  clientId: string;
  clientSecret: string;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  error_description?: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export class RingCentralClient {
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly light: SlidingWindowLimiter;
  private readonly general: SlidingWindowLimiter;
  private tokens: RcTokens | null = null;

  constructor(private readonly options: RingCentralOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.sleep = options.sleep ?? sleep;
    this.light = new SlidingWindowLimiter(MESSAGE_STORE_LIMIT_PER_MIN, 60_000, this.sleep);
    this.general = new SlidingWindowLimiter(GENERAL_LIMIT_PER_MIN, 60_000, this.sleep);
  }

  setTokens(tokens: RcTokens | null): void {
    this.tokens = tokens;
  }

  getTokens(): RcTokens | null {
    return this.tokens ? { ...this.tokens } : null;
  }

  async loginWithJwt(jwt: string): Promise<RcTokens> {
    const tokens = await this.tokenRequest({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    });
    this.tokens = tokens;
    return tokens;
  }

  async exchangeAuthCode(code: string, redirectUri: string, codeVerifier: string): Promise<RcTokens> {
    const tokens = await this.tokenRequest({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      code_verifier: codeVerifier,
    });
    this.tokens = tokens;
    return tokens;
  }

  async refresh(): Promise<RcTokens> {
    if (!this.tokens?.refreshToken) {
      throw new Error("RingCentral has no refresh token. Sign in again.");
    }
    const tokens = await this.tokenRequest({
      grant_type: "refresh_token",
      refresh_token: this.tokens.refreshToken,
    });
    this.tokens = tokens;
    return tokens;
  }

  async getWsToken(): Promise<{ uri: string; ws_access_token: string; expires_in: number }> {
    const response = await this.request("POST", "/restapi/oauth/wstoken");
    if (!response.ok) {
      throw new Error(`RingCentral WebSocket token failed (${response.status}).`);
    }
    const json = (await response.json()) as { uri?: string; ws_access_token?: string; expires_in?: number };
    if (!json.uri || !json.ws_access_token) throw new Error("RingCentral did not return a WebSocket token.");
    return { uri: json.uri, ws_access_token: json.ws_access_token, expires_in: json.expires_in ?? 30 };
  }

  /**
   * Full or incremental message sync. Message-sync shares the Light rate-limit group
   * with message-store, so calls go through the same limiter and back off on 429.
   */
  async syncSms(syncToken: string | null, dateFrom: string): Promise<{ messages: SmsMessage[]; syncToken: string | null }> {
    const path = syncToken
      ? `/restapi/v1.0/account/~/extension/~/message-sync?syncType=ISync&syncToken=${encodeURIComponent(syncToken)}`
      : `/restapi/v1.0/account/~/extension/~/message-sync?messageType=SMS&syncType=FSync&dateFrom=${encodeURIComponent(dateFrom)}&recordCount=250`;
    const response = await this.request("GET", path);
    if (!response.ok) {
      if (syncToken && (response.status === 400 || response.status === 410)) {
        return this.syncSms(null, dateFrom);
      }
      throw new Error(`RingCentral message sync failed (${response.status}).`);
    }
    const json = (await response.json()) as { records?: unknown[]; syncInfo?: { syncToken?: string } };
    const messages = (json.records ?? [])
      .map((record) => mapRcMessage(record))
      .filter((message): message is SmsMessage => message != null);
    return { messages, syncToken: json.syncInfo?.syncToken ?? null };
  }

  /** Send one SMS. Callers must already have passed the approval gate. */
  async sendSms(toE164: string, text: string): Promise<{ id: string }> {
    const response = await this.request("POST", "/restapi/v1.0/account/~/extension/~/sms", {
      from: { phoneNumber: SUPPORT_LINE_E164 },
      to: [{ phoneNumber: toE164 }],
      text,
    });
    if (!response.ok) {
      throw new Error(`RingCentral refused the SMS (${response.status}). Nothing else was sent.`);
    }
    const json = (await response.json()) as { id?: string | number };
    if (!json.id) throw new Error("RingCentral accepted the request but returned no message id.");
    return { id: String(json.id) };
  }

  private async tokenRequest(fields: Record<string, string>): Promise<RcTokens> {
    const body = new URLSearchParams(fields);
    const response = await this.fetchImpl(`${this.options.server}/restapi/oauth/token`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${this.options.clientId}:${this.options.clientSecret}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body,
    });
    const json = (await response.json().catch(() => ({}))) as TokenResponse;
    if (!response.ok || !json.access_token) {
      throw new Error(json.error_description || `RingCentral login failed (${response.status}).`);
    }
    return {
      accessToken: json.access_token,
      refreshToken: json.refresh_token,
      expiresAt: Date.now() + Math.max(30, (json.expires_in ?? 3600) - 60) * 1000,
    };
  }

  private async request(method: string, path: string, body?: unknown): Promise<Response> {
    await this.ensureAccessToken();
    const limiter = path.includes("message-store") || path.includes("message-sync") ? this.light : this.general;
    let unauthorizedRetry = false;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await limiter.take();
      const response = await this.fetchImpl(`${this.options.server}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${this.tokens?.accessToken ?? ""}`,
          Accept: "application/json",
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (response.status === 401 && !unauthorizedRetry && this.tokens?.refreshToken) {
        unauthorizedRetry = true;
        await this.refresh();
        continue;
      }
      if (response.status === 429) {
        await this.sleep(retryDelayMs(response.headers.get("retry-after"), attempt));
        continue;
      }
      return response;
    }
    throw new Error("RingCentral rate limit persisted after retries. Wait a minute and try again.");
  }

  private async ensureAccessToken(): Promise<void> {
    if (!this.tokens?.accessToken) throw new Error("RingCentral is not signed in.");
    if (this.tokens.refreshToken && this.tokens.expiresAt <= Date.now()) {
      await this.refresh();
    }
  }
}
