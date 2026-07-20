/**
 * Exponential backoff for reconnect attempts: 1s, 2s, 4s … capped at maxMs.
 * Deterministic (no jitter) — with a single client per agent there's no
 * thundering-herd risk, and determinism keeps tests exact.
 */
export class ReconnectScheduler {
  private tries = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly attempt: () => void,
    private readonly baseMs: number = 1_000,
    private readonly maxMs: number = 30_000,
  ) {}

  /** Queue the next attempt; returns the delay chosen (for UI countdowns). */
  schedule(): number {
    this.cancel();
    const delay = Math.min(this.baseMs * 2 ** this.tries, this.maxMs);
    this.tries += 1;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.attempt();
    }, delay);
    return delay;
  }

  /** Call on successful connection: next failure starts the ladder over. */
  reset(): void {
    this.tries = 0;
    this.cancel();
  }

  cancel(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }

  get attemptCount(): number {
    return this.tries;
  }
}
