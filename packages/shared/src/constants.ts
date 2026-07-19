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

/** Pairing codes rotate after this long, or immediately after a successful pair. */
export const PAIR_CODE_TTL_MS = 120_000;

/** Wrong-code attempts allowed per code before rate limiting kicks in. */
export const PAIR_MAX_ATTEMPTS = 5;

/** Single socket event all TouchFlowMessages travel on. */
export const MESSAGE_EVENT = "msg";

/** Local-only Socket.io namespace the agent window listens on. */
export const UI_NAMESPACE = "/ui";
export const UI_STATE_EVENT = "ui:state";
export const UI_ROTATE_CODE_EVENT = "ui:rotate-code";
