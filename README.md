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
- The header bell lists unresolved urgent threads (towing, damage, threats, stuck, and the other urgent keywords). The red badge is how many of those the agent has not marked seen. A new urgent thread toasts immediately while the agent is Available, plays a short sound (mute it in Settings), and flashes the taskbar. Away still updates the badge and does not play the sound. Mark seen clears the highlight. Resolve or an answer removes the item. Nothing is sent.
- Each card shows rental IDs found in the thread (usually a 9-digit SpotHero id such as 138424128), with a copy button. The 5-minute toast includes the newest id when one is known.
- Resolve removes that number from the queue on this computer only. It does not text the customer or change RingCentral. If they text again, the number comes back. Undo is available for a few seconds, and Resolved today lists what you hid today.
- When Auto-resolve is on (the default), a real reply from the support line clears that number from the queue and the urgent bell, cancels its pending alert, and logs `Auto-resolved: replied by {agent} at {time CT}`. Reactions, out-of-hours auto-replies, opt-out confirmations, and failed or undelivered sends stay on the queue. A later customer text opens it again.
- **Open in BeeTexting** is the default. It copies the customer number as `+1XXXXXXXXXX` and opens https://app.beetexting.com/ so you can paste it into BeeTexting search. Settings can store an optional conversation link on that same host, with `{number}`, `{number_e164}`, or `{number_digits}`, for the day BeeTexting documents a thread URL. RingCentral desktop and RingCentral web stay available. Desktop uses `rcapp://r/sms?type=new&number=...` with no message text, and falls back to the website if the app does not open. Nothing is sent.
- Consent-warning contacts, and anyone who texts STOP, STOPALL, or UNSUBSCRIBE, are listed under Do not text. A ClickSend STOP is marked `Opted out — do not text`.
- ClickSend replies are read from Gmail only. Direct mail from `+1...@sms.clicksend.com` and the Google Voice copy of the same text are one queue item, with a ClickSend badge. `Intro sent` means the support line already sent its standard first text. That intro is not a finished reply. A later real reply from +1 (312) 999-5161 clears the item. The Gmail scope is `gmail.readonly`. The desk does not send email.
- Garage and gate codes are parsed from facility notes. A card shows the code when the thread, a booking, or a manual pick identifies the facility. Codes are hidden until you reveal them. Facilities with codes is a searchable list, in-operation sites first. Parsed codes are encrypted on this computer and refresh on launch, every 30 minutes, and from Refresh.
- A follow-up reminder starts when an agent promises to check back ("checking on it", "I'll update you", "will endorse this for processing", and the other phrases in the rules). The default is 15 minutes, or 30 for endorse/processing. The Follow-ups tab counts the ones that are due, and a due item can be snoozed or marked done. Another real outbound text clears it.
- Refunds and promises from the last 30 days are listed with the amount as written, who said it, and how old it is. Amber means older than 24 hours and red means older than 72. Marking done is local. A later "refund was sent" only suggests Done. Export CSV from that tab.
- If three or more customers report the same problem at one facility inside three hours, a facility alert names the place and the problem. Towed and inaccessible alerts also show on the urgent bell. Acknowledge hides that set of reports until a new one arrives. The customer count and the window are in Settings.
- Customer history, on each card, lists past SMS for that number and bookings from MONTHLY, Internal lease, and TRANSIENT. Issue tags summarize repeat problems. High value means an active monthly or lease, or more than 15 deduped transient bookings. The threshold is in Settings. Demo facilities and codes are made up.

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

### Gmail, for ClickSend replies

Create an OAuth client in Google Cloud (Desktop app). The only scope the desk requests is `https://www.googleapis.com/auth/gmail.readonly`. Redirect URI: `http://127.0.0.1:47822/callback`. Put the client ID and secret in Settings and click Connect Gmail. The desk searches for ClickSend reply mail and Google Voice copies. It does not send, delete, or label mail.
4. OAuth redirect URI, if you use the login button: `http://127.0.0.1:47821/callback`.
5. Generate a JWT for the extension that owns **+1 312-999-5161**, or have each agent sign in with OAuth as a user who can read that line's message store.
6. An account admin must grant the app access to the account.

The desk subscribes over a WebSocket to inbound SMS (`message-store/instant?type=SMS`) and to message-store changes (so an outbound reply from RingCentral clears the queue). It also reconciles with message-sync about once a minute. Message-store is a Light rate-limit group (about 50 requests a minute). The client stays under that and backs off on HTTP 429.

Client ID, client secret, and JWT are saved with Electron `safeStorage` (Windows DPAPI). They are not written into the repo.

### Airtable

Create a personal access token at https://airtable.com/create/tokens with:

- `data.records:read`
- `schema.bases:read`

The same token reads Facility Management for `FACILITY INFORMATION`, `MONTHLY`, `Internal lease`, and `TRANSIENT`. Table names are in Settings if a base uses different ones. The desk only reads those tables. It does not write to them.

Attach both bases:

- BeeTexting QA (`app4Vn8uT6XtMn89X`) — SOPs in `BEETEXTING_SOPS`, and the existing SMS log in `BEETEXTING_MESSAGES` as a secondary feed.
- Facility Management Database (`app9iYUN8J3z2wjXN`) — `FACILITY INFORMATION`, plus `MONTHLY`, `Internal lease`, and `TRANSIENT` for booking history.

## Add a panel later

Panels are registered in `src/renderer/panels/registry.ts`. Add a component, add a row to `deskPanels`, and render it in `src/renderer/App.tsx`. Queue detection and SOP matching live in `src/core` and do not depend on Electron.

## Project scripts

| Script | What it does |
| --- | --- |
| `npm test` | Needs-reply rules, the 5-minute alert, SOP keyword matching, and the demo queue |
| `npm run typecheck` | Main process and renderer |
| `npm run dev` | Electron plus the Vite renderer |
| `npm run dist:win` | NSIS installer (run on Windows) |
