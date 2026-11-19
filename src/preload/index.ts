import { contextBridge, ipcRenderer } from "electron";
import type { ActionResult, AppSnapshot, CustomerHistoryPage, SettingsPatch, YsrApi } from "../shared/types";
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
  resolveThread: (threadId) => ipcRenderer.invoke("ysr:resolve", threadId) as Promise<ActionResult>,
  unresolvePhone: (phone) => ipcRenderer.invoke("ysr:unresolve", phone) as Promise<ActionResult>,
  copyText: (text) => ipcRenderer.invoke("ysr:copy-text", text) as Promise<ActionResult>,
  openNumber: (phone) => ipcRenderer.invoke("ysr:open-number", phone) as Promise<ActionResult>,
  markUrgentSeen: () => ipcRenderer.invoke("ysr:mark-urgent-seen") as Promise<void>,
  onUrgentChime: (listener) => {
    const wrapped = () => listener();
    ipcRenderer.on("ysr:urgent-chime", wrapped);
    return () => ipcRenderer.removeListener("ysr:urgent-chime", wrapped);
  },
  saveSettings: (patch: SettingsPatch) => ipcRenderer.invoke("ysr:save-settings", patch) as Promise<ActionResult>,
  testRingCentral: () => ipcRenderer.invoke("ysr:test-ringcentral") as Promise<ActionResult>,
  testAirtable: () => ipcRenderer.invoke("ysr:test-airtable") as Promise<ActionResult>,
  startOAuth: () => ipcRenderer.invoke("ysr:start-oauth") as Promise<ActionResult>,
  disconnectRingCentral: () => ipcRenderer.invoke("ysr:disconnect") as Promise<ActionResult>,
  simulateInbound: () => ipcRenderer.invoke("ysr:simulate") as Promise<ActionResult>,
  getPanelHint: () => ipcRenderer.invoke("ysr:panels") as Promise<PanelId[]>,
  refreshFacilities: () => ipcRenderer.invoke("ysr:refresh-facilities") as Promise<ActionResult>,
  setFacilityPick: (phone, facilityId) => ipcRenderer.invoke("ysr:set-facility", phone, facilityId) as Promise<void>,
  loadHistory: (phone, cursor) => ipcRenderer.invoke("ysr:load-history", phone, cursor ?? null) as Promise<CustomerHistoryPage>,
  snoozeFollowUp: (id, minutes) => ipcRenderer.invoke("ysr:snooze-follow-up", id, minutes) as Promise<void>,
  completeFollowUp: (id) => ipcRenderer.invoke("ysr:complete-follow-up", id) as Promise<void>,
  updateCommitment: (id, status, note) => ipcRenderer.invoke("ysr:update-commitment", id, status, note) as Promise<void>,
  dismissFacilityAlert: (id) => ipcRenderer.invoke("ysr:dismiss-alert", id) as Promise<void>,
  commitmentCsv: () => ipcRenderer.invoke("ysr:commitment-csv") as Promise<string>,
};

contextBridge.exposeInMainWorld("ysr", api);
