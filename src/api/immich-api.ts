import type { TimeBucket, TimeBucketAssets, TimelineApi, TimelineAsset } from './types';

/**
 * Reads a real Immich server (through the Vite dev proxy, see vite.config.ts).
 * Uses the same endpoints as Immich's own web timeline.
 */

interface ImmichTimeBucketAssets {
  id: string[];
  ratio: number[];
  fileCreatedAt: string[];
  localOffsetHours: number[];
  thumbhash: (string | null)[];
  isImage: boolean[];
  duration: (string | null)[];
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Immich sends UTC + the offset of the place the photo was taken: rebuild the local wall-clock time. */
function toLocalDateTime(fileCreatedAt: string, offsetHours: number) {
  const date = new Date(new Date(fileCreatedAt).getTime() + (offsetHours || 0) * 3_600_000);
  return (
    `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}` +
    `T${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`
  );
}

export class ImmichApi implements TimelineApi {
  constructor(private readonly baseUrl = '/immich/api') {}

  private async get<T>(path: string, params: Record<string, string>, signal?: AbortSignal): Promise<T> {
    const query = new URLSearchParams(params).toString();
    const response = await fetch(`${this.baseUrl}${path}?${query}`, { signal });
    if (!response.ok) {
      throw new Error(`Immich ${path}: ${response.status} ${response.statusText}`);
    }
    return (await response.json()) as T;
  }

  async getTimeBuckets(signal?: AbortSignal): Promise<TimeBucket[]> {
    const buckets = await this.get<TimeBucket[]>('/timeline/buckets', { visibility: 'timeline' }, signal);
    return buckets.map((bucket) => ({ timeBucket: bucket.timeBucket.slice(0, 10), count: bucket.count }));
  }

  async getTimeBucket(timeBucket: string, signal?: AbortSignal): Promise<TimeBucketAssets> {
    const data = await this.get<ImmichTimeBucketAssets>(
      '/timeline/bucket',
      { timeBucket, visibility: 'timeline' },
      signal,
    );
    const localDateTime = data.fileCreatedAt.map((date, i) => toLocalDateTime(date, data.localOffsetHours[i]));

    // Sort newest first (Immich already does, but local offsets can reorder a few).
    const order = localDateTime.map((_, i) => i).sort((a, b) => (localDateTime[a] < localDateTime[b] ? 1 : -1));
    return {
      id: order.map((i) => data.id[i]),
      ratio: order.map((i) => data.ratio[i]),
      localDateTime: order.map((i) => localDateTime[i]),
      thumbhash: order.map((i) => data.thumbhash[i]),
      isImage: order.map((i) => data.isImage[i]),
      duration: order.map((i) => data.duration[i]),
    };
  }

  getThumbnailUrl(asset: TimelineAsset): string {
    return `${this.baseUrl}/assets/${asset.id}/thumbnail?size=thumbnail`;
  }

  getPreviewUrl(asset: TimelineAsset): string {
    return `${this.baseUrl}/assets/${asset.id}/thumbnail?size=preview`;
  }

  getDownloadUrl(asset: TimelineAsset): string {
    return `${this.baseUrl}/assets/${asset.id}/original`;
  }
}
