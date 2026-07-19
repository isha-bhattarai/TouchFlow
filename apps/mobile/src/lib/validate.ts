/** Strip everything except digits — users may type "481 903" or "481-903". */
export function normalizeCode(input: string): string {
  return input.replace(/\D/g, "");
}

export function isValidCode(code: string): boolean {
  return /^\d{6}$/.test(code);
}

/** Accepts IPv4 addresses and simple LAN hostnames like "isha-laptop.local". */
export function isValidHost(host: string): boolean {
  const trimmed = host.trim();
  if (trimmed.length === 0) return false;
  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(trimmed);
  if (ipv4 !== null) {
    return ipv4.slice(1).every((octet) => Number(octet) <= 255);
  }
  return /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)*$/.test(
    trimmed,
  );
}

/** Human-friendly error copy for ConnectionManager failure reasons. */
export function errorMessage(reason: string): string {
  switch (reason) {
    case "pair-rejected:bad-code":
      return "Code didn't match — check the agent window and try again.";
    case "pair-rejected:expired":
      return "That code expired. Enter the fresh one from the agent window.";
    case "pair-rejected:rate-limited":
      return "Too many attempts. A new code was generated — use that one.";
    case "invalid-token":
      return "This device is no longer trusted. Pair again with a code.";
    case "timeout":
    case "unreachable":
      return "Couldn't reach the agent. Check the IP and that both devices share the same Wi-Fi.";
    default:
      return "Something went wrong. Please try again.";
  }
}
