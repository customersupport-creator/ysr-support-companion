# YSR Desk

A narrow Windows companion for the Yourspotrented.com support team. It sits beside RingCentral and helps agents answer SMS on the support line **+1 (312) 999-5161**.

The desk watches for customer texts that still need a reply, matches them to the BeeTexting SOPs, and drafts two or three texts from the YSR Reply Playbook. An agent approves one exact message, confirms it, and only then does it send. Nothing is auto-sent, scheduled, or queued.

## What you can do without credentials

Demo mode is the default. It loads sample threads (a taken spot, a tow, a gate code, a refund, reactions that should be ignored, and a contact with a consent warning).

```bash
npm install
npm test
npm run dev
```

`npm run dev` opens the Electron window. In a browser, `npm run dev:renderer` and http://127.0.0.1:5173 show the same desk against the in-memory demo. Either way you can:

1. Open a queue card. The headline is the playbook line, for example `Hey, number (647) 989-5702 needs your attention`.
2. Read the thread, the concern, the mood, and the matched SOP.
3. Click **APPROVE A** (or type it). The confirm dialog shows the exact text.
4. Send. In demo mode the message is recorded on this computer and leaves the queue. It is not sent to a phone.
5. Try **EDIT:**, **REJECT**, **MINE:**, and **SKIP**. An edit clears the approval. MINE is stored unchanged and still needs APPROVE plus the confirm click.
6. Open the consent-warning card. Drafting and sending stay blocked.

Use **Simulate new text** on the queue to raise a new RED item. Available agents get a toast. Away agents do not.

## Build the Windows installer

On a Windows machine:

```bash
npm install
npm run dist:win
```

The NSIS installer is written to `release/YSR-Desk-Setup-0.1.0.exe`. It is per-user, lets the agent choose the folder, and adds Start menu and desktop shortcuts.

GitHub Actions (`.github/workflows/windows-installer.yml`) runs the tests and uploads that installer as the artifact `ysr-desk-windows-installer` from the `windows-latest` job. The installer is unsigned, so SmartScreen will warn until the file is code-signed. Set `CSC_LINK` / `CSC_KEY_PASSWORD` in the workflow when you have a certificate. The workflow sets `CSC_IDENTITY_AUTO_DISCOVERY=false` so a machine without a cert still produces an installer.

Closing the window hides it to the tray. Quit from the tray icon.

## What an admin has to approve

Agents can use demo mode with no secrets. Live SMS needs all of the following.

### RingCentral

Create a private REST API app in the [RingCentral developer console](https://developers.ringcentral.com/):

1. App type: REST API App.
2. Auth: JWT auth flow, and Authorization code if agents will use the OAuth button.
3. Scopes: **SMS**, **ReadMessages**, **ReadAccounts**, **EditMessages**, **WebSocketsSubscription**. Add **SubscriptionWebhook** only if you also keep the existing Airtable webhook.
4. OAuth redirect URI, if you use the login button: `http://127.0.0.1:47821/callback`.
5. Generate a JWT for the extension that owns **+1 312-999-5161**, or have each agent sign in with OAuth as a user who can send SMS from that number.
6. An account admin must grant the app access to the account, confirm SMS is enabled on that number, and confirm the JWT user can read the message store and send SMS for that line.

The desk subscribes over a WebSocket to inbound SMS (`message-store/instant?type=SMS`) and to message-store changes (outbound). It also reconciles with message-sync about once a minute. Message-store is a Light rate-limit group (about 50 requests a minute). The client stays under that and backs off on HTTP 429. WebSocket subscriptions renew while the socket is up; a drop reconnects and subscribes again.

Client ID, client secret, and JWT are saved with Electron `safeStorage` (Windows DPAPI / Credential Manager). They are not written into the repo or into plaintext settings.

### Airtable

Create a personal access token at https://airtable.com/create/tokens.

Everyday (read-only) scopes:

- `data.records:read`
- `schema.bases:read`

Attach both bases:

- BeeTexting QA (`app4Vn8uT6XtMn89X`) — SOPs in `BEETEXTING_SOPS`, and the existing SMS log in `BEETEXTING_MESSAGES` as a secondary feed.
- Facility Management Database (`app9iYUN8J3z2wjXN`) — `FACILITY INFORMATION` (name, address, GPS, status, notes, stall counts, towing company, sales tow authorization, landlord, do-not-tow plates).

The desk does not write to `BEETEXTING_SOPS`, `BEETEXTING_MESSAGES`, `BEETEXTING_QA`, or `FACILITY INFORMATION`. If a facility fact is missing, the draft says `[CHECK: ...]`. If an Airtable SOP and the playbook disagree, the draft follows the table and shows a note that starts with **Tell Hazel:**.

### Optional: AGENT_CORRECTIONS

Off unless an agent opts in. Settings explains the steps in the app. Summary:

1. Add `data.records:write` and `schema.bases:write` to the token. The person who clicks the button must be a base creator on BeeTexting QA.
2. Check **Opt in** and click **Create AGENT_CORRECTIONS table**.
3. The app creates that new table only when it is missing. If the table already exists, the app uses it and will not add or rename fields. It never updates any other table.

Local edits are always stored in the app's user-data folder and fed back into later drafts for that agent. Airtable is only the optional copy.

### LLM

Default provider is Anthropic. Put a Claude API key in Settings. The model box defaults to `claude-sonnet-4-5`; change it if your account uses a different id. OpenAI is the other provider (`gpt-4o-mini` is a reasonable model id). The key is stored with the same secure storage as the other secrets. Demo mode ignores the key and uses the local playbook drafter so the desk still runs offline.

The playbook file shipped with the app (`resources/ysr-reply-playbook.md`) is inserted verbatim into the model prompt. Customer texts are wrapped as untrusted data. The model cannot approve or send. A draft that promises a refund amount, admits fault, or includes a card number is scrubbed before the agent sees it. An agent's own **MINE:** text is not rewritten.

## How a reply gets sent

1. The latest genuine customer text has no real outbound after it. iMessage-style reactions (Liked, Loved, Emphasized, and the rest) are ignored.
2. Urgency follows playbook Step 2. RED re-notifies every 2 minutes, YELLOW every 5, and only while the agent is Available. GREEN does not repeat.
3. The agent clicks or types `APPROVE A`, `APPROVE B`, or `APPROVE C`. That approves one exact string.
4. A confirm dialog shows that string. Send is refused if the text differs by even one character.
5. `EDIT:` redrafts and clears the approval. `REJECT` discards the options. `MINE:` logs the agent's own words unchanged and still needs APPROVE. `SKIP` stops drafting until that customer sends a new message.
6. A contact on the consent list, or anyone who texts STOP / STOPALL / UNSUBSCRIBE, is flagged. The desk will not draft or send.

Presence is local: online means the app is running and Available is on. Each running copy notifies only its own Available agent.

## Add a panel later

Panels are registered in `src/renderer/panels/registry.ts`. Add a component, add a row to `deskPanels`, and render it in `src/renderer/App.tsx`. Queue detection, approval, SOP matching, and drafting live in `src/core` and do not depend on Electron, which is why `npm test` covers them without a window.

## Project scripts

| Script | What it does |
| --- | --- |
| `npm test` | Needs-reply, approval, SOP matching, and the demo approval flow |
| `npm run dev` | Electron plus the Vite renderer |
| `npm run typecheck` | Main process and renderer |
| `npm run dist:win` | NSIS installer (run on Windows) |
