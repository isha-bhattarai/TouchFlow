import { randomUUID } from "node:crypto";
import { createServer as createHttpServer } from "node:http";
import type { Server as HttpServer } from "node:http";
import express from "express";
import { Server, type Socket } from "socket.io";
import {
  MESSAGE_EVENT,
  MessageType,
  PROTOCOL_VERSION,
  UI_NAMESPACE,
  UI_ROTATE_CODE_EVENT,
  UI_STATE_EVENT,
  createMessage,
  isTouchFlowMessage,
  type AgentDeviceInfo,
  type AgentUiState,
  type PairAcceptedMessage,
  type PairRejectedMessage,
  type HeartbeatMessage,
} from "@touchflow/shared";
import { signDeviceToken, verifyDeviceToken } from "./auth";
import { PairingService } from "./pairing";

export interface AgentServerOptions {
  secret: string;
  pairing?: PairingService;
}

export interface AgentServer {
  httpServer: HttpServer;
  io: Server;
  pairing: PairingService;
  listen(port: number): Promise<number>;
  close(): Promise<void>;
  getUiState(): AgentUiState;
}

const LOCALHOST = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

export function createAgentServer(opts: AgentServerOptions): AgentServer {
  const { secret } = opts;
  const pairing = opts.pairing ?? new PairingService();

  const app = express();
  app.get("/health", (_req, res) => {
    res.json({ ok: true, protocol: PROTOCOL_VERSION });
  });

  const httpServer = createHttpServer(app);
  const io = new Server(httpServer, { cors: { origin: true } });

  const devices = new Map<string, AgentDeviceInfo>(); // key: socket.id

  const getUiState = (): AgentUiState => ({
    code: pairing.currentCode,
    codeExpiresAt: pairing.expiresAtMs,
    devices: [...devices.values()],
  });

  const ui = io.of(UI_NAMESPACE);
  const pushUiState = () => ui.emit(UI_STATE_EVENT, getUiState());

  // The agent window's namespace: strictly local connections only. A phone
  // on the LAN must never be able to read the pairing code remotely.
  ui.use((socket, next) => {
    if (LOCALHOST.has(socket.handshake.address)) return next();
    next(new Error("ui-local-only"));
  });
  ui.on("connection", (socket) => {
    socket.emit(UI_STATE_EVENT, getUiState());
    socket.on(UI_ROTATE_CODE_EVENT, () => {
      pairing.rotate();
      pushUiState();
    });
  });

  // Device sockets: a valid JWT in the handshake marks the socket as
  // authenticated. No token = allowed to connect, but only to pair.
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;
    if (token === undefined) return next();
    const payload = verifyDeviceToken(token, secret);
    if (payload === null) return next(new Error("invalid-token"));
    socket.data.device = payload;
    next();
  });

  const registerDevice = (
    socket: Socket,
    info: { id: string; name: string },
  ) => {
    const platform = socket.handshake.auth?.platform;
    devices.set(socket.id, {
      id: info.id,
      name: info.name,
      platform: platform === "android" || platform === "ios" ? platform : "unknown",
      battery: null,
      charging: false,
      connectedAt: Date.now(),
    });
    pushUiState();
  };

  io.on("connection", (socket) => {
    if (socket.data.device !== undefined) {
      registerDevice(socket, {
        id: socket.data.device.deviceId,
        name: socket.data.device.deviceName,
      });
    }

    socket.on(MESSAGE_EVENT, (raw: unknown) => {
      if (!isTouchFlowMessage(raw)) return; // never trust the wire
      const authed = socket.data.device !== undefined;

      switch (raw.t) {
        case MessageType.PairRequest: {
          const result = pairing.verify(raw.code);
          if (result === "ok") {
            const payload = {
              deviceId: randomUUID(),
              deviceName: raw.deviceName,
            };
            socket.data.device = payload;
            registerDevice(socket, {
              id: payload.deviceId,
              name: payload.deviceName,
            });
            socket.emit(
              MESSAGE_EVENT,
              createMessage<PairAcceptedMessage>({
                t: MessageType.PairAccepted,
                token: signDeviceToken(payload, secret),
              }),
            );
          } else {
            socket.emit(
              MESSAGE_EVENT,
              createMessage<PairRejectedMessage>({
                t: MessageType.PairRejected,
                reason: result,
              }),
            );
          }
          pushUiState();
          return;
        }
        case MessageType.DeviceStatus: {
          if (!authed) return;
          const device = devices.get(socket.id);
          if (device !== undefined) {
            device.battery = Math.min(1, Math.max(0, raw.battery));
            device.charging = raw.charging;
            pushUiState();
          }
          return;
        }
        case MessageType.Heartbeat: {
          if (!authed) return;
          socket.emit(
            MESSAGE_EVENT,
            createMessage<HeartbeatMessage>({
              t: MessageType.Heartbeat,
              sentAt: Date.now(),
            }),
          );
          return;
        }
        default:
          // Pointer/keyboard/etc. handled from Milestone 3 onward.
          return;
      }
    });

    socket.on("disconnect", () => {
      if (devices.delete(socket.id)) pushUiState();
    });
  });

  // Auto-rotate expired codes so the window never shows a dead code.
  const rotateTimer = setInterval(() => {
    if (pairing.isExpired) {
      pairing.rotate();
      pushUiState();
    }
  }, 1_000);
  rotateTimer.unref?.();

  return {
    httpServer,
    io,
    pairing,
    getUiState,
    listen: (port) =>
      new Promise((resolve) => {
        httpServer.listen(port, () => {
          const address = httpServer.address();
          resolve(typeof address === "object" && address ? address.port : port);
        });
      }),
    close: async () => {
      clearInterval(rotateTimer);
      await io.close();
    },
  };
}
