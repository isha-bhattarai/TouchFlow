import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReconnectScheduler } from "../reconnect";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("ReconnectScheduler", () => {
  it("backs off exponentially and caps at maxMs", () => {
    const scheduler = new ReconnectScheduler(() => {}, 1_000, 8_000);
    expect(scheduler.schedule()).toBe(1_000);
    expect(scheduler.schedule()).toBe(2_000);
    expect(scheduler.schedule()).toBe(4_000);
    expect(scheduler.schedule()).toBe(8_000);
    expect(scheduler.schedule()).toBe(8_000); // capped
  });

  it("fires the attempt after the chosen delay", () => {
    const attempts: number[] = [];
    const scheduler = new ReconnectScheduler(() => attempts.push(Date.now()), 1_000);
    scheduler.schedule();
    vi.advanceTimersByTime(999);
    expect(attempts).toHaveLength(0);
    vi.advanceTimersByTime(1);
    expect(attempts).toHaveLength(1);
  });

  it("reset() returns to the base delay and cancels pending attempts", () => {
    let fired = 0;
    const scheduler = new ReconnectScheduler(() => { fired += 1; }, 1_000);
    scheduler.schedule();
    scheduler.schedule();
    scheduler.reset();
    vi.advanceTimersByTime(60_000);
    expect(fired).toBe(0); // pending attempt cancelled
    expect(scheduler.schedule()).toBe(1_000); // ladder restarted
  });

  it("re-scheduling replaces the pending attempt instead of stacking", () => {
    let fired = 0;
    const scheduler = new ReconnectScheduler(() => { fired += 1; }, 1_000);
    scheduler.schedule();
    scheduler.schedule();
    vi.advanceTimersByTime(60_000);
    expect(fired).toBe(1);
  });
});
