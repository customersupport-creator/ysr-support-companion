import { Menu, Tray, nativeImage, app } from "electron";

export function createTray(options: {
  iconPath: string;
  isAvailable: () => boolean;
  onShow: () => void;
  onToggleAvailable: (value: boolean) => void;
  onQuit: () => void;
}): Tray {
  const image = nativeImage.createFromPath(options.iconPath);
  const tray = new Tray(image.isEmpty() ? nativeImage.createFromDataURL(FALLBACK_ICON) : image);
  tray.setToolTip("YourSpotRented");
  const refresh = () => {
    const available = options.isAvailable();
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: "Show YourSpotRented", click: options.onShow },
        {
          label: available ? "Set away" : "Set available",
          click: () => options.onToggleAvailable(!available),
        },
        { type: "separator" },
        { label: "Quit", click: options.onQuit },
      ]),
    );
  };
  refresh();
  tray.on("click", options.onShow);
  tray.on("right-click", refresh);
  app.on("before-quit", () => tray.destroy());
  return tray;
}

const FALLBACK_ICON =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
