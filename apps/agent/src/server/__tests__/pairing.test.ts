import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { signDeviceToken, verifyDeviceToken } from "../auth";
import { PairingService } from "../pairing";

describe("PairingService", () => {
  it("generates 6-digit numeric codes", () => {
    const pairing = new PairingService();
    expect(pairing.currentCode).toMatch(/^\d{6}$/);
  });

  it("accepts the correct code exactly once (one-time use)", () => {
    const pairing = new PairingService();
    const code = pairing.currentCode;
    expect(pairing.verify(code)).toBe("ok");
    expect(pairing.verify(code)).toBe("bad-code"); // rotated after success
    expect(pairing.currentCode).not.toBe(code);
  });

  it("rejects wrong codes", () => {
    const pairing = new PairingService();
    expect(pairing.verify("000000" === pairing.currentCode ? "999999" : "000000")).toBe("bad-code");
  });

  describe("with fake timers", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it("expires codes after the TTL and rotates", () => {
      const pairing = new PairingService(1_000);
      const code = pairing.currentCode;
      vi.advanceTimersByTime(1_001);
      expect(pairing.verify(code)).toBe("expired");
      expect(pairing.currentCode).not.toBe(code);
    });
  });

  it("rate-limits after too many wrong attempts and burns the code", () => {
    const pairing = new PairingService(60_000, 3);
    const original = pairing.currentCode;
    const wrong = original === "000000" ? "999999" : "000000";
    expect(pairing.verify(wrong)).toBe("bad-code");
    expect(pairing.verify(wrong)).toBe("bad-code");
    expect(pairing.verify(wrong)).toBe("bad-code");
    expect(pairing.verify(wrong)).toBe("rate-limited");
    expect(pairing.currentCode).not.toBe(original); // burned
  });
});

describe("JWT device tokens", () => {
  const secret = "a".repeat(64);

  it("round-trips a valid token", () => {
    const token = signDeviceToken({ deviceId: "d1", deviceName: "Isha's phone" }, secret);
    expect(verifyDeviceToken(token, secret)).toEqual({
      deviceId: "d1",
      deviceName: "Isha's phone",
    });
  });

  it("rejects tokens signed with a different secret", () => {
    const token = signDeviceToken({ deviceId: "d1", deviceName: "x" }, secret);
    expect(verifyDeviceToken(token, "b".repeat(64))).toBeNull();
  });

  it("rejects tampered tokens", () => {
    const token = signDeviceToken({ deviceId: "d1", deviceName: "x" }, secret);
    expect(verifyDeviceToken(token.slice(0, -2) + "xx", secret)).toBeNull();
  });
});
