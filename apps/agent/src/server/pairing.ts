import { randomInt } from "node:crypto";
import { PAIR_CODE_TTL_MS, PAIR_MAX_ATTEMPTS } from "@touchflow/shared";

export type PairVerifyResult = "ok" | "bad-code" | "expired" | "rate-limited";

/**
 * Owns the 6-digit pairing code lifecycle.
 *
 * Security properties:
 * - Codes are cryptographically random (not Math.random).
 * - Codes expire after PAIR_CODE_TTL_MS.
 * - Codes are one-time: a successful pair rotates the code immediately.
 * - After PAIR_MAX_ATTEMPTS wrong guesses the code is burned and rotated,
 *   so brute-forcing 1,000,000 combinations is impossible.
 */
export class PairingService {
  private code = "";
  private expiresAt = 0;
  private attempts = 0;

  constructor(
    private readonly ttlMs: number = PAIR_CODE_TTL_MS,
    private readonly maxAttempts: number = PAIR_MAX_ATTEMPTS,
  ) {
    this.rotate();
  }

  get currentCode(): string {
    return this.code;
  }

  get expiresAtMs(): number {
    return this.expiresAt;
  }

  get isExpired(): boolean {
    return Date.now() >= this.expiresAt;
  }

  /** Generate a fresh code and reset attempt counting. */
  rotate(): string {
    this.code = randomInt(0, 1_000_000).toString().padStart(6, "0");
    this.expiresAt = Date.now() + this.ttlMs;
    this.attempts = 0;
    return this.code;
  }

  verify(candidate: string): PairVerifyResult {
    if (this.isExpired) {
      this.rotate();
      return "expired";
    }
    this.attempts += 1;
    if (this.attempts > this.maxAttempts) {
      this.rotate();
      return "rate-limited";
    }
    if (candidate === this.code) {
      this.rotate(); // one-time use
      return "ok";
    }
    return "bad-code";
  }
}
