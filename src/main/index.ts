import fs from "fs";
import path from "path";
import { app, ipcMain } from "electron";
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
  ipcMain.handle("ysr:run-command", (_event, threadId: string, command: string) => {
    if (typeof threadId !== "string" || typeof command !== "string" || command.length > 4000) {
      return { ok: false, message: "That command was not accepted." };
    }
    return engine.runCommand(threadId, command);
  });
  ipcMain.handle("ysr:confirm-send", (_event, threadId: string, text: string) => {
    if (typeof threadId !== "string" || typeof text !== "string") {
      return { ok: false, message: "That send was not accepted." };
    }
    return engine.confirmSend(threadId, text);
  });
  ipcMain.handle("ysr:save-settings", (_event, patch: unknown) => {
    if (!patch || typeof patch !== "object") return { ok: false, message: "Settings were not saved." };
    return engine.saveSettings(patch as SettingsPatch);
  });
  ipcMain.handle("ysr:test-ringcentral", () => engine.testRingCentral());
  ipcMain.handle("ysr:test-airtable", () => engine.testAirtable());
  ipcMain.handle("ysr:start-oauth", () => engine.startOAuth());
  ipcMain.handle("ysr:disconnect", () => engine.disconnectRingCentral());
  ipcMain.handle("ysr:create-corrections-table", () => engine.createCorrectionsTable());
  ipcMain.handle("ysr:simulate", () => engine.simulateInbound());
  ipcMain.handle("ysr:panels", () => panelIds());

  app.on("second-instance", () => show());
  app.on("before-quit", () => {
    quitting = true;
    engine.stop();
  });
  app.on("activate", () => show());

  await engine.start();
  if (!win.isDestroyed()) win.webContents.send("ysr:snapshot", engine.snapshot());
});
