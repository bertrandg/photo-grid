import { describe, expect, it } from 'vitest';
import { MockApi } from './mock-api';

describe('MockApi', () => {
  const api = new MockApi({ latency: [0, 0], now: new Date(2026, 9, 10) });

  it('generates a big multi-year library, newest month first', async () => {
    const buckets = await api.getTimeBuckets();
    const total = buckets.reduce((sum, bucket) => sum + bucket.count, 0);
    expect(total).toBeGreaterThan(100_000);
    expect(buckets[0].timeBucket).toBe('2026-10-01');
    expect(buckets.at(-1)!.timeBucket.startsWith('2006')).toBe(true);
  });

  it('returns exactly `count` assets per month, sorted newest first and inside the month', async () => {
    const buckets = await api.getTimeBuckets();
    for (const bucket of buckets.slice(0, 30)) {
      const assets = api.generateBucket(bucket.timeBucket);
      expect(assets.id.length).toBe(bucket.count);
      const sorted = [...assets.localDateTime].sort().reverse();
      expect(assets.localDateTime).toEqual(sorted);
      for (const date of assets.localDateTime) {
        expect(date.slice(0, 7)).toBe(bucket.timeBucket.slice(0, 7));
      }
    }
  });

  it('is deterministic', () => {
    expect(api.generateBucket('2015-07-01')).toEqual(api.generateBucket('2015-07-01'));
  });
});
