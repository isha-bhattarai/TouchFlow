import { describe, expect, it } from "vitest";
import {
  MessageType,
  PROTOCOL_VERSION,
  SENSITIVITY_MAX,
  SENSITIVITY_MIN,
  clampSensitivity,
  createMessage,
  isTouchFlowMessage,
  type PointerMoveMessage,
} from "../index";

describe("createMessage", () => {
  it("stamps the current protocol version", () => {
    const msg = createMessage<PointerMoveMessage>({
      t: MessageType.PointerMove,
      dx: 4,
      dy: -2,
    });
    expect(msg.v).toBe(PROTOCOL_VERSION);
    expect(msg.dx).toBe(4);
  });
});

describe("isTouchFlowMessage", () => {
  it("accepts a valid wire message", () => {
    expect(
      isTouchFlowMessage({ t: "pointer:move", v: 1, dx: 1, dy: 1 }),
    ).toBe(true);
  });

  it("rejects unknown types, missing version, and junk", () => {
    expect(isTouchFlowMessage({ t: "hack:me", v: 1 })).toBe(false);
    expect(isTouchFlowMessage({ t: "pointer:move" })).toBe(false);
    expect(isTouchFlowMessage(null)).toBe(false);
    expect(isTouchFlowMessage("pointer:move")).toBe(false);
  });
});

describe("clampSensitivity", () => {
  it("clamps below, above, and passes through valid values", () => {
    expect(clampSensitivity(0)).toBe(SENSITIVITY_MIN);
    expect(clampSensitivity(99)).toBe(SENSITIVITY_MAX);
    expect(clampSensitivity(1.5)).toBe(1.5);
    expect(clampSensitivity(Number.NaN)).toBe(SENSITIVITY_MIN);
  });
});
