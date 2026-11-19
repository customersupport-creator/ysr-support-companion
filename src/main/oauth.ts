import crypto from "crypto";
import http from "http";
import { shell } from "electron";
import { OAUTH_PORT, OAUTH_REDIRECT_URI } from "../shared/constants";
import type { RingCentralClient } from "../services/ringcentral/client";

export async function loginWithOAuth(client: RingCentralClient, clientId: string, server: string): Promise<void> {
  const verifier = crypto.randomBytes(32).toString("base64url");
  const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
  const state = crypto.randomBytes(16).toString("hex");
  const codePromise = waitForCode(state);
  const url = new URL("/restapi/oauth/authorize", server);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", OAUTH_REDIRECT_URI);
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  await shell.openExternal(url.toString());
  const code = await codePromise;
  await client.exchangeAuthCode(code, OAUTH_REDIRECT_URI, verifier);
}

function waitForCode(expectedState: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const server = http.createServer((request, response) => {
      const url = new URL(request.url ?? "/", `http://127.0.0.1:${OAUTH_PORT}`);
      if (url.pathname !== "/callback") {
        response.statusCode = 404;
        response.end();
        return;
      }
      response.setHeader("Content-Type", "text/html; charset=utf-8");
      response.end("<p>You can close this window and return to YSR Desk.</p>");
      clearTimeout(timer);
      server.close();
      const error = url.searchParams.get("error");
      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state");
      if (error) reject(new Error(error));
      else if (!code || state !== expectedState) reject(new Error("Login did not return a valid code."));
      else resolve(code);
    });
    const timer = setTimeout(() => {
      server.close();
      reject(new Error("RingCentral login timed out. Try again."));
    }, 180_000);
    server.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    server.listen(OAUTH_PORT, "127.0.0.1", () => {
      server.removeAllListeners("error");
    });
  });
}
