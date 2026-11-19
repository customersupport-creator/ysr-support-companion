import crypto from "crypto";
import http from "http";
import { shell } from "electron";
import { GMAIL_REDIRECT_URI, GMAIL_OAUTH_PORT } from "../shared/constants";

const READONLY_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";

export async function loginGmail(clientId: string, clientSecret: string): Promise<string> {
  const state = crypto.randomBytes(16).toString("hex");
  const codePromise = waitForCode(state);
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", GMAIL_REDIRECT_URI);
  url.searchParams.set("scope", READONLY_SCOPE);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("state", state);
  await shell.openExternal(url.toString());
  const code = await codePromise;
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: GMAIL_REDIRECT_URI,
      grant_type: "authorization_code",
    }),
  });
  const json = (await response.json()) as { refresh_token?: string; error_description?: string };
  if (!response.ok || !json.refresh_token) {
    throw new Error(json.error_description || "Gmail did not return a read-only refresh token.");
  }
  return json.refresh_token;
}

export async function gmailAccessToken(clientId: string, clientSecret: string, refreshToken: string): Promise<string> {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const json = (await response.json()) as { access_token?: string; error_description?: string };
  if (!response.ok || !json.access_token) {
    throw new Error(json.error_description || "Gmail read access expired. Connect Gmail again.");
  }
  return json.access_token;
}

function waitForCode(expectedState: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const server = http.createServer((request, response) => {
      const url = new URL(request.url ?? "/", `http://127.0.0.1:${GMAIL_OAUTH_PORT}`);
      if (url.pathname !== "/callback") {
        response.statusCode = 404;
        response.end();
        return;
      }
      response.setHeader("Content-Type", "text/html; charset=utf-8");
      response.end("<p>Gmail read access is connected. You can close this window.</p>");
      clearTimeout(timer);
      server.close();
      const error = url.searchParams.get("error");
      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state");
      if (error) reject(new Error(error));
      else if (!code || state !== expectedState) reject(new Error("Gmail login did not return a valid code."));
      else resolve(code);
    });
    const timer = setTimeout(() => {
      server.close();
      reject(new Error("Gmail login timed out. Try again."));
    }, 180_000);
    server.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    server.listen(GMAIL_OAUTH_PORT, "127.0.0.1", () => {
      server.removeAllListeners("error");
    });
  });
}
