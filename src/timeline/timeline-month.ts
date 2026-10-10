import type { TimelineAsset } from '../api/types';
import type { TimelineGeometry } from './constants';
import { formatDayTitle, formatMonthTitle } from './format';
import { justifiedLayout, type Box } from './justified-layout';

export type MonthStatus = 'idle' | 'loading' | 'loaded' | 'error';

/** One day of photos: a justified block with its title (Immich's TimelineDay). */
export class TimelineDay {
  readonly title: string;
  boxes: Box[] = [];
  /** Size of the photo block (title excluded). */
  width = 0;
  height = 0;
  /** Position inside the month, title included, relative to the month top. */
  top = 0;
  left = 0;

  constructor(
    readonly day: string,
    readonly assets: TimelineAsset[],
  ) {
    this.title = formatDayTitle(day);
  }

  /** Title + photos. */
  outerHeight = 0;

  layout(geometry: TimelineGeometry, width: number) {
    const result = justifiedLayout(
      this.assets.map((asset) => asset.ratio),
      { containerWidth: width, rowHeight: geometry.rowHeight, spacing: geometry.spacing },
    );
    this.boxes = result.boxes;
    this.width = result.width;
    this.height = result.height;
    this.outerHeight = geometry.dayHeaderHeight + result.height;
  }
}

/**
 * One month (Immich's TimelineMonth / time bucket). Before its assets are fetched
 * we only know `count`, which is enough to estimate its height: the scrollbar and
 * the scrubber represent the whole library from the start.
 */
export class TimelineMonth {
  readonly key: string;
  readonly year: number;
  readonly month: number;
  readonly title: string;

  status: MonthStatus = 'idle';
  /** Absolute position in the scroll container. */
  top = 0;
  height = 0;
  isHeightActual = false;
  days: TimelineDay[] = [];
  /** Flat list, newest first. */
  assets: TimelineAsset[] = [];
  /** Bumped every time the layout changes (memo key for React). */
  revision = 0;

  controller?: AbortController;
  cancelable = true;
  loadPromise?: Promise<void>;
  retryAt = 0;

  constructor(
    timeBucket: string,
    public count: number,
  ) {
    this.key = timeBucket;
    this.year = Number(timeBucket.slice(0, 4));
    this.month = Number(timeBucket.slice(5, 7));
    this.title = formatMonthTitle(this.year, this.month);
  }

  get isLoaded() {
    return this.status === 'loaded';
  }

  setAssets(assets: TimelineAsset[]) {
    this.assets = assets;
    this.count = assets.length;
    this.days = [];
    let current: TimelineAsset[] = [];
    let currentDay = '';
    for (const asset of assets) {
      if (asset.day !== currentDay) {
        if (current.length > 0) {
          this.days.push(new TimelineDay(currentDay, current));
        }
        current = [];
        currentDay = asset.day;
      }
      current.push(asset);
    }
    if (current.length > 0) {
      this.days.push(new TimelineDay(currentDay, current));
    }
  }

  layout(geometry: TimelineGeometry, width: number) {
    this.revision++;
    if (width <= 0) {
      return;
    }
    if (!this.isLoaded) {
      this.height = estimateMonthHeight(this.count, geometry, width);
      this.isHeightActual = false;
      return;
    }

    // Days flow like words in a paragraph: several small days share a line.
    let lineTop = geometry.monthHeaderHeight;
    let lineHeight = 0;
    let left = 0;
    for (const day of this.days) {
      day.layout(geometry, width);
      if (left > 0 && left + geometry.dayGap + day.width > width) {
        lineTop += lineHeight + geometry.spacing * 2;
        left = 0;
        lineHeight = 0;
      }
      if (left > 0) {
        left += geometry.dayGap;
      }
      day.left = left;
      day.top = lineTop;
      left += day.width;
      lineHeight = Math.max(lineHeight, day.outerHeight);
    }
    this.height = lineTop + lineHeight + geometry.monthGap;
    this.isHeightActual = true;
  }

  findAsset(id: string) {
    for (const day of this.days) {
      const index = day.assets.findIndex((asset) => asset.id === id);
      if (index !== -1) {
        return { day, box: day.boxes[index] };
      }
    }
    return undefined;
  }
}

/** Same idea as Immich's estimate: average ratio * count gives the unwrapped width of the month. */
export function estimateMonthHeight(count: number, geometry: TimelineGeometry, width: number) {
  const averageRatio = 1.25;
  const unwrappedWidth = count * (averageRatio * geometry.rowHeight + geometry.spacing) * 1.1;
  const rows = Math.max(1, Math.ceil(unwrappedWidth / width));
  const dayLines = Math.max(1, Math.ceil(rows * 0.6));
  return (
    geometry.monthHeaderHeight +
    rows * (geometry.rowHeight + geometry.spacing) +
    dayLines * geometry.dayHeaderHeight +
    geometry.monthGap
  );
}
