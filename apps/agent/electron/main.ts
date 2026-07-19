import { join } from "node:path";
import { BrowserWindow, app } from "electron";
import { DEFAULT_AGENT_PORT } from "@touchflow/shared";
import { createAgentServer } from "../src/server/createServer";
import { loadOrCreateSecret } from "../src/server/storage";

async function createWindow() {
  const server = createAgentServer({ secret: loadOrCreateSecret() });
  await server.listen(DEFAULT_AGENT_PORT);

  const win = new BrowserWindow({
    width: 420,
    height: 640,
    resizable: false,
    autoHideMenuBar: true,
    backgroundColor: "#0a0a0f",
    title: "TouchFlow Agent",
  });

  if (process.env.VITE_DEV_SERVER_URL !== undefined) {
    await win.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    await win.loadFile(join(__dirname, "ui/index.html"));
  }

  app.on("window-all-closed", async () => {
    await server.close();
    app.quit();
  });
}

app.whenReady().then(createWindow);
