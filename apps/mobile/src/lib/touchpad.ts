import { clampSensitivity } from "@touchflow/shared";

export interface TouchPoint {
  x: number;
  y: number;
}

export interface TouchpadActions {
  onMove(dx: number, dy: number): void;
  onClick(button: "left" | "right", double: boolean): void;
  onDragStart(): void;
  onDragEnd(): void;
  onScroll(dx: number, dy: number): void;
}

export interface TouchpadConfig {
  /** A touch shorter than this with little movement counts as a tap. */
  tapMaxMs: number;
  /** Movement (px) under this still counts as a tap. */
  tapSlopPx: number;
  /** Second tap within this window makes a double-click / starts a drag. */
  doubleTapMs: number;
  scrollScale: number;
}

const DEFAULT_CONFIG: TouchpadConfig = {
  tapMaxMs: 220,
  tapSlopPx: 12,
  doubleTapMs: 250,
  scrollScale: 0.6,
};

type Timer = ReturnType<typeof setTimeout>;

/**
 * Turns raw touch events into touchpad intents. Framework-free and driven
 * entirely by the caller's clock (timestamps in ms), so every gesture —
 * including the timing-sensitive tap/double-tap/drag distinction — is unit
 * testable with fake timers.
 *
 * Gesture map:
 *  - 1 finger glide            → cursor move (sensitivity-scaled)
 *  - quick tap                 → left click (emitted after doubleTapMs, in
 *                                case a second tap follows)
 *  - tap, tap                  → double click
 *  - tap, then hold & move     → drag
 *  - 2-finger tap              → right click
 *  - 2-finger glide            → scroll
 */
export class TouchpadEngine {
  private config: TouchpadConfig;
  private sensitivity = 1;

  private touchCount = 0;
  private maxTouchCount = 0;
  private last: TouchPoint | null = null;
  private startedAt = 0;
  private travelled = 0;
  private pendingClick: Timer | null = null;
  private awaitingSecondTap = false;
  private dragging = false;

  constructor(
    private readonly actions: TouchpadActions,
    config: Partial<TouchpadConfig> = {},
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  setSensitivity(value: number): void {
    this.sensitivity = clampSensitivity(value);
  }

  touchStart(touches: TouchPoint[], now: number): void {
    this.touchCount = touches.length;
    this.maxTouchCount = Math.max(this.maxTouchCount, touches.length);
    this.last = this.centroid(touches);
    this.startedAt = now;
    this.travelled = 0;

    // A new touch during the double-tap window: cancel the pending single
    // click. If this touch turns into movement, it's a drag; if it ends as
    // a tap, it's a double click.
    if (this.awaitingSecondTap && this.pendingClick !== null) {
      clearTimeout(this.pendingClick);
      this.pendingClick = null;
    }
  }

  touchMove(touches: TouchPoint[], now: number): void {
    const point = this.centroid(touches);
    if (this.last === null) {
      this.last = point;
      return;
    }
    const dx = point.x - this.last.x;
    const dy = point.y - this.last.y;
    this.last = point;
    const frameTravel = Math.abs(dx) + Math.abs(dy);
    const travelledBefore = this.travelled;
    this.travelled += frameTravel;

    if (touches.length >= 2) {
      this.actions.onScroll(
        dx * this.config.scrollScale,
        dy * this.config.scrollScale,
      );
      return;
    }

    // The slop is a deadzone consumed once per touch: within it, nothing
    // moves (a wobbly tap stays a tap). The frame that crosses it emits
    // only the excess, so the cursor eases out instead of jumping.
    if (this.travelled <= this.config.tapSlopPx || frameTravel === 0) return;

    if (this.awaitingSecondTap && !this.dragging) {
      // Tap-then-move: begin a drag.
      this.awaitingSecondTap = false;
      this.dragging = true;
      this.actions.onDragStart();
    }

    const scale =
      travelledBefore >= this.config.tapSlopPx
        ? 1
        : (this.travelled - this.config.tapSlopPx) / frameTravel;
    this.actions.onMove(
      dx * scale * this.sensitivity,
      dy * scale * this.sensitivity,
    );
  }

  touchEnd(remaining: TouchPoint[], now: number): void {
    if (remaining.length > 0) {
      this.last = this.centroid(remaining);
      this.touchCount = remaining.length;
      return;
    }

    const wasTap =
      now - this.startedAt <= this.config.tapMaxMs &&
      this.travelled <= this.config.tapSlopPx;

    if (this.dragging) {
      this.dragging = false;
      this.actions.onDragEnd();
    } else if (wasTap && this.maxTouchCount >= 2) {
      this.actions.onClick("right", false);
    } else if (wasTap) {
      if (this.awaitingSecondTap) {
        // Second quick tap → double click, immediately.
        this.awaitingSecondTap = false;
        this.actions.onClick("left", true);
      } else {
        // Hold the single click briefly in case a double-tap or drag follows.
        this.awaitingSecondTap = true;
        this.pendingClick = setTimeout(() => {
          this.pendingClick = null;
          this.awaitingSecondTap = false;
          this.actions.onClick("left", false);
        }, this.config.doubleTapMs);
      }
    }

    this.touchCount = 0;
    this.maxTouchCount = 0;
    this.last = null;
  }

  private centroid(touches: TouchPoint[]): TouchPoint {
    const sum = touches.reduce(
      (acc, t) => ({ x: acc.x + t.x, y: acc.y + t.y }),
      { x: 0, y: 0 },
    );
    return { x: sum.x / touches.length, y: sum.y / touches.length };
  }
}

/**
 * Accumulates high-frequency deltas and flushes them at a fixed interval
 * (~60Hz) so a fast swipe becomes a few coalesced packets instead of
 * hundreds of tiny ones — better latency AND better battery.
 */
export class DeltaBatcher {
  private dx = 0;
  private dy = 0;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly flush: (dx: number, dy: number) => void,
    private readonly intervalMs: number = 16,
  ) {}

  start(): void {
    if (this.timer !== null) return;
    this.timer = setInterval(() => {
      if (this.dx !== 0 || this.dy !== 0) {
        this.flush(this.dx, this.dy);
        this.dx = 0;
        this.dy = 0;
      }
    }, this.intervalMs);
  }

  add(dx: number, dy: number): void {
    this.dx += dx;
    this.dy += dy;
  }

  stop(): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
    this.dx = 0;
    this.dy = 0;
  }
}
