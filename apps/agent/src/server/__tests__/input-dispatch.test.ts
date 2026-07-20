import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { io as ioClient, type Socket } from "socket.io-client";
import {
  MESSAGE_EVENT,
  MessageType,
  createMessage,
  type PairRequestMessage,
  type PointerClickMessage,
  type PointerMoveMessage,
  type ScrollMessage,
  type TouchFlowMessage,
} from "@touchflow/shared";
import { createAgentServer, type AgentServer } from "../createServer";
import type { InputController } from "../input";

const SECRET = "test-secret-".padEnd(64, "0");

class RecordingInputController implements InputController {
  calls: Array<{ method: string; args: unknown[] }> = [];
  async moveBy(dx: number, dy: number) {
    this.calls.push({ method: "moveBy", args: [dx, dy] });
  }
  async click(button: string, double: boolean) {
    this.calls.push({ method: "click", args: [button, double] });
  }
  async pressLeft() {
    this.calls.push({ method: "pressLeft", args: [] });
  }
  async releaseLeft() {
    this.calls.push({ method: "releaseLeft", args: [] });
  }
  async scroll(dx: number, dy: number) {
    this.calls.push({ method: "scroll", args: [dx, dy] });
  }
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("pointer message dispatch", () => {
  let server: AgentServer;
  let input: RecordingInputController;
  let port: number;
  let client: Socket | undefined;

  beforeEach(async () => {
    input = new RecordingInputController();
    server = createAgentServer({ secret: SECRET, input });
    port = await server.listen(0);
  });

  afterEach(async () => {
    client?.disconnect();
    await server.close();
  });

  async function pairedClient(): Promise<Socket> {
    const c = ioClient(`http://127.0.0.1:${port}`, { transports: ["websocket"] });
    c.emit(
      MESSAGE_EVENT,
      createMessage<PairRequestMessage>({
        t: MessageType.PairRequest,
        code: server.pairing.currentCode,
        deviceName: "Pad",
      }),
    );
    await new Promise<TouchFlowMessage>((resolve) => c.once(MESSAGE_EVENT, resolve));
    return c;
  }

  it("drives the input controller for an authenticated device", async () => {
    client = await pairedClient();
    client.emit(MESSAGE_EVENT, createMessage<PointerMoveMessage>({ t: MessageType.PointerMove, dx: 5, dy: -3 }));
    client.emit(MESSAGE_EVENT, createMessage<PointerClickMessage>({ t: MessageType.PointerClick, button: "right", double: false }));
    client.emit(MESSAGE_EVENT, createMessage<ScrollMessage>({ t: MessageType.Scroll, dx: 0, dy: 4 }));
    client.emit(MESSAGE_EVENT, createMessage({ t: MessageType.PointerDragStart }));
    client.emit(MESSAGE_EVENT, createMessage({ t: MessageType.PointerDragEnd }));
    await wait(80);

    expect(input.calls.map((c) => c.method)).toEqual([
      "moveBy",
      "click",
      "scroll",
      "pressLeft",
      "releaseLeft",
    ]);
    expect(input.calls[0]?.args).toEqual([5, -3]);
    expect(input.calls[1]?.args).toEqual(["right", false]);
  });

  it("SECURITY: ignores pointer messages from unauthenticated sockets", async () => {
    client = ioClient(`http://127.0.0.1:${port}`, { transports: ["websocket"] });
    await new Promise<void>((resolve) => client!.once("connect", () => resolve()));
    client.emit(MESSAGE_EVENT, createMessage<PointerMoveMessage>({ t: MessageType.PointerMove, dx: 99, dy: 99 }));
    client.emit(MESSAGE_EVENT, createMessage<PointerClickMessage>({ t: MessageType.PointerClick, button: "left", double: false }));
    await wait(80);

    expect(input.calls).toEqual([]); // no pairing, no cursor — ever
  });
});
