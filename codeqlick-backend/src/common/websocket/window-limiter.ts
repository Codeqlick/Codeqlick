/** Fixed-window counter: at most `limit` events per `windowMs`. */
export class WindowLimiter {
  private windowStart = 0;
  private count = 0;

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  /** Records an event; false when it is over the limit. */
  take(now: number = Date.now()): boolean {
    if (now - this.windowStart >= this.windowMs) {
      this.windowStart = now;
      this.count = 0;
    }
    this.count += 1;
    return this.count <= this.limit;
  }
}
