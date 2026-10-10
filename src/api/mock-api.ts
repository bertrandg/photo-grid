import type { TimeBucket, TimeBucketAssets, TimelineApi, TimelineAsset } from './types';

/**
 * Deterministic fake library: ~150k photos from 2006 to today, with realistic
 * shapes (more photos every year, summer / December peaks, holiday bursts,
 * empty months, mixed aspect ratios). Nothing is kept in memory: every month is
 * regenerated from its own seed on demand, so `?scale=10` (1.5M photos) is fine.
 */

export interface MockApiOptions {
  /** Multiplies the number of photos per month. */
  scale?: number;
  /** Use https://picsum.photos images, otherwise only coloured placeholders. */
  images?: boolean;
  /** Simulated network latency range in ms. */
  latency?: [number, number];
  startYear?: number;
  now?: Date;
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pad = (n: number) => String(n).padStart(2, '0');

const RATIOS: Array<[ratio: number, weight: number]> = [
  [4 / 3, 35],
  [3 / 4, 25],
  [3 / 2, 10],
  [16 / 9, 10],
  [9 / 16, 9],
  [1, 9],
  [2.6, 2],
];
const RATIO_TOTAL = RATIOS.reduce((sum, [, weight]) => sum + weight, 0);

function pickRatio(random: () => number) {
  let r = random() * RATIO_TOTAL;
  for (const [ratio, weight] of RATIOS) {
    r -= weight;
    if (r <= 0) {
      return ratio;
    }
  }
  return 1;
}

function daysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason);
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(signal.reason);
      },
      { once: true },
    );
  });

export class MockApi implements TimelineApi {
  private readonly scale: number;
  private readonly images: boolean;
  private readonly latency: [number, number];
  private readonly startYear: number;
  private readonly now: Date;

  constructor(options: MockApiOptions = {}) {
    this.scale = options.scale ?? 1;
    this.images = options.images ?? true;
    this.latency = options.latency ?? [80, 250];
    this.startYear = options.startYear ?? 2006;
    this.now = options.now ?? new Date();
  }

  /** Photos taken during a month (0 for some months: nothing happened). */
  monthCount(year: number, month: number): number {
    const random = mulberry32(year * 100 + month);
    if (random() < 0.04) {
      return 0;
    }
    // Phones got better every year: ~40/month in 2006, ~900/month in the 2020s.
    const progress = Math.min(1, Math.max(0, (year - this.startYear) / 14));
    const base = 40 + 860 * progress * progress;
    const season = month === 7 || month === 8 ? 2.2 : month === 12 ? 1.6 : month === 4 || month === 5 ? 1.2 : 0.8;
    const noise = 0.45 + random() * 1.1;
    return Math.max(1, Math.round(base * season * noise * this.scale));
  }

  private months() {
    const result: Array<{ year: number; month: number }> = [];
    const lastYear = this.now.getFullYear();
    const lastMonth = this.now.getMonth() + 1;
    for (let year = lastYear; year >= this.startYear; year--) {
      for (let month = year === lastYear ? lastMonth : 12; month >= 1; month--) {
        result.push({ year, month });
      }
    }
    return result;
  }

  /** Synchronous version of getTimeBuckets (used to write the static JSON files). */
  generateBuckets(): TimeBucket[] {
    return this.months()
      .map(({ year, month }) => ({ timeBucket: `${year}-${pad(month)}-01`, count: this.monthCount(year, month) }))
      .filter((bucket) => bucket.count > 0);
  }

  async getTimeBuckets(signal?: AbortSignal): Promise<TimeBucket[]> {
    await sleep(this.latency[0], signal);
    return this.generateBuckets();
  }

