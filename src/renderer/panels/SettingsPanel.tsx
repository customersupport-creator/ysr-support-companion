import { useState } from "react";
import type { AppSnapshot, SettingsPatch, YsrApi } from "../../shared/types";

export function SettingsPanel({
  api,
  snap,
  onNote,
}: {
  api: YsrApi;
  snap: AppSnapshot;
  onNote: (note: string) => void;
}) {
  const settings = snap.settings;
  const [clientId, setClientId] = useState(settings.rcClientId);
  const [secret, setSecret] = useState("");
  const [jwt, setJwt] = useState("");
  const [airtable, setAirtable] = useState("");
  const [server, setServer] = useState(settings.rcServer);
  const [consentText, setConsentText] = useState(
    settings.consentPhones.map((item) => `${item.phone} | ${item.reason}`).join("\n"),
  );

  const save = async (patch: SettingsPatch) => {
    const result = await api.saveSettings(patch);
    onNote(result.message);
  };

  return (
    <section className="panel settings">
      <h2>Desk</h2>
      <label className="check">
        <input
          type="checkbox"
          checked={settings.notificationsEnabled}
          onChange={(event) => void save({ notificationsEnabled: event.target.checked })}
        />
        Windows toast once a number has been waiting 5 minutes
      </label>
      <label>
        Open numbers in
        <select
          value={settings.openNumbersIn}
          onChange={(event) => void save({ openNumbersIn: event.target.value as "desktop" | "web" })}
        >
          <option value="desktop">RingCentral desktop app</option>
          <option value="web">RingCentral web</option>
        </select>
      </label>
      <p className="meta">
        The desktop app opens the SMS composer for that number. RingCentral has no link to an existing thread. Web copies the number and opens RingCentral in the browser.
      </p>
      <label className="check">
        <input
          type="checkbox"
          checked={settings.demoMode}
          onChange={(event) => void save({ demoMode: event.target.checked })}
        />
        Demo mode (sample threads, no network)
      </label>
      <p className="meta">{snap.connection.ringcentralDetail}</p>

      <h2>RingCentral</h2>
      <p className="meta">Read only. This app does not send SMS.</p>
      <label>
        Server
        <select value={server} onChange={(event) => setServer(event.target.value as "production" | "sandbox")}>
          <option value="production">Production</option>
          <option value="sandbox">Sandbox</option>
        </select>
      </label>
      <label>
        Client ID
        <input value={clientId} onChange={(event) => setClientId(event.target.value)} autoComplete="off" />
      </label>
      <label>
        Client secret {settings.hasRcSecret ? "(saved)" : ""}
        <input type="password" value={secret} onChange={(event) => setSecret(event.target.value)} autoComplete="off" />
      </label>
      <label>
        JWT {settings.hasRcJwt ? "(saved)" : ""}
        <input type="password" value={jwt} onChange={(event) => setJwt(event.target.value)} autoComplete="off" />
      </label>
      <div className="command-row">
        <button
          type="button"
          onClick={() =>
            void save({
              rcServer: server,
              rcClientId: clientId,
              ...(secret ? { rcClientSecret: secret } : {}),
              ...(jwt ? { rcJwt: jwt } : {}),
            })
          }
        >
          Save RingCentral
        </button>
        <button type="button" onClick={() => void api.testRingCentral().then((result) => onNote(result.message))}>
          Test
        </button>
        <button type="button" onClick={() => void api.startOAuth().then((result) => onNote(result.message))}>
          OAuth login
        </button>
        <button type="button" onClick={() => void api.disconnectRingCentral().then((result) => onNote(result.message))}>
          Sign out
        </button>
      </div>
      <p className="meta">Support line stays +1 312-999-5161. Secrets are sealed with Windows secure storage.</p>

      <h2>Airtable</h2>
      <p className="meta">{snap.connection.airtableDetail}</p>
      <label>
        Personal access token {settings.airtableTokenSet ? "(saved)" : ""}
        <input type="password" value={airtable} onChange={(event) => setAirtable(event.target.value)} autoComplete="off" />
      </label>
      <div className="command-row">
        <button type="button" onClick={() => void save(airtable ? { airtableToken: airtable } : {})}>
          Save token
        </button>
        <button type="button" onClick={() => void api.testAirtable().then((result) => onNote(result.message))}>
          Test read
        </button>
      </div>
      <p className="meta">Reads BEETEXTING_SOPS, the message log, and FACILITY INFORMATION. It does not write to those tables.</p>

      <h2>Consent warnings</h2>
      <p className="meta">One per line: phone, then a vertical bar, then the reason. These contacts are flagged. The desk does not text anyone.</p>
      <textarea value={consentText} onChange={(event) => setConsentText(event.target.value)} rows={4} />
      <button
        type="button"
        onClick={() =>
          void save({
            consentPhones: consentText
              .split("\n")
              .map((line) => line.trim())
              .filter(Boolean)
              .map((line) => {
                const [phone, ...rest] = line.split("|");
                return { phone: phone.trim(), reason: rest.join("|").trim() || "Consent warning" };
              }),
          })
        }
      >
        Save consent list
      </button>
    </section>
  );
}
