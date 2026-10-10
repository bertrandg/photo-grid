import { picsumPreviewUrl, picsumThumbnailUrl } from './mock-api';
import type { TimeBucket, TimeBucketAssets, TimelineApi, TimelineAsset } from './types';

/**
 * Reads the demo library from static JSON files, like a real server would serve them:
 *   data/buckets.json             -> GET /timeline/buckets
 *   data/bucket/YYYY-MM-01.json   -> GET /timeline/bucket?timeBucket=YYYY-MM-01
 * The files are generated from MockApi by the `mock-data` plugin in vite.config.ts
 * (served on the fly by `npm run dev`, written to dist/ by `npm run build`).
 */
export class StaticApi implements TimelineApi {
  constructor(
    private readonly baseUrl = `${import.meta.env.BASE_URL}data`,
    private readonly images = true,
  ) {}

  private async get<T>(path: string, signal?: AbortSignal): Promise<T> {
    const response = await fetch(`${this.baseUrl}/${path}`, { signal });
    if (!response.ok) {
      throw new Error(`${path}: ${response.status} ${response.statusText}`);
    }
    return (await response.json()) as T;
  }

  getTimeBuckets(signal?: AbortSignal): Promise<TimeBucket[]> {
    return this.get<TimeBucket[]>('buckets.json', signal);
  }

  getTimeBucket(timeBucket: string, signal?: AbortSignal): Promise<TimeBucketAssets> {
    return this.get<TimeBucketAssets>(`bucket/${timeBucket}.json`, signal);
  }

  getThumbnailUrl(asset: TimelineAsset): string | null {
    return this.images ? picsumThumbnailUrl(asset) : null;
  }

  getPreviewUrl(asset: TimelineAsset): string | null {
    return this.images ? picsumPreviewUrl(asset) : null;
  }
}
