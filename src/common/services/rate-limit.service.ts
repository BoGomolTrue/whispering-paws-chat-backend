import { Injectable } from "@nestjs/common";

@Injectable()
export class RateLimitService {
  private rateLimits = new Map<string, number[]>();

  checkLimit(
    socketId: string,
    action: string,
    intervalMs: number,
    maxCount: number,
  ): boolean {
    const key = `${socketId}:${action}`;
    const now = Date.now();

    if (!this.rateLimits.has(key)) {
      this.rateLimits.set(key, []);
    }

    const timestamps = this.rateLimits.get(key);
    const validTimestamps =
      timestamps?.filter((t) => now - t < intervalMs) || [];

    if (validTimestamps.length >= maxCount) {
      return false;
    }

    validTimestamps.push(now);
    this.rateLimits.set(key, validTimestamps);
    return true;
  }

  clearSocketLimits(socketId: string): void {
    for (const key of this.rateLimits.keys()) {
      if (key.startsWith(`${socketId}:`)) {
        this.rateLimits.delete(key);
      }
    }
  }
}
