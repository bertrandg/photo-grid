import { ImmichApi } from './immich-api';
import { MockApi } from './mock-api';
import { StaticApi } from './static-api';
import type { TimelineApi } from './types';

export * from './types';

/**
 * - `VITE_DATA_SOURCE=immich`  -> a real Immich server (see vite.config.ts)
 * - default                    -> the demo library, fetched as static JSON files (visible in DevTools)
 * - `?source=mock` or `?scale=N` -> the demo library generated in the browser (N times bigger, no network)
 * - `?images=off`              -> coloured placeholders instead of picsum.photos images
 */
export function createApi(): TimelineApi {
  if (import.meta.env.VITE_DATA_SOURCE === 'immich') {
    return new ImmichApi();
  }
  const params = new URLSearchParams(window.location.search);
  const images = params.get('images') !== 'off';
  if (params.get('source') === 'mock' || params.has('scale')) {
    return new MockApi({ scale: Number(params.get('scale')) || 1, images });
  }
  return new StaticApi(undefined, images);
}
