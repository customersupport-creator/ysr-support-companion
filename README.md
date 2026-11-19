# YourSpotRented support desk

A narrow Windows companion for the YourSpotRented.com support team. It sits beside RingCentral and watches SMS on **+1 (312) 999-5161**.

The desk shows customer numbers that still need a reply. When a number has been waiting 5 minutes, each Available agent gets one toast: `Hey, number (647) 989-5702 needs your attention`. It does not draft replies and it does not send SMS.

## Demo mode

Demo mode is the default and needs no credentials.

```bash
npm install
npm test
npm run dev
```

`npm run dev` opens the Electron window. `npm run dev:renderer` and http://127.0.0.1:5173 show the same desk in a browser. Sample threads include a taken spot, a tow, a gate code, a refund, reactions that are ignored, and a contact with a consent warning.

- Queue cards show wait time, a preview, and RED / YELLOW / GREEN from the playbook urgency rules.
- A number waiting under 5 minutes stays on the queue and does not toast. At 5 minutes, Available agents get one alert for that number. A later text from the same number does not raise a second alert until the first one has been answered.
- Opening a card shows the thread, the reservation details found in it, the facility record, and the matched SOP (steps, lookups, and who to escalate to).
- Consent-warning contacts, and anyone who texts STOP, STOPALL, or UNSUBSCRIBE, are listed under Do not text.

## Build the Windows installer

On a Windows machine:

```bash
npm install
npm run dist:win
```

The NSIS installer is `release/YourSpotRented-Setup-0.1.0.exe`. GitHub Actions (`.github/workflows/windows-installer.yml`) runs the tests and uploads that installer as `ysr-desk-windows-installer`. It is unsigned, so SmartScreen will warn until the file is code-signed.

Closing the window hides it to the tray. Quit from the tray icon.

## What an admin has to approve

### RingCentral

Create a private REST API app in the [RingCentral developer console](https://developers.ringcentral.com/):

1. App type: REST API App.
2. Auth: JWT auth flow, and Authorization code if agents will use the OAuth button.
3. Scopes: **ReadMessages**, **ReadAccounts**, **WebSocketsSubscription**. The app does not send SMS, so it does not need the SMS or EditMessages scopes.
4. OAuth redirect URI, if you use the login button: `http://127.0.0.1:47821/callback`.
5. Generate a JWT for the extension that owns **+1 312-999-5161**, or have each agent sign in with OAuth as a user who can read that line's message store.
6. An account admin must grant the app access to the account.

The desk subscribes over a WebSocket to inbound SMS (`message-store/instant?type=SMS`) and to message-store changes (so an outbound reply from RingCentral clears the queue). It also reconciles with message-sync about once a minute. Message-store is a Light rate-limit group (about 50 requests a minute). The client stays under that and backs off on HTTP 429.

Client ID, client secret, and JWT are saved with Electron `safeStorage` (Windows DPAPI). They are not written into the repo.

### Airtable

Create a personal access token at https://airtable.com/create/tokens with:

- `data.records:read`
- `schema.bases:read`

Attach both bases:

- BeeTexting QA (`app4Vn8uT6XtMn89X`) — SOPs in `BEETEXTING_SOPS`, and the existing SMS log in `BEETEXTING_MESSAGES` as a secondary feed.
- Facility Management Database (`app9iYUN8J3z2wjXN`) — `FACILITY INFORMATION`.

The desk only reads those tables. It does not write to them.

## Add a panel later

Panels are registered in `src/renderer/panels/registry.ts`. Add a component, add a row to `deskPanels`, and render it in `src/renderer/App.tsx`. Queue detection and SOP matching live in `src/core` and do not depend on Electron.

## Project scripts

| Script | What it does |
| --- | --- |
| `npm test` | Needs-reply rules, the 5-minute alert, SOP keyword matching, and the demo queue |
| `npm run typecheck` | Main process and renderer |
| `npm run dev` | Electron plus the Vite renderer |
| `npm run dist:win` | NSIS installer (run on Windows) |
