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
  const [agentName, setAgentName] = useState(settings.agentName);
  const [signature, setSignature] = useState(settings.signature);
  const [clientId, setClientId] = useState(settings.rcClientId);
  const [secret, setSecret] = useState("");
  const [jwt, setJwt] = useState("");
  const [airtable, setAirtable] = useState("");
  const [llmKey, setLlmKey] = useState("");
  const [model, setModel] = useState(settings.llmModel);
  const [provider, setProvider] = useState(settings.llmProvider);
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
      <h2>Agent</h2>
      <label>
        Display name
        <input value={agentName} onChange={(event) => setAgentName(event.target.value)} />
      </label>
      <label>
        Signature, added to drafted texts only
        <input value={signature} onChange={(event) => setSignature(event.target.value)} placeholder="- Maya, YSR" />
      </label>
      <label className="check">
        <input
          type="checkbox"
          checked={settings.notificationsEnabled}
          onChange={(event) => void save({ notificationsEnabled: event.target.checked })}
        />
        Windows toasts when you are Available
      </label>
      <label className="check">
        <input
          type="checkbox"
          checked={settings.demoMode}
          onChange={(event) => void save({ demoMode: event.target.checked })}
        />
        Demo mode (sample threads, no network sends)
      </label>
      <button type="button" onClick={() => void save({ agentName, signature })}>
        Save name and signature
      </button>

      <h2>RingCentral</h2>
      <p className="meta">{snap.connection.ringcentralDetail}</p>
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
      <p className="meta">Support line stays +1 312-999-5161. Secrets are sealed with Windows secure storage and are not written in plaintext.</p>

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

      <h2>LLM</h2>
      <p className="meta">{snap.connection.llmDetail}</p>
      <label>
        Provider
        <select value={provider} onChange={(event) => setProvider(event.target.value as "anthropic" | "openai")}>
          <option value="anthropic">Anthropic Claude</option>
          <option value="openai">OpenAI</option>
        </select>
      </label>
      <label>
        Model
        <input value={model} onChange={(event) => setModel(event.target.value)} />
      </label>
      <label>
        API key {settings.llmKeySet ? "(saved)" : ""}
        <input type="password" value={llmKey} onChange={(event) => setLlmKey(event.target.value)} autoComplete="off" />
      </label>
      <button type="button" onClick={() => void save({ llmProvider: provider, llmModel: model, ...(llmKey ? { llmApiKey: llmKey } : {}) })}>
        Save LLM
      </button>

      <h2>Consent warnings</h2>
      <p className="meta">One per line: phone, then a vertical bar, then the reason. These contacts are flagged. The desk will not draft or send.</p>
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

      <h2>Optional Airtable learning</h2>
      <div className="callout">
        <p>
          This creates a new table named AGENT_CORRECTIONS in BeeTexting QA. It does not modify BEETEXTING_SOPS,
          BEETEXTING_MESSAGES, BEETEXTING_QA, or FACILITY INFORMATION.
        </p>
        <ol>
          <li>Token scopes for everyday use: data.records:read and schema.bases:read, with both bases attached.</li>
          <li>Add data.records:write and schema.bases:write only if you want this sync. You must be a base creator.</li>
          <li>Check the box, save, then create the table. If it already exists, the app uses it and will not change its fields.</li>
        </ol>
      </div>
      <label className="check">
        <input
          type="checkbox"
          checked={settings.correctionsOptIn}
          onChange={(event) => void save({ correctionsOptIn: event.target.checked })}
        />
        Opt in to sync my edits to AGENT_CORRECTIONS
      </label>
      <button type="button" disabled={!settings.correctionsOptIn} onClick={() => void api.createCorrectionsTable().then((result) => onNote(result.message))}>
        Create AGENT_CORRECTIONS table
      </button>
      <p className="meta">{settings.correctionsTableReady ? "Table is ready." : "Table is not confirmed yet."}</p>
    </section>
  );
}
