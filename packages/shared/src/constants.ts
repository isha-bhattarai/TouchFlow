/** Protocol version — bump on breaking message-shape changes. */
export const PROTOCOL_VERSION = 1;

/** Default TCP port the desktop agent listens on (LAN). */
export const DEFAULT_AGENT_PORT = 8735;

/** How often (ms) the phone sends a heartbeat so the agent knows it's alive. */
export const HEARTBEAT_INTERVAL_MS = 5_000;

/** Pointer deltas are batched and flushed at ~60Hz for low latency. */
export const POINTER_FLUSH_INTERVAL_MS = 16;

/** Sensitivity slider bounds (multiplier applied to raw touch deltas). */
export const SENSITIVITY_MIN = 0.5;
export const SENSITIVITY_MAX = 3.0;
export const SENSITIVITY_DEFAULT = 1.0;
