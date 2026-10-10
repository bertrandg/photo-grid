/**
 * API contract, modelled after Immich's timeline endpoints:
 *  - GET /timeline/buckets          -> one entry per month with its asset count
 *  - GET /timeline/bucket?timeBucket -> all assets of one month, in columnar form
 *
 * Knowing only the counts is enough to estimate the height of every month,
 * so the whole timeline (years of photos) is scrollable before any asset is loaded.
 */

export interface TimeBucket {
  /** First day of the month, `YYYY-MM-01`. */
  timeBucket: string;
  count: number;
}

/** Columnar payload (one array per field) like Immich's TimeBucketAssetResponseDto: compact JSON for big months. */
export interface TimeBucketAssets {
  id: string[];
  /** width / height */
  ratio: number[];
  /** Local wall-clock time `YYYY-MM-DDTHH:mm:ss`, already sorted newest first. */
  localDateTime: string[];
  thumbhash: (string | null)[];
  /** Fallback placeholder colour when there is no thumbhash. */
  color?: (string | null)[];
  isImage: boolean[];
  duration: (string | null)[];
}

export interface TimelineAsset {
  id: string;
  ratio: number;
  localDateTime: string;
  /** `YYYY-MM-DD`, the day group the asset belongs to. */
  day: string;
  thumbhash: string | null;
  color: string | null;
  isVideo: boolean;
  duration: string | null;
}

export interface TimelineApi {
  getTimeBuckets(signal?: AbortSignal): Promise<TimeBucket[]>;
  getTimeBucket(timeBucket: string, signal?: AbortSignal): Promise<TimeBucketAssets>;
  getThumbnailUrl(asset: TimelineAsset): string | null;
  getPreviewUrl(asset: TimelineAsset): string | null;
  /** Full-size file for downloads (must be CORS-readable). */
  getDownloadUrl(asset: TimelineAsset): string | null;
}

export function toTimelineAssets(bucket: TimeBucketAssets): TimelineAsset[] {
  const assets: TimelineAsset[] = new Array(bucket.id.length);
  for (let i = 0; i < bucket.id.length; i++) {
    const localDateTime = bucket.localDateTime[i];
    assets[i] = {
      id: bucket.id[i],
      ratio: bucket.ratio[i] || 1,
      localDateTime,
      day: localDateTime.slice(0, 10),
      thumbhash: bucket.thumbhash[i] ?? null,
      color: bucket.color?.[i] ?? null,
      isVideo: !bucket.isImage[i],
      duration: bucket.duration[i] ?? null,
    };
  }
  return assets;
}
