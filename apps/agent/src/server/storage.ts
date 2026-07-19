import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

interface AgentConfig {
  secret: string;
}

/**
 * The JWT signing secret is generated once per install and persisted, so
 * paired phones survive agent restarts. Stored with 0600 permissions —
 * readable only by the current user.
 */
export function loadOrCreateSecret(
  dir: string = join(homedir(), ".touchflow"),
): string {
  const file = join(dir, "agent.json");
  if (existsSync(file)) {
    const config = JSON.parse(readFileSync(file, "utf-8")) as AgentConfig;
    if (typeof config.secret === "string" && config.secret.length >= 32) {
      return config.secret;
    }
  }
  const secret = randomBytes(32).toString("hex");
  mkdirSync(dir, { recursive: true });
  writeFileSync(file, JSON.stringify({ secret } satisfies AgentConfig), {
    mode: 0o600,
  });
  return secret;
}
