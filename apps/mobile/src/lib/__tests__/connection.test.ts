import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  MESSAGE_EVENT,
  MessageType,
  createMessage,
  type PairAcceptedMessage,
  type PairRejectedMessage,
} from "@touchflow/shared";
import {
  ConnectionManager,
  type ConnectionStatus,
  type SocketLike,
} from "../connection";
import { errorMessage, isValidCode, isValidHost, normalizeCode } from "../validate";

/** In-memory stand-in for a Socket.io client socket. */
class FakeSocket implements SocketLike {
  handlers = new Map<string, Array<(...args: unknown[]) => void>>();
  emitted: Array<{ event: string; payload: unknown }> = [];
  disconnected = false;

  on(event: string, handler: (...args: unknown[]) => void): void {
    const list = this.handlers.get(event) ?? [];
    list.push(handler);
    this.handlers.set(event, list);
  }

  emit(event: string, payload?: unknown): void {
    this.emitted.push({ event, payload });
  }

  disconnect(): void {
    this.disconnected = true;
  }

  /** Simulate the server sending an event to the phone. */
  serverSends(event: string, ...args: unknown[]): void {
    for (const handler of this.handlers.get(event) ?? []) handler(...args);
  }
}

function setup() {
  const socket = new FakeSocket();
  const statuses: ConnectionStatus[] = [];
  const errors: string[] = [];
  let pairedToken: string | null = null;
  const urls: Array<{ url: string; auth: Record<string, unknown> }> = [];

  const manager = new ConnectionManager(
    (url, auth) => {
      urls.push({ url, auth });
      return socket;
    },
    {
      onStatus: (s) => statuses.push(s),
      onPaired: (t) => {
        pairedToken = t;
      },
      onError: (e) => errors.push(e),
    },
    5_000,
  );

  return { socket, statuses, errors, manager, urls, paired: () => pairedToken };
}

describe("ConnectionManager pairing flow", () => {
  it("sends the pair request on connect and reports the token on success", () => {
    const { socket, statuses, manager, paired, urls } = setup();
    manager.connectWithCode("192.168.1.42", "481903", "Test phone");

    expect(urls[0]?.url).toBe("http://192.168.1.42:8735");
    socket.serverSends("connect");

    const sent = socket.emitted[0];
    expect(sent?.event).toBe(MESSAGE_EVENT);
    expect(sent?.payload).toMatchObject({
      t: MessageType.PairRequest,
      code: "481903",
      deviceName: "Test phone",
    });

    socket.serverSends(
      MESSAGE_EVENT,
      createMessage<PairAcceptedMessage>({
        t: MessageType.PairAccepted,
        token: "jwt-token-here",
      }),
    );

    expect(paired()).toBe("jwt-token-here");
    expect(statuses).toEqual(["connecting", "pairing", "connected"]);
  });

  it("surfaces the rejection reason and disconnects on a bad code", () => {
    const { socket, statuses, errors, manager } = setup();
    manager.connectWithCode("192.168.1.42", "000000", "Test phone");
    socket.serverSends("connect");
    socket.serverSends(
      MESSAGE_EVENT,
      createMessage<PairRejectedMessage>({
        t: MessageType.PairRejected,
        reason: "bad-code",
      }),
    );

    expect(errors).toEqual(["pair-rejected:bad-code"]);
    expect(statuses.at(-1)).toBe("error");
    expect(socket.disconnected).toBe(true);
  });

  it("ignores malformed wire messages", () => {
    const { socket, statuses, manager } = setup();
    manager.connectWithCode("192.168.1.42", "481903", "Test phone");
    socket.serverSends("connect");
    socket.serverSends(MESSAGE_EVENT, { totally: "bogus" });
    expect(statuses.at(-1)).toBe("pairing");
  });

  describe("timeouts", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it("fails with a timeout if the agent never answers", () => {
      const { errors, statuses, manager } = setup();
      manager.connectWithCode("10.0.0.99", "481903", "Test phone");
      vi.advanceTimersByTime(5_001);
      expect(errors).toEqual(["timeout"]);
      expect(statuses.at(-1)).toBe("error");
    });
  });
});

describe("ConnectionManager token reconnect", () => {
  it("passes the token and platform in the handshake and connects silently", () => {
    const { socket, statuses, manager, urls } = setup();
    manager.connectWithToken("192.168.1.42", "stored-jwt", "android");

    expect(urls[0]?.auth).toEqual({ token: "stored-jwt", platform: "android" });
    socket.serverSends("connect");
    expect(statuses).toEqual(["connecting", "connected"]);
  });

  it("maps an invalid-token handshake error so the UI can re-pair", () => {
    const { socket, errors, manager } = setup();
    manager.connectWithToken("192.168.1.42", "revoked", "ios");
    socket.serverSends("connect_error", new Error("invalid-token"));
    expect(errors).toEqual(["invalid-token"]);
  });

  it("measures heartbeat round-trips on the phone's clock", () => {
    vi.useFakeTimers();
    try {
      const latencies: number[] = [];
      const socket = new FakeSocket();
      const manager = new ConnectionManager(
        () => socket,
        {
          onStatus: () => {},
          onLatency: (rtt) => latencies.push(rtt),
        },
      );
      manager.connectWithToken("192.168.1.42", "jwt", "android");
      socket.serverSends("connect");

      vi.advanceTimersByTime(5_000); // heartbeat interval elapses
      const beat = socket.emitted.at(-1)?.payload as { t: string; sentAt: number };
      expect(beat.t).toBe(MessageType.Heartbeat);

      vi.advanceTimersByTime(37); // network round-trip
      socket.serverSends(MESSAGE_EVENT, beat); // agent echoes sentAt untouched
      expect(latencies).toEqual([37]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("reports battery status over the message channel", () => {
    const { socket, manager } = setup();
    manager.connectWithToken("192.168.1.42", "jwt", "android");
    socket.serverSends("connect");
    manager.sendBatteryStatus(0.62, true);

    expect(socket.emitted.at(-1)?.payload).toMatchObject({
      t: MessageType.DeviceStatus,
      battery: 0.62,
      charging: true,
    });
  });
});

describe("validation helpers", () => {
  it("normalizes and validates codes", () => {
    expect(normalizeCode("481 903")).toBe("481903");
    expect(normalizeCode("48-19-03")).toBe("481903");
    expect(isValidCode("481903")).toBe(true);
    expect(isValidCode("4819")).toBe(false);
  });

  it("validates hosts", () => {
    expect(isValidHost("192.168.1.42")).toBe(true);
    expect(isValidHost("300.1.1.1")).toBe(false);
    expect(isValidHost("isha-laptop.local")).toBe(true);
    expect(isValidHost("")).toBe(false);
  });

  it("maps every failure reason to friendly copy", () => {
    for (const reason of [
      "pair-rejected:bad-code",
      "pair-rejected:expired",
      "pair-rejected:rate-limited",
      "invalid-token",
      "timeout",
      "unknown-thing",
    ]) {
      expect(errorMessage(reason).length).toBeGreaterThan(10);
    }
  });
});
