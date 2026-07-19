import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { io as ioClient, type Socket } from "socket.io-client";
import {
  MESSAGE_EVENT,
  MessageType,
  createMessage,
  type PairRequestMessage,
  type TouchFlowMessage,
} from "@touchflow/shared";
import { createAgentServer, type AgentServer } from "../createServer";

const SECRET = "test-secret-".padEnd(64, "0");

function waitForMessage(socket: Socket): Promise<TouchFlowMessage> {
  return new Promise((resolve) => socket.once(MESSAGE_EVENT, resolve));
}

describe("agent server pairing over real sockets", () => {
  let server: AgentServer;
  let port: number;
  let client: Socket | undefined;

  beforeEach(async () => {
    server = createAgentServer({ secret: SECRET });
    port = await server.listen(0); // ephemeral port
  });

  afterEach(async () => {
    client?.disconnect();
    await server.close();
  });

  it("issues a JWT for the correct code, then accepts token reconnects", async () => {
    client = ioClient(`http://127.0.0.1:${port}`, { transports: ["websocket"] });
    const code = server.pairing.currentCode;

    client.emit(
      MESSAGE_EVENT,
      createMessage<PairRequestMessage>({
        t: MessageType.PairRequest,
        code,
        deviceName: "Test phone",
      }),
    );

    const reply = await waitForMessage(client);
    expect(reply.t).toBe(MessageType.PairAccepted);
    const token = reply.t === MessageType.PairAccepted ? reply.token : "";
    expect(token.length).toBeGreaterThan(20);
    expect(server.getUiState().devices).toHaveLength(1);
    client.disconnect();

    // Silent reconnect with the stored token — no code needed.
    client = ioClient(`http://127.0.0.1:${port}`, {
      transports: ["websocket"],
      auth: { token, platform: "android" },
    });
    await new Promise<void>((resolve) => client!.once("connect", () => resolve()));
    await new Promise((r) => setTimeout(r, 50));
    const state = server.getUiState();
    expect(state.devices).toHaveLength(1);
    expect(state.devices[0]?.platform).toBe("android");
  });

  it("rejects a wrong code with a reason", async () => {
    client = ioClient(`http://127.0.0.1:${port}`, { transports: ["websocket"] });
    const wrong = server.pairing.currentCode === "000000" ? "999999" : "000000";

    client.emit(
      MESSAGE_EVENT,
      createMessage<PairRequestMessage>({
        t: MessageType.PairRequest,
        code: wrong,
        deviceName: "Evil phone",
      }),
    );

    const reply = await waitForMessage(client);
    expect(reply.t).toBe(MessageType.PairRejected);
    if (reply.t === MessageType.PairRejected) {
      expect(reply.reason).toBe("bad-code");
    }
    expect(server.getUiState().devices).toHaveLength(0);
  });

  it("refuses connections with an invalid token", async () => {
    client = ioClient(`http://127.0.0.1:${port}`, {
      transports: ["websocket"],
      auth: { token: "garbage.token.here" },
    });
    const error = await new Promise<Error>((resolve) =>
      client!.once("connect_error", resolve),
    );
    expect(error.message).toBe("invalid-token");
  });
});