  /** Synchronous version of getTimeBucket (used to write the static JSON files). */
  generateBucket(timeBucket: string): TimeBucketAssets {
    const year = Number(timeBucket.slice(0, 4));
    const month = Number(timeBucket.slice(5, 7));
    const count = this.monthCount(year, month);
    const random = mulberry32(year * 7919 + month * 104729);

    let dayCount = daysInMonth(year, month);
    if (year === this.now.getFullYear() && month === this.now.getMonth() + 1) {
      dayCount = this.now.getDate();
    }

    // Day weights: most days are quiet, a few are "events" (holidays, birthdays...).
    const weights: number[] = [];
    for (let day = 1; day <= dayCount; day++) {
      const r = random();
      weights.push(r < 0.35 ? 0 : r > 0.93 ? 8 + random() * 25 : random() * random() * 3);
    }
    if (!weights.some((w) => w > 0)) {
      weights[Math.floor(random() * dayCount)] = 1;
    }
    const totalWeight = weights.reduce((sum, w) => sum + w, 0);

    // Largest remainder: the sum is exactly `count`, consistent with getTimeBuckets.
    const perDay = weights.map((w) => Math.floor((w / totalWeight) * count));
    let missing = count - perDay.reduce((sum, n) => sum + n, 0);
    const byRemainder = weights
      .map((w, index) => ({ index, remainder: (w / totalWeight) * count - perDay[index] }))
      .sort((a, b) => b.remainder - a.remainder);
    for (let i = 0; missing > 0; i = (i + 1) % byRemainder.length, missing--) {
      perDay[byRemainder[i].index]++;
    }

    const bucket: TimeBucketAssets = {
      id: [],
      ratio: [],
      localDateTime: [],
      thumbhash: [],
      color: [],
      isImage: [],
      duration: [],
    };

    let index = 0;
    for (let day = dayCount; day >= 1; day--) {
      const n = perDay[day - 1];
      if (n === 0) {
        continue;
      }
      const seconds: number[] = [];
      const start = 7 * 3600 + random() * 10 * 3600;
      for (let i = 0; i < n; i++) {
        seconds.push(Math.min(86399, start + random() * 6 * 3600));
      }
      seconds.sort((a, b) => b - a);
      const hue = Math.floor(random() * 360);
      for (const s of seconds) {
        const hh = Math.floor(s / 3600);
        const mm = Math.floor((s % 3600) / 60);
        const ss = Math.floor(s % 60);
        const isVideo = random() < 0.05;
        bucket.id.push(`${year}${pad(month)}-${index++}`);
        bucket.ratio.push(Math.round(pickRatio(random) * 10000) / 10000);
        bucket.localDateTime.push(`${year}-${pad(month)}-${pad(day)}T${pad(hh)}:${pad(mm)}:${pad(ss)}`);
        bucket.thumbhash.push(null);
        bucket.color!.push(`hsl(${(hue + Math.floor(random() * 50)) % 360} ${25 + Math.floor(random() * 30)}% ${35 + Math.floor(random() * 25)}%)`);
        bucket.isImage.push(!isVideo);
        bucket.duration.push(isVideo ? `0:00:${pad(3 + Math.floor(random() * 50))}.000000` : null);
      }
    }
    return bucket;
  }

  async getTimeBucket(timeBucket: string, signal?: AbortSignal): Promise<TimeBucketAssets> {
    const [min, max] = this.latency;
    await sleep(min + Math.random() * (max - min), signal);
    return this.generateBucket(timeBucket);
  }

  getThumbnailUrl(asset: TimelineAsset): string | null {
    return this.images ? picsumThumbnailUrl(asset) : null;
  }

  getPreviewUrl(asset: TimelineAsset): string | null {
    return this.images ? picsumPreviewUrl(asset) : null;
  }
}

// Fixed size per asset (like Immich's 250px thumbnails) so the browser cache survives resizes.
export const picsumThumbnailUrl = (asset: TimelineAsset) =>
  `https://picsum.photos/seed/${asset.id}/${Math.round(300 * asset.ratio)}/300`;

export const picsumPreviewUrl = (asset: TimelineAsset) =>
  `https://picsum.photos/seed/${asset.id}/${Math.round(1440 * asset.ratio)}/1440`;
