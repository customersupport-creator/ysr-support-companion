/** Retry-After may be seconds or an HTTP date. */
export function retryDelayMs(retryAfter: string | null, attempt: number, nowMs = Date.now()): number {
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0 && seconds < 60 * 60) {
      return Math.max(250, Math.round(seconds * 1000));
    }
    const when = Date.parse(retryAfter);
    if (!Number.isNaN(when)) return Math.max(250, when - nowMs);
  }
  return Math.min(30_000, 1000 * 2 ** attempt);
}

export class SlidingWindowLimiter {
  private stamps: number[] = [];

  constructor(
    private readonly max: number,
    private readonly windowMs: number,
    private readonly sleep: (ms: number) => Promise<void> = (ms) =>
      new Promise((resolve) => {
        setTimeout(resolve, ms);
      }),
    private readonly now: () => number = () => Date.now(),
  ) {}

  async take(): Promise<void> {
    for (;;) {
      const t = this.now();
      this.stamps = this.stamps.filter((stamp) => t - stamp < this.windowMs);
      if (this.stamps.length < this.max) {
        this.stamps.push(t);
        return;
      }
      const wait = this.windowMs - (t - this.stamps[0]) + 25;
      await this.sleep(wait);
    }
  }
}
