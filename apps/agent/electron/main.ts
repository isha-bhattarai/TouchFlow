import { join } from "node:path";
import { BrowserWindow, Menu, Tray, app, nativeImage } from "electron";
import { DEFAULT_AGENT_PORT } from "@touchflow/shared";
import { createAgentServer } from "../src/server/createServer";
import { createNutInputController } from "../src/server/input";
import { loadOrCreateSecret } from "../src/server/storage";

const TRAY_ICON_B64 = "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAMklEQVR4nGNgQAO6V/b/x4fR1ROtEa9BpGrGMIQiA8jVDDdk1IBhYcDAp0SqZCZKsjMAu8BnP8FcbcQAAAAASUVORK5CYII=";

let win: BrowserWindow | null = null;
let tray: Tray | null = null;
let quitting = false;

function showWindow(): void {
  if (win === null) return;
  win.show();
  win.focus();
}

function buildTray(): void {
  const icon = nativeImage.createFromDataURL(
    `data:image/png;base64,${TRAY_ICON_B64}`,
  );
  tray = new Tray(icon);
  tray.setToolTip("TouchFlow Agent");
  const rebuild = () => {
    const menu = Menu.buildFromTemplate([
      { label: "Show window", click: showWindow },
      {
        label: "Start at login",
        type: "checkbox",
        checked: app.getLoginItemSettings().openAtLogin,
        click: (item) => {
          app.setLoginItemSettings({ openAtLogin: item.checked });
          rebuild();
        },
      },
      { type: "separator" },
      {
        label: "Quit TouchFlow",
        click: () => {
          quitting = true;
          app.quit();
        },
      },
    ]);
    tray?.setContextMenu(menu);
  };
  rebuild();
  tray.on("click", showWindow);
}

async function start(): Promise<void> {
  const input = await createNutInputController().catch(() => undefined);
  const server = createAgentServer({ secret: loadOrCreateSecret(), input });
  await server.listen(DEFAULT_AGENT_PORT);

  win = new BrowserWindow({
    width: 420,
    height: 640,
    resizable: false,
    autoHideMenuBar: true,
    backgroundColor: "#0a0a0f",
    title: "TouchFlow Agent",
  });

  // Closing hides to tray; the agent keeps serving the touchpad.
  win.on("close", (event) => {
    if (!quitting) {
      event.preventDefault();
      win?.hide();
    }
  });

  if (process.env.VITE_DEV_SERVER_URL !== undefined) {
    await win.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    await win.loadFile(join(__dirname, "ui/index.html"));
  }

  buildTray();

  app.on("before-quit", () => {
    quitting = true;
  });
  app.on("window-all-closed", () => {
    // Intentionally empty: tray keeps the app alive on all platforms.
  });
}

app.whenReady().then(start);
