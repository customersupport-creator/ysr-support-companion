import fs from "fs";
import path from "path";
import { app, clipboard, ipcMain } from "electron";
import type { SettingsPatch } from "../shared/types";
import { DeskEngine, panelIds } from "./engine";
import { SettingsStore } from "./settingsStore";
import { createTray } from "./tray";
import { createMainWindow } from "./window";

if (!app.requestSingleInstanceLock()) {
  app.quit();
}

app.setAppUserModelId("com.yourspotrented.desk");

let quitting = false;

app.whenReady().then(async () => {
  const store = new SettingsStore();
  store.load();
  const engine = new DeskEngine(store);
  let win = createMainWindow(store.alwaysOnTop);

  const show = () => {
    if (win.isDestroyed()) win = createMainWindow(store.alwaysOnTop);
    engine.attachWindow(win);
    win.show();
    win.focus();
  };

  engine.attachWindow(win);
  engine.setShowWindow(show);
  win.on("focus", () => {
    if (!win.isDestroyed()) win.flashFrame(false);
  });
  win.on("close", (event) => {
    if (!quitting) {
      event.preventDefault();
      win.hide();
    }
  });

  const iconPath = [path.join(process.resourcesPath, "icon.png"), path.join(__dirname, "../../resources/icon.png")].find(
    (candidate) => fs.existsSync(candidate),
  );
  createTray({
    iconPath: iconPath ?? "",
    isAvailable: () => store.available,
    onShow: show,
    onToggleAvailable: (value) => void engine.setAvailable(value),
    onQuit: () => {
      quitting = true;
      engine.stop();
      app.quit();
    },
  });

  ipcMain.handle("ysr:get-snapshot", () => engine.snapshot());
  ipcMain.handle("ysr:set-available", (_event, value: boolean) => engine.setAvailable(Boolean(value)));
  ipcMain.handle("ysr:set-always-on-top", async (_event, value: boolean) => {
    const on = Boolean(value);
    if (!win.isDestroyed()) win.setAlwaysOnTop(on);
    return engine.saveSettings({ alwaysOnTop: on });
  });
  ipcMain.handle("ysr:select-thread", (_event, threadId: string | null) => engine.selectThread(threadId));
  ipcMain.handle("ysr:resolve", (_event, threadId: string) => {
    if (typeof threadId !== "string") return { ok: false, message: "Could not resolve that number." };
    return engine.resolveThread(threadId);
  });
  ipcMain.handle("ysr:unresolve", (_event, phone: string) => {
    if (typeof phone !== "string") return { ok: false, message: "Could not restore that number." };
    return engine.unresolvePhone(phone);
  });
  ipcMain.handle("ysr:mark-urgent-seen", () => engine.markUrgentSeen());
  ipcMain.handle("ysr:open-number", (_event, phone: string) => {
    if (typeof phone !== "string") return { ok: false, message: "Could not open that number." };
    return engine.openNumber(phone);
  });
  ipcMain.handle("ysr:copy-text", (_event, text: string) => {
    if (typeof text !== "string" || text.length > 32) return { ok: false, message: "Could not copy that." };
    clipboard.writeText(text);
    return { ok: true, message: "Copied." };
  });
  ipcMain.handle("ysr:save-settings", (_event, patch: unknown) => {
    if (!patch || typeof patch !== "object") return { ok: false, message: "Settings were not saved." };
    return engine.saveSettings(patch as SettingsPatch);
  });
  ipcMain.handle("ysr:test-ringcentral", () => engine.testRingCentral());
  ipcMain.handle("ysr:test-airtable", () => engine.testAirtable());
  ipcMain.handle("ysr:start-oauth", () => engine.startOAuth());
  ipcMain.handle("ysr:start-gmail", () => engine.startGmailOAuth());
  ipcMain.handle("ysr:disconnect-gmail", () => engine.disconnectGmail());
  ipcMain.handle("ysr:disconnect", () => engine.disconnectRingCentral());
  ipcMain.handle("ysr:simulate", () => engine.simulateInbound());
  ipcMain.handle("ysr:panels", () => panelIds());
  ipcMain.handle("ysr:refresh-facilities", () => engine.refreshFacilities());
  ipcMain.handle("ysr:set-facility", (_event, phone: string, facilityId: string | null) => {
    if (typeof phone !== "string") return;
    engine.setFacilityPick(phone, typeof facilityId === "string" ? facilityId : null);
  });
  ipcMain.handle("ysr:snooze-follow-up", (_event, id: string, minutes: number) => engine.snoozeFollowUp(id, Number(minutes)));
  ipcMain.handle("ysr:complete-follow-up", (_event, id: string) => engine.completeFollowUp(id));
  ipcMain.handle("ysr:update-commitment", (_event, id: string, status: "open" | "waiting" | "done", note: string) =>
    engine.updateCommitment(id, status, typeof note === "string" ? note : ""),
  );
  ipcMain.handle("ysr:dismiss-alert", (_event, id: string) => engine.dismissFacilityAlert(id));
  ipcMain.handle("ysr:commitment-csv", () => engine.commitmentCsv());
  ipcMain.handle("ysr:load-history", (_event, phone: string, cursor?: string | null) => {
    if (typeof phone !== "string") return { phone: "", messages: [], nextCursor: null, bookings: [] };
    return engine.loadHistory(phone, cursor);
  });

  app.on("second-instance", () => show());
  app.on("before-quit", () => {
    quitting = true;
    engine.stop();
  });
  app.on("activate", () => show());

  await engine.start();
  if (!win.isDestroyed()) win.webContents.send("ysr:snapshot", engine.snapshot());
});
