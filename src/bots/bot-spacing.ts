export const BOT_WORLD_X_MIN = -50000;
export const BOT_WORLD_X_MAX = 50000;
export const BOT_DEFAULT_SPAWN_MIN = -3500;
export const BOT_DEFAULT_SPAWN_MAX = 3500;
export const BOT_MIN_SPACING = 88;

const SPACING_FALLBACKS = [BOT_MIN_SPACING, 68, 52, 40];

export type RoomOccupant = { socketId: string; x: number };
export type SpawnBand = { min: number; max: number };

export function clampRoomX(x: number): number {
  return Math.max(
    BOT_WORLD_X_MIN,
    Math.min(BOT_WORLD_X_MAX, Math.round(x)),
  );
}

export function isTooClose(
  x: number,
  others: RoomOccupant[],
  excludeSocketId?: string,
  minGap = BOT_MIN_SPACING,
): boolean {
  for (const other of others) {
    if (excludeSocketId && other.socketId === excludeSocketId) continue;
    if (Math.abs(x - other.x) < minGap) return true;
  }
  return false;
}

function freeSlots(
  others: RoomOccupant[],
  minGap: number,
  band: SpawnBand,
  excludeSocketId?: string,
): number[] {
  const slots: number[] = [];
  const start = Math.max(BOT_WORLD_X_MIN, band.min);
  const end = Math.min(BOT_WORLD_X_MAX, band.max);
  for (let x = start + minGap / 2; x <= end - minGap / 2; x += minGap) {
    if (!isTooClose(x, others, excludeSocketId, minGap)) {
      slots.push(Math.round(x));
    }
  }
  return slots;
}

function farthestX(others: RoomOccupant[], band: SpawnBand): number {
  let best = (band.min + band.max) / 2;
  let bestScore = -1;
  const start = Math.max(BOT_WORLD_X_MIN, band.min);
  const end = Math.min(BOT_WORLD_X_MAX, band.max);
  for (let x = start; x <= end; x += 24) {
    const score = Math.min(
      ...others.map((o) => Math.abs(x - o.x)),
      Number.POSITIVE_INFINITY,
    );
    if (score > bestScore) {
      bestScore = score;
      best = x;
    }
  }
  return clampRoomX(best);
}

export function findSpawnX(others: RoomOccupant[], band: SpawnBand): number {
  for (const gap of SPACING_FALLBACKS) {
    const slots = freeSlots(others, gap, band);
    if (slots.length > 0) {
      return slots[Math.floor(Math.random() * slots.length)];
    }
  }
  if (others.length === 0) {
    return clampRoomX(band.min + Math.random() * (band.max - band.min));
  }
  return farthestX(others, band);
}

export function resolveMoveTarget(
  currentX: number,
  desiredX: number,
  others: RoomOccupant[],
  excludeSocketId: string,
): number {
  const target = clampRoomX(desiredX);
  for (const gap of SPACING_FALLBACKS) {
    if (!isTooClose(target, others, excludeSocketId, gap)) return target;

    let best = currentX;
    let bestScore = -1;
    for (let delta = 0; delta <= 520; delta += 12) {
      for (const sign of delta === 0 ? [0] : [-1, 1]) {
        const candidate = clampRoomX(target + sign * delta);
        if (isTooClose(candidate, others, excludeSocketId, gap)) continue;
        const spread = Math.min(...others.map((o) => Math.abs(candidate - o.x)));
        const score = spread * 3 - Math.abs(candidate - target);
        if (score > bestScore) {
          bestScore = score;
          best = candidate;
        }
      }
    }
    if (
      best !== currentX &&
      !isTooClose(best, others, excludeSocketId, gap)
    ) {
      return best;
    }
  }
  return currentX;
}

export function spawnBandAroundHumans(humans: RoomOccupant[]): SpawnBand {
  if (humans.length === 0) {
    return { min: BOT_DEFAULT_SPAWN_MIN, max: BOT_DEFAULT_SPAWN_MAX };
  }
  const xs = humans.map((h) => h.x);
  const center = xs.reduce((sum, x) => sum + x, 0) / xs.length;
  const spread = Math.max(...xs.map((x) => Math.abs(x - center)), 400);
  const radius = Math.max(1400, spread + 800);
  return {
    min: clampRoomX(center - radius),
    max: clampRoomX(center + radius),
  };
}
