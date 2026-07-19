import {
  DEFAULT_AGENT_PORT,
  MESSAGE_EVENT,
  MessageType,
  createMessage,
  isTouchFlowMessage,
  type DeviceStatusMessage,
  type PairRequestMessage,
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
}

export class ConnectionManager {
  private socket: SocketLike | null = null;
  private timeout: ReturnType<typeof setTimeout> | null = null;

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
    });
    this.socket!.on("connect_error", (err: unknown) => {
      const message = err instanceof Error ? err.message : "unreachable";
      this.fail(message === "invalid-token" ? "invalid-token" : "unreachable");
    });
    this.socket!.on("disconnect", () => this.callbacks.onStatus("idle"));
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

  private fail(reason: string): void {
    this.disarmTimeout();
    this.socket?.disconnect();
    this.socket = null;
    this.callbacks.onError?.(reason);
    this.callbacks.onStatus("error");
  }
}
