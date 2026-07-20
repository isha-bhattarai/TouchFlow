import { networkInterfaces } from "node:os";
import { DEFAULT_AGENT_PORT } from "@touchflow/shared";
import { createAgentServer } from "./createServer";
import { createNutInputController } from "./input";
import { loadOrCreateSecret } from "./storage";

/** Headless entry point — run the agent without the Electron window. */
async function main() {
  const input = await createNutInputController().catch((error) => {
    console.warn("Input injection unavailable, running in view-only mode:", error?.message);
    return undefined;
  });
  const server = createAgentServer({ secret: loadOrCreateSecret(), input });
  const port = await server.listen(DEFAULT_AGENT_PORT);

  const lanAddresses = Object.values(networkInterfaces())
    .flat()
    .filter((iface) => iface !== undefined && iface.family === "IPv4" && !iface.internal)
    .map((iface) => iface!.address);

  console.log(`TouchFlow agent listening on port ${port}`);
  console.log(`LAN address(es): ${lanAddresses.join(", ") || "none found"}`);
  console.log(`Pairing code: ${server.pairing.currentCode}`);
}

main();
