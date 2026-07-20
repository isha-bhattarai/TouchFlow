import {
  DEFAULT_AGENT_PORT,
  HEARTBEAT_INTERVAL_MS,
  MESSAGE_EVENT,
  MessageType,
  createMessage,
  isTouchFlowMessage,
  type DeviceStatusMessage,
  type HeartbeatMessage,
  type PairRequestMessage,
  type TouchFlowMessage,
} from "@touchflow/shared";

export type ConnectionStatus =
  | "idle"
  | "connecting"
  | "pairing"
  | "connected"
  | "error";

/**
 * The minimal surface of a Socket.io client socket that we depend on.
 * Depending on this interface (not the concrete library) is what lets us
 * unit-test the whole pairing state machine with a fake socket.
 */
export interface SocketLike {
  on(event: string, handler: (...args: unknown[]) => void): void;
  emit(event: string, payload?: unknown): void;
  disconnect(): void;
}

export type SocketFactory = (
  url: string,
  auth: Record<string, unknown>,
) => SocketLike;

export interface ConnectionCallbacks {
  onStatus(status: ConnectionStatus): void;
  /** Fired once when pairing succeeds; persist this token securely. */
  onPaired?(token: string): void;
  onError?(message: string): void;
  /** Round-trip time of each heartbeat, measured on the phone's clock. */
  onLatency?(rttMs: number): void;
}

export class ConnectionManager {
  private socket: SocketLike | null = null;
  private timeout: ReturnType<typeof setTimeout> | null = null;
  private heartbeat: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly createSocket: SocketFactory,
    private readonly callbacks: ConnectionCallbacks,
    private readonly timeoutMs: number = 10_000,
  ) {}

  /** First-time pairing: connect, send the 6-digit code, receive a JWT. */
  connectWithCode(host: string, code: string, deviceName: string): void {
    this.open(host, {});
    this.callbacks.onStatus("connecting");
    this.armTimeout();

    this.socket!.on("connect", () => {
      this.callbacks.onStatus("pairing");
      this.socket!.emit(
        MESSAGE_EVENT,
        createMessage<PairRequestMessage>({
          t: MessageType.PairRequest,
          code,
          deviceName,
        }),
      );
    });

    this.socket!.on(MESSAGE_EVENT, (raw: unknown) => {
      if (!isTouchFlowMessage(raw)) return;
      if (raw.t === MessageType.PairAccepted) {
        this.disarmTimeout();
        this.callbacks.onPaired?.(raw.token);
        this.callbacks.onStatus("connected");
      } else if (raw.t === MessageType.PairRejected) {
        this.fail(`pair-rejected:${raw.reason}`);
      }
    });

    this.socket!.on("connect_error", () => this.fail("unreachable"));
  }

  /** Silent reconnect on later launches using the stored JWT. */
  connectWithToken(
    host: string,
    token: string,
    platform: "android" | "ios",
  ): void {
    this.open(host, { token, platform });
    this.callbacks.onStatus("connecting");
    this.armTimeout();

    this.socket!.on("connect", () => {
      this.disarmTimeout();
      this.callbacks.onStatus("connected");
      this.startHeartbeats();
    });
    this.socket!.on(MESSAGE_EVENT, (raw: unknown) => {
      if (!isTouchFlowMessage(raw)) return;
      if (raw.t === MessageType.Heartbeat) {
        this.callbacks.onLatency?.(Date.now() - raw.sentAt);
      }
    });
    this.socket!.on("connect_error", (err: unknown) => {
      const message = err instanceof Error ? err.message : "unreachable";
      this.fail(message === "invalid-token" ? "invalid-token" : "unreachable");
    });
    this.socket!.on("disconnect", () => {
      this.stopHeartbeats();
      this.callbacks.onStatus("idle");
    });
  }

  /** Send any protocol message (used by the touchpad for pointer events). */
  send(message: TouchFlowMessage): void {
    this.socket?.emit(MESSAGE_EVENT, message);
  }

  /** Report phone battery so the agent window's device card stays live. */
  sendBatteryStatus(battery: number, charging: boolean): void {
    this.socket?.emit(
      MESSAGE_EVENT,
      createMessage<DeviceStatusMessage>({
        t: MessageType.DeviceStatus,
        battery,
        charging,
      }),
    );
  }

  disconnect(): void {
    this.disarmTimeout();
    this.stopHeartbeats();
    this.socket?.disconnect();
    this.socket = null;
    this.callbacks.onStatus("idle");
  }

  private open(host: string, auth: Record<string, unknown>): void {
    this.socket?.disconnect();
    this.socket = this.createSocket(
      `http://${host}:${DEFAULT_AGENT_PORT}`,
      auth,
    );
  }

  private armTimeout(): void {
    this.disarmTimeout();
    this.timeout = setTimeout(() => this.fail("timeout"), this.timeoutMs);
  }

  private disarmTimeout(): void {
    if (this.timeout !== null) clearTimeout(this.timeout);
    this.timeout = null;
  }

  private startHeartbeats(): void {
    this.stopHeartbeats();
    this.heartbeat = setInterval(() => {
      this.socket?.emit(
        MESSAGE_EVENT,
        createMessage<HeartbeatMessage>({
          t: MessageType.Heartbeat,
          sentAt: Date.now(),
        }),
      );
    }, HEARTBEAT_INTERVAL_MS);
  }

  private stopHeartbeats(): void {
    if (this.heartbeat !== null) clearInterval(this.heartbeat);
    this.heartbeat = null;
  }

  private fail(reason: string): void {
    this.disarmTimeout();
    this.stopHeartbeats();
    this.socket?.disconnect();
    this.socket = null;
    this.callbacks.onError?.(reason);
    this.callbacks.onStatus("error");
  }
}
