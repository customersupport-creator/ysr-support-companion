import { contextBridge, ipcRenderer } from "electron";
import type { AppSnapshot, CommandResult, SendResult, SettingsPatch, YsrApi } from "../shared/types";
import type { PanelId } from "../shared/constants";

const api: YsrApi = {
  getSnapshot: () => ipcRenderer.invoke("ysr:get-snapshot") as Promise<AppSnapshot>,
  onSnapshot: (cb) => {
    const listener = (_event: unknown, snapshot: AppSnapshot) => cb(snapshot);
    ipcRenderer.on("ysr:snapshot", listener);
    return () => ipcRenderer.removeListener("ysr:snapshot", listener);
  },
  setAvailable: (value) => ipcRenderer.invoke("ysr:set-available", value) as Promise<void>,
  setAlwaysOnTop: (value) => ipcRenderer.invoke("ysr:set-always-on-top", value) as Promise<void>,
  selectThread: (threadId) => ipcRenderer.invoke("ysr:select-thread", threadId) as Promise<void>,
  runCommand: (threadId, command) => ipcRenderer.invoke("ysr:run-command", threadId, command) as Promise<CommandResult>,
  confirmSend: (threadId, text) => ipcRenderer.invoke("ysr:confirm-send", threadId, text) as Promise<SendResult>,
  saveSettings: (patch: SettingsPatch) => ipcRenderer.invoke("ysr:save-settings", patch) as Promise<SendResult>,
  testRingCentral: () => ipcRenderer.invoke("ysr:test-ringcentral") as Promise<SendResult>,
  testAirtable: () => ipcRenderer.invoke("ysr:test-airtable") as Promise<SendResult>,
  startOAuth: () => ipcRenderer.invoke("ysr:start-oauth") as Promise<SendResult>,
  disconnectRingCentral: () => ipcRenderer.invoke("ysr:disconnect") as Promise<SendResult>,
  createCorrectionsTable: () => ipcRenderer.invoke("ysr:create-corrections-table") as Promise<SendResult>,
  simulateInbound: () => ipcRenderer.invoke("ysr:simulate") as Promise<SendResult>,
  getPanelHint: () => ipcRenderer.invoke("ysr:panels") as Promise<PanelId[]>,
};

contextBridge.exposeInMainWorld("ysr", api);
