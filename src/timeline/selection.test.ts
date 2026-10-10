import { describe, expect, it } from 'vitest';
import type { TimelineAsset } from '../api/types';
import { Selection } from './selection';

const asset = (id: string, localDateTime: string) => ({ id, localDateTime }) as TimelineAsset;

describe('Selection', () => {
  it('toggles, selects a whole day, clears and notifies', () => {
    const selection = new Selection();
    let notified = 0;
    selection.subscribe(() => notified++);
    const day = [asset('a', '2024-05-01T10:00:00'), asset('b', '2024-05-01T12:00:00')];

    selection.toggle(day[0]);
    expect(selection.has('a')).toBe(true);
    selection.setMany(day, true);
    expect(selection.size).toBe(2);
    expect(selection.values().map((a) => a.id)).toEqual(['b', 'a']);
    selection.toggle(day[1]);
    expect(selection.size).toBe(1);
    selection.clear();
    expect(selection.size).toBe(0);
    expect(notified).toBe(4);
  });
});
