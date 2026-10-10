import { ImmichApi } from './immich-api';
import { MockApi } from './mock-api';
import type { TimelineApi } from './types';

export * from './types';

/**
 * `VITE_DATA_SOURCE=immich` -> real Immich server, otherwise the generated library.
 * Query string for the mock: `?scale=5` (5x more photos), `?images=off` (placeholders only).
 */
export function createApi(): TimelineApi {
  if (import.meta.env.VITE_DATA_SOURCE === 'immich') {
    return new ImmichApi();
  }
  const params = new URLSearchParams(window.location.search);
  return new MockApi({
    scale: Number(params.get('scale')) || 1,
    images: params.get('images') !== 'off',
  });
}
