import {
  PROTOCOL_VERSION,
  SENSITIVITY_MAX,
  SENSITIVITY_MIN,
} from "./constants";

/**
 * Every socket message TouchFlow sends, in one discriminated union.
 * Phone and desktop agent both import these types, so a mismatch is a
 * compile-time error instead of a runtime mystery.
 */
export enum MessageType {
  // Session
  Hello = "hello",
  PairRequest = "pair:request",
  PairAccepted = "pair:accepted",
  PairRejected = "pair:rejected",
  Heartbeat = "heartbeat",
  DeviceStatus = "device:status",

  // Phase 1 — touchpad
  PointerMove = "pointer:move",
  PointerClick = "pointer:click",
  PointerDragStart = "pointer:dragStart",
  PointerDragEnd = "pointer:dragEnd",
  Scroll = "scroll",
}

export type MouseButton = "left" | "right";

interface BaseMessage<T extends MessageType> {
  /** Discriminant. */
  t: T;
  /** Protocol version, for forward compatibility. */
  v: number;
}

export interface HelloMessage extends BaseMessage<MessageType.Hello> {
  deviceName: string;
  platform: "android" | "ios";
}

export interface PairRequestMessage
  extends BaseMessage<MessageType.PairRequest> {
  /** 6-digit code shown on desktop, typed/scanned on phone. */
  code: string;
  deviceName: string;
}

export interface PairAcceptedMessage
  extends BaseMessage<MessageType.PairAccepted> {
  /** JWT for subsequent messages / reconnects. */
  token: string;
}

export interface PairRejectedMessage
  extends BaseMessage<MessageType.PairRejected> {
  reason: "bad-code" | "expired" | "rate-limited";
}

export interface HeartbeatMessage extends BaseMessage<MessageType.Heartbeat> {
  sentAt: number;
}

export interface DeviceStatusMessage
  extends BaseMessage<MessageType.DeviceStatus> {
  /** 0–1, phone battery level for the desktop-side indicator. */
  battery: number;
  charging: boolean;
}

/** Relative pointer movement, already sensitivity-scaled on the phone. */
export interface PointerMoveMessage
  extends BaseMessage<MessageType.PointerMove> {
  dx: number;
  dy: number;
}

export interface PointerClickMessage
  extends BaseMessage<MessageType.PointerClick> {
  button: MouseButton;
  double: boolean;
}

export type PointerDragStartMessage = BaseMessage<MessageType.PointerDragStart>;
export type PointerDragEndMessage = BaseMessage<MessageType.PointerDragEnd>;

export interface ScrollMessage extends BaseMessage<MessageType.Scroll> {
  dx: number;
  dy: number;
}

export type TouchFlowMessage =
  | HelloMessage
  | PairRequestMessage
  | PairAcceptedMessage
  | PairRejectedMessage
  | HeartbeatMessage
  | DeviceStatusMessage
  | PointerMoveMessage
  | PointerClickMessage
  | PointerDragStartMessage
  | PointerDragEndMessage
  | ScrollMessage;

/** Attach the protocol version so senders can't forget it. */
export function createMessage<T extends TouchFlowMessage>(
  msg: Omit<T, "v">,
): T {
  return { ...msg, v: PROTOCOL_VERSION } as T;
}

/** Runtime guard for anything arriving over the wire. */
export function isTouchFlowMessage(value: unknown): value is TouchFlowMessage {
  if (typeof value !== "object" || value === null) return false;
  const m = value as Record<string, unknown>;
  return (
    typeof m.v === "number" &&
    typeof m.t === "string" &&
    (Object.values(MessageType) as string[]).includes(m.t)
  );
}

/** Clamp a user-chosen sensitivity into the allowed range. */
export function clampSensitivity(value: number): number {
  if (Number.isNaN(value)) return SENSITIVITY_MIN;
  return Math.min(SENSITIVITY_MAX, Math.max(SENSITIVITY_MIN, value));
}
