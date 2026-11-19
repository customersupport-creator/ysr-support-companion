import path from "path";
import { BrowserWindow, session } from "electron";

export function createMainWindow(alwaysOnTop: boolean): BrowserWindow {
  const win = new BrowserWindow({
    width: 440,
    height: 860,
    minWidth: 360,
    minHeight: 560,
    title: "YSR Desk",
    backgroundColor: "#f3efe6",
    autoHideMenuBar: true,
    alwaysOnTop,
    show: true,
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (!devUrl) {
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          "Content-Security-Policy": [
            "default-src 'self'; style-src 'self'; script-src 'self'; img-src 'self' data:",
          ],
        },
      });
    });
    void win.loadFile(path.join(__dirname, "../renderer/index.html"));
  } else {
    void win.loadURL(devUrl);
  }
  return win;
}
