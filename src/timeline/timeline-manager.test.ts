import { describe, expect, it } from 'vitest';
import { MockApi } from '../api/mock-api';
import { TimelineManager } from './timeline-manager';

async function setup() {
  const manager = new TimelineManager(new MockApi({ latency: [0, 0], images: false, now: new Date(2026, 9, 10) }));
  await manager.init();
  manager.setViewport(1200, 800);
  return manager;
}

const flush = async () => {
  for (let i = 0; i < 20; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
};

describe('TimelineManager', () => {
  it('estimates the whole timeline height before loading anything', async () => {
    const manager = await setup();
    expect(manager.months.length).toBeGreaterThan(200);
    expect(manager.totalHeight).toBeGreaterThan(100_000);
    for (let i = 1; i < manager.months.length; i++) {
      expect(manager.months[i].top).toBe(manager.months[i - 1].top + manager.months[i - 1].height);
    }
  });

  it('loads the months around the viewport and renders only those', async () => {
    const manager = await setup();
    await flush();
    expect(manager.months[0].isLoaded).toBe(true);
    expect(manager.months.at(-1)!.isLoaded).toBe(false);
    expect(manager.renderedMonths.length).toBeLessThan(10);
  });

  it('keeps the content on screen in place when months above get their real height', async () => {
    const manager = await setup();
    const target = manager.months[120];
    manager.scrollTo(target.top + 50);
    await flush();
    // Scroll up a bit so that months above load and change height.
    manager.scrollTo(target.top - 3000);
    const anchor = manager.months[manager.monthIndexAt(manager.scrollTop)];
    const offset = manager.scrollTop - anchor.top;
    const anchorWasLoaded = anchor.isLoaded;
    await flush();
    expect(anchorWasLoaded).toBe(true);
    expect(manager.scrollTop - anchor.top).toBeCloseTo(offset, 3);
    expect(manager.takePendingScroll()).not.toBeNull();
  });

  it('maps the scrubber to the scroll position and back', async () => {
    const manager = await setup();
    manager.scrollToScrubberFraction(0.5);
    const { fraction, month } = manager.getScrubberPosition();
    expect(fraction).toBeCloseTo(0.5, 2);
    expect(month).toBe(manager.monthAtScrubberFraction(0.5)!.month);
  });

  it('walks across month boundaries in the viewer', async () => {
    const manager = await setup();
    await flush();
    const first = manager.months[0];
    const last = first.assets[first.assets.length - 1];
    const next = await manager.getAdjacentAsset(last, 1);
    expect(next).toBe(manager.months[1].assets[0]);
    expect(await manager.getAdjacentAsset(next!, -1)).toBe(last);
  });
});
