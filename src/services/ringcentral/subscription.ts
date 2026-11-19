import { smsFromNotification } from "./mapMessage";
import type { RingCentralClient } from "./client";
import type { SmsMessage } from "../../shared/types";

type Status = "off" | "live" | "reconnecting";

/**
 * Inbound SMS uses the instant message-store filter. The plain message-store
 * filter covers outbound sends. WebSocket subscriptions stay up while the
 * socket is open; a drop reconnects and subscribes again. A periodic sync
 * covers anything the socket misses.
 */
export class RcEventStream {
  private ws: WebSocket | null = null;
  private stopped = false;
  private subscribed = false;
  private retry = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly client: RingCentralClient,
    private readonly onMessages: (messages: SmsMessage[]) => void,
    private readonly onStatus: (status: Status, detail: string) => void,
  ) {}

  start(): void {
    this.stopped = false;
    void this.connect();
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.ws?.close();
    this.ws = null;
    this.onStatus("off", "Subscription stopped.");
  }

  private async connect(): Promise<void> {
    if (this.stopped) return;
    this.subscribed = false;
    try {
      const token = await this.client.getWsToken();
      const joiner = token.uri.includes("?") ? "&" : "?";
      const url = `${token.uri}${joiner}access_token=${encodeURIComponent(token.ws_access_token)}`;
      const ws = new WebSocket(url);
      this.ws = ws;
      ws.addEventListener("message", (event) => {
        this.handle(String(event.data), ws);
      });
      ws.addEventListener("close", () => {
        if (this.ws !== ws || this.stopped) return;
        this.scheduleReconnect("WebSocket closed.");
      });
      ws.addEventListener("error", () => {
        this.onStatus("reconnecting", "WebSocket error. Reconnecting.");
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "WebSocket setup failed.";
      this.scheduleReconnect(message);
    }
  }

  private scheduleReconnect(detail: string): void {
    if (this.stopped) return;
    const delay = Math.min(30_000, 1000 * 2 ** this.retry);
    this.retry += 1;
    this.onStatus("reconnecting", detail);
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      void this.connect();
    }, delay);
  }

  private handle(raw: string, ws: WebSocket): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return;
    }
    if (!this.subscribed && hasConnectionDetails(parsed)) {
      this.subscribed = true;
      this.retry = 0;
      this.onStatus("live", "Listening for SMS.");
      ws.send(
        JSON.stringify([
          {
            type: "ClientRequest",
            messageId: globalThis.crypto.randomUUID(),
            method: "POST",
            path: "/restapi/v1.0/subscription",
          },
          {
            eventFilters: [
              "/restapi/v1.0/account/~/extension/~/message-store/instant?type=SMS",
              "/restapi/v1.0/account/~/extension/~/message-store",
            ],
            deliveryMode: { transportType: "WebSocket" },
          },
        ]),
      );
    }
    const messages = smsFromNotification(parsed);
    if (messages.length > 0) this.onMessages(messages);
  }
}

function hasConnectionDetails(payload: unknown): boolean {
  if (!Array.isArray(payload)) return false;
  return payload.some((item) => item && typeof item === "object" && (item as { type?: string }).type === "ConnectionDetails");
}
