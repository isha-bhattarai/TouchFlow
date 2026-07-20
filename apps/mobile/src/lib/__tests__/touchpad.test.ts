import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DeltaBatcher, TouchpadEngine, type TouchpadActions } from "../touchpad";

function setup(sensitivity = 1) {
  const calls: string[] = [];
  const actions: TouchpadActions = {
    onMove: (dx, dy) => calls.push(`move:${dx.toFixed(1)},${dy.toFixed(1)}`),
    onClick: (button, double) => calls.push(`click:${button}:${double}`),
    onDragStart: () => calls.push("dragStart"),
    onDragEnd: () => calls.push("dragEnd"),
    onScroll: (dx, dy) => calls.push(`scroll:${dx.toFixed(1)},${dy.toFixed(1)}`),
  };
  const engine = new TouchpadEngine(actions, {
    tapMaxMs: 200,
    tapSlopPx: 10,
    doubleTapMs: 250,
    scrollScale: 1,
  });
  engine.setSensitivity(sensitivity);
  return { engine, calls };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("TouchpadEngine", () => {
  it("emits sensitivity-scaled moves for a one-finger glide", () => {
    const { engine, calls } = setup(2);
    engine.touchStart([{ x: 0, y: 0 }], 0);
    engine.touchMove([{ x: 20, y: 0 }], 16); // beyond slop
    engine.touchMove([{ x: 30, y: 5 }], 32);
    engine.touchEnd([], 48);
    expect(calls).toContain("move:20.0,0.0");
    expect(calls).toContain("move:20.0,10.0"); // 10,5 doubled
    expect(calls.filter((c) => c.startsWith("click"))).toHaveLength(0);
  });

  it("emits a delayed left click for a single quick tap", () => {
    const { engine, calls } = setup();
    engine.touchStart([{ x: 5, y: 5 }], 0);
    engine.touchEnd([], 100);
    expect(calls).toHaveLength(0); // held back for a possible double tap
    vi.advanceTimersByTime(251);
    expect(calls).toEqual(["click:left:false"]);
  });

  it("turns two quick taps into an immediate double click", () => {
    const { engine, calls } = setup();
    engine.touchStart([{ x: 5, y: 5 }], 0);
    engine.touchEnd([], 100);
    engine.touchStart([{ x: 6, y: 5 }], 180);
    engine.touchEnd([], 260);
    expect(calls).toEqual(["click:left:true"]);
    vi.advanceTimersByTime(500);
    expect(calls).toEqual(["click:left:true"]); // no stray single click
  });

  it("turns tap-then-hold-and-move into a drag", () => {
    const { engine, calls } = setup();
    engine.touchStart([{ x: 5, y: 5 }], 0);
    engine.touchEnd([], 100); // tap
    engine.touchStart([{ x: 5, y: 5 }], 180); // finger back down
    engine.touchMove([{ x: 40, y: 5 }], 220); // and moves
    engine.touchMove([{ x: 60, y: 15 }], 240);
    engine.touchEnd([], 300);
    expect(calls[0]).toBe("dragStart");
    expect(calls.at(-1)).toBe("dragEnd");
    expect(calls.some((c) => c.startsWith("move"))).toBe(true);
    vi.advanceTimersByTime(500);
    expect(calls.filter((c) => c.startsWith("click"))).toHaveLength(0);
  });

  it("emits a right click for a two-finger tap", () => {
    const { engine, calls } = setup();
    engine.touchStart([{ x: 10, y: 10 }, { x: 40, y: 10 }], 0);
    engine.touchEnd([], 120);
    expect(calls).toEqual(["click:right:false"]);
  });

  it("emits scroll (not move) for a two-finger glide", () => {
    const { engine, calls } = setup();
    engine.touchStart([{ x: 10, y: 10 }, { x: 40, y: 10 }], 0);
    engine.touchMove([{ x: 10, y: 40 }, { x: 40, y: 40 }], 16);
    engine.touchEnd([], 200);
    expect(calls).toContain("scroll:0.0,30.0");
    expect(calls.some((c) => c.startsWith("move"))).toBe(false);
  });

  it("small jitters within the slop don't move the cursor", () => {
    const { engine, calls } = setup();
    engine.touchStart([{ x: 0, y: 0 }], 0);
    engine.touchMove([{ x: 3, y: 2 }], 16);
    engine.touchEnd([], 100);
    vi.advanceTimersByTime(251);
    expect(calls).toEqual(["click:left:false"]); // it was a slightly wobbly tap
  });
});

describe("DeltaBatcher", () => {
  it("coalesces many deltas into one flush per interval", () => {
    const flushes: Array<[number, number]> = [];
    const batcher = new DeltaBatcher((dx, dy) => flushes.push([dx, dy]), 16);
    batcher.start();
    batcher.add(1, 1);
    batcher.add(2, 0);
    batcher.add(3, -1);
    vi.advanceTimersByTime(16);
    expect(flushes).toEqual([[6, 0]]);
    vi.advanceTimersByTime(160); // nothing accumulated → no empty flushes
    expect(flushes).toHaveLength(1);
    batcher.stop();
  });
});
