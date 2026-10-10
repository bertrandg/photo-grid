import { toTimelineAssets, type TimelineApi, type TimelineAsset } from '../api/types';
import {
  CANCEL_MARGIN_VIEWPORTS,
  geometryFor,
  LOAD_MARGIN_VIEWPORTS,
  RENDER_MARGIN,
  type TimelineGeometry,
} from './constants';
import type { Box } from './justified-layout';
import { TimelineMonth } from './timeline-month';

export interface RenderedDay {
  index: number;
  /** Range of assets of the day that are near the viewport (inclusive). */
  firstAsset: number;
  lastAsset: number;
}

export interface RenderedMonth {
  month: TimelineMonth;
  /** Days of a loaded month that are near the viewport. */
  days: RenderedDay[];
}

export interface ScrubberMonth {
  month: TimelineMonth;
  /** Month height when the scrubber was laid out. */
  height: number;
}

type Listener = () => void;

/** Boxes are sorted by row: index of the first one matching `predicate` (false... then true...). */
function partitionPoint(boxes: Box[], predicate: (box: Box) => boolean) {
  let low = 0;
  let high = boxes.length;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (predicate(boxes[mid])) {
      high = mid;
    } else {
      low = mid + 1;
    }
  }
  return low;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/**
 * The heart of the timeline, a React-free port of Immich's TimelineManager:
 *
 * - the library is a list of months whose heights are *estimated* from their
 *   asset counts, so the full multi-year scroll range exists immediately;
 * - a sliding window around the viewport decides which months are fetched
 *   (and which in-flight fetches get cancelled) and which days are mounted;
 * - when a fetched month gets its real height, everything below it moves and
 *   the scroll position is compensated so the content on screen doesn't jump;
 * - the scrubber maps (month, % inside the month) <-> scroll position.
 *
 * React subscribes through `subscribe` / `getVersion` (useSyncExternalStore);
 * the version only changes when what must be rendered changes, not on every
 * scroll event. The scrubber listens to `onScroll` and updates the DOM directly.
 */
export class TimelineManager {
  months: TimelineMonth[] = [];
  status: 'idle' | 'loading' | 'ready' | 'error' = 'idle';
  error?: string;

  viewportWidth = 0;
  viewportHeight = 0;
  geometry: TimelineGeometry = geometryFor(1024);
  topPadding = 0;
  bottomPadding = 80;
  totalHeight = 0;
  scrollTop = 0;
  assetCount = 0;

  renderedMonths: RenderedMonth[] = [];
  scrubberMonths: ScrubberMonth[] = [];
  scrubberTotalHeight = 0;
  scrubberRevision = 0;
  /** While dragging the scrubber, thumbnails are not requested (placeholders only). */
  isScrubbing = false;

  private version = 0;
  private renderKey = '';
  private pendingScrollTop: number | null = null;
  private scrollElement?: HTMLElement;
  private monthByKey = new Map<string, TimelineMonth>();
  private loading = new Set<TimelineMonth>();
  private listeners = new Set<Listener>();
  private scrollListeners = new Set<Listener>();
  private retryTimer?: ReturnType<typeof setTimeout>;

  constructor(readonly api: TimelineApi) {}

  // ---- store plumbing ------------------------------------------------------

  subscribe = (listener: Listener) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getVersion = () => this.version;

  onScroll(listener: Listener) {
    this.scrollListeners.add(listener);
    return () => this.scrollListeners.delete(listener);
  }

  private emit() {
    this.version++;
    for (const listener of this.listeners) {
      listener();
    }
  }

  // ---- lifecycle ------------------------------------------------------------

  async init() {
    if (this.status === 'loading' || this.status === 'ready') {
      return;
    }
    this.status = 'loading';
    this.emit();
    try {
      const buckets = await this.api.getTimeBuckets();
      // Newest first, like Immich.
      buckets.sort((a, b) => (a.timeBucket < b.timeBucket ? 1 : -1));
      this.months = buckets.map((bucket) => new TimelineMonth(bucket.timeBucket, bucket.count));
      this.monthByKey = new Map(this.months.map((month) => [month.key, month]));
      this.assetCount = buckets.reduce((sum, bucket) => sum + bucket.count, 0);
      this.status = 'ready';
      this.layoutAll();
      this.snapshotScrubber();
      this.update(true);
    } catch (error) {
      this.status = 'error';
      this.error = error instanceof Error ? error.message : String(error);
      this.emit();
    }
  }

  destroy() {
    clearTimeout(this.retryTimer);
    for (const month of this.loading) {
      month.controller?.abort();
    }
  }

  attach(element: HTMLElement | undefined) {
    this.scrollElement = element;
  }

  setViewport(width: number, height: number) {
    if (width === this.viewportWidth && height === this.viewportHeight) {
      return;
    }
    const widthChanged = width !== this.viewportWidth;
    this.viewportWidth = width;
    this.viewportHeight = height;
    if (widthChanged) {
      this.geometry = geometryFor(width);
      this.withScrollAnchor(() => this.layoutAll(false));
      this.snapshotScrubber();
    }
    this.update(true);
  }

  /** Called from the scroll container's scroll event. */
  handleScroll(scrollTop: number) {
    this.scrollTop = scrollTop;
    this.update();
    for (const listener of this.scrollListeners) {
      listener();
    }
  }

  /** Read by the Timeline component in a layout effect, right after React committed the new heights. */
  takePendingScroll() {
    const pending = this.pendingScrollTop;
    this.pendingScrollTop = null;
    return pending;
  }

  scrollTo(top: number) {
    const target = clamp(top, 0, this.maxScroll);
    if (this.scrollElement) {
      this.scrollElement.scrollTop = target;
      this.handleScroll(this.scrollElement.scrollTop);
    } else {
      this.handleScroll(target);
    }
  }

  setScrubbing(value: boolean) {
    if (this.isScrubbing !== value) {
      this.isScrubbing = value;
      this.emit();
    }
  }

  // ---- geometry -------------------------------------------------------------

  get maxScroll() {
    return Math.max(0, this.totalHeight - this.viewportHeight);
  }

  private layoutAll(computeTops = true) {
    for (const month of this.months) {
      month.layout(this.geometry, this.viewportWidth);
    }
    if (computeTops) {
      this.computeTops();
    }
  }

  private computeTops() {
    let top = this.topPadding;
    for (const month of this.months) {
      month.top = top;
      top += month.height;
    }
    this.totalHeight = top + this.bottomPadding;
  }

  /** Index of the month containing `y` (binary search, months are sorted by top). */
  monthIndexAt(y: number) {
    let low = 0;
    let high = this.months.length - 1;
    while (low < high) {
      const mid = (low + high + 1) >> 1;
      if (this.months[mid].top <= y) {
        low = mid;
      } else {
        high = mid - 1;
      }
    }
    return low;
  }

  /**
   * Runs a mutation that changes month heights while keeping what is on screen
   * in place: the month at the top of the viewport is the anchor. If its own
   * height didn't change we keep the exact pixel offset inside it (months above
   * it were resized), otherwise we keep the same relative position.
   */
  private withScrollAnchor(mutate: () => void) {
    const previousTop = this.scrollTop;
    const anchor = previousTop > 0 && this.months.length > 0 ? this.months[this.monthIndexAt(previousTop)] : undefined;
    const offset = anchor ? previousTop - anchor.top : 0;
    const previousHeight = anchor?.height ?? 0;

    mutate();
    this.computeTops();

    if (!anchor || previousHeight <= 0) {
      return;
    }
    const next =
      anchor.height === previousHeight
        ? anchor.top + offset
        : anchor.top + (offset / previousHeight) * anchor.height;
    const clamped = clamp(next, 0, this.maxScroll);
    if (Math.abs(clamped - previousTop) > 0.5) {
      this.scrollTop = clamped;
      this.pendingScrollTop = clamped;
    }
  }

  // ---- sliding window -------------------------------------------------------

  /** Decides what to fetch, what to cancel and what to render for the current scroll position. */
  private update(force = false) {
    if (this.status !== 'ready' || this.months.length === 0 || this.viewportHeight === 0 || this.viewportWidth === 0) {
      if (force) {
        this.emit();
      }
      return;
    }
    const viewTop = this.scrollTop;
    const viewBottom = viewTop + this.viewportHeight;

    // 1. Fetch months close to the viewport, nearest first.
    const loadTop = viewTop - this.viewportHeight * LOAD_MARGIN_VIEWPORTS;
    const loadBottom = viewBottom + this.viewportHeight * LOAD_MARGIN_VIEWPORTS;
    const toLoad: TimelineMonth[] = [];
    for (let i = this.monthIndexAt(loadTop); i < this.months.length && this.months[i].top < loadBottom; i++) {
      const month = this.months[i];
      if (month.status === 'idle' || (month.status === 'error' && Date.now() >= month.retryAt)) {
        toLoad.push(month);
      }
    }
    const center = (viewTop + viewBottom) / 2;
    toLoad.sort((a, b) => Math.abs(a.top + a.height / 2 - center) - Math.abs(b.top + b.height / 2 - center));
    for (const month of toLoad) {
      void this.loadMonth(month);
    }

    // 2. Cancel fetches of months we scrubbed past.
    const cancelTop = viewTop - this.viewportHeight * CANCEL_MARGIN_VIEWPORTS;
    const cancelBottom = viewBottom + this.viewportHeight * CANCEL_MARGIN_VIEWPORTS;
    for (const month of this.loading) {
      if (month.cancelable && (month.top + month.height < cancelTop || month.top > cancelBottom)) {
        month.controller?.abort();
      }
    }

    // 3. Months / days to mount.
    const renderTop = viewTop - RENDER_MARGIN;
    const renderBottom = viewBottom + RENDER_MARGIN;
    const rendered: RenderedMonth[] = [];
    let key = `${this.totalHeight}`;
    for (let i = this.monthIndexAt(renderTop); i < this.months.length && this.months[i].top < renderBottom; i++) {
      const month = this.months[i];
      if (month.top + month.height <= renderTop) {
        continue;
      }
      const days: RenderedDay[] = [];
      key += `|${month.key}:${month.revision}:${month.status}`;
      if (month.isLoaded) {
        for (let d = 0; d < month.days.length; d++) {
          const day = month.days[d];
          const dayTop = month.top + day.top;
          if (dayTop >= renderBottom) {
            break;
          }
          if (dayTop + day.outerHeight <= renderTop) {
            continue;
          }
          // Big days (hundreds of photos) are virtualized too, row by row.
          const gridTop = dayTop + this.geometry.dayHeaderHeight;
          const firstAsset = partitionPoint(day.boxes, (box) => gridTop + box.top + box.height > renderTop);
          const lastAsset = partitionPoint(day.boxes, (box) => gridTop + box.top >= renderBottom) - 1;
          days.push({ index: d, firstAsset, lastAsset });
          key += `,${d}:${firstAsset}-${lastAsset}`;
        }
      }
      rendered.push({ month, days });
    }

    if (force || key !== this.renderKey) {
      this.renderKey = key;
      this.renderedMonths = rendered;
      this.emit();
    }
  }

  // ---- loading --------------------------------------------------------------

  private loadMonth(month: TimelineMonth, cancelable = true): Promise<void> {
    if (month.isLoaded) {
      return Promise.resolve();
    }
    if (month.loadPromise) {
      if (!cancelable) {
        month.cancelable = false;
      }
      return month.loadPromise;
    }

    const controller = new AbortController();
    month.status = 'loading';
    month.controller = controller;
    month.cancelable = cancelable;
    this.loading.add(month);

    const promise = (async () => {
      try {
        const bucket = await this.api.getTimeBucket(month.key, controller.signal);
        if (controller.signal.aborted) {
          month.status = 'idle';
          return;
        }
        const estimatedCount = month.count;
        month.setAssets(toTimelineAssets(bucket));
        month.status = 'loaded';
        // Counts from /buckets and /bucket can disagree on a live library.
        this.assetCount += month.count - estimatedCount;
        this.withScrollAnchor(() => month.layout(this.geometry, this.viewportWidth));
      } catch (error) {
        if (controller.signal.aborted) {
          month.status = 'idle';
        } else {
          console.error(`Failed to load ${month.key}`, error);
          month.status = 'error';
          month.retryAt = Date.now() + 3000;
          clearTimeout(this.retryTimer);
          this.retryTimer = setTimeout(() => this.update(), 3100);
        }
      } finally {
        this.loading.delete(month);
        month.controller = undefined;
        month.loadPromise = undefined;
        this.update(true);
      }
    })();
    month.loadPromise = promise;
    return promise;
  }

  async ensureLoaded(month: TimelineMonth) {
    while (!month.isLoaded) {
      await this.loadMonth(month, false);
      if (month.status === 'error') {
        throw new Error(`Unable to load ${month.title}`);
      }
    }
  }

  // ---- navigation -----------------------------------------------------------

  monthOf(asset: TimelineAsset) {
    return this.monthByKey.get(`${asset.localDateTime.slice(0, 7)}-01`);
  }

  /** Next asset in the timeline order: direction 1 = older, -1 = newer. Loads neighbour months if needed. */
  async getAdjacentAsset(asset: TimelineAsset, direction: 1 | -1): Promise<TimelineAsset | undefined> {
    const month = this.monthOf(asset);
    if (!month) {
      return undefined;
    }
    const index = month.assets.findIndex((candidate) => candidate.id === asset.id);
    const next = month.assets[index + direction];
    if (index !== -1 && next) {
      return next;
    }
    for (let i = this.months.indexOf(month) + direction; i >= 0 && i < this.months.length; i += direction) {
      const neighbour = this.months[i];
      await this.ensureLoaded(neighbour);
      if (neighbour.assets.length > 0) {
        return direction === 1 ? neighbour.assets[0] : neighbour.assets[neighbour.assets.length - 1];
      }
    }
    return undefined;
  }

  /** Brings an asset into view if it isn't (e.g. after browsing in the viewer). */
  async scrollToAsset(asset: TimelineAsset) {
    const month = this.monthOf(asset);
    if (!month) {
      return;
    }
    await this.ensureLoaded(month);
    const found = month.findAsset(asset.id);
    if (!found) {
      return;
    }
    const top = month.top + found.day.top + this.geometry.dayHeaderHeight + found.box.top;
    if (top < this.scrollTop || top + found.box.height > this.scrollTop + this.viewportHeight) {
      this.scrollTo(top - this.viewportHeight / 3);
    }
  }

  /** Jumps to the first month at or before `yearMonth` (`YYYY-MM`). */
  scrollToMonth(yearMonth: string) {
    const target = `${yearMonth}-01`;
    const month = this.months.find((candidate) => candidate.key <= target) ?? this.months.at(-1);
    if (month) {
      this.scrollTo(month.top);
    }
  }

  // ---- scrubber -------------------------------------------------------------

  /**
   * Like Immich, the scrubber is laid out from a snapshot of the month heights
   * (taken at init and on width change) so it doesn't wiggle while months load.
   */
  private snapshotScrubber() {
    this.scrubberMonths = this.months.map((month) => ({ month, height: month.height }));
    this.scrubberTotalHeight = this.scrubberMonths.reduce((sum, item) => sum + item.height, 0);
    this.scrubberRevision++;
  }

  /**
   * The "virtual" position: scrollTop is stretched over the whole content
   * height so that the scrubber reaches its bottom at the end of the timeline.
   */
  private get scrollRatio() {
    return this.totalHeight > 0 ? this.maxScroll / this.totalHeight : 0;
  }

  /** Where the scrubber indicator goes (0..1) and the month it points to. */
  getScrubberPosition(): { fraction: number; month: TimelineMonth | undefined } {
    if (this.months.length === 0 || this.scrubberTotalHeight === 0) {
      return { fraction: 0, month: undefined };
    }
    const ratio = this.scrollRatio;
    const position = ratio > 0 ? this.scrollTop / ratio : 0;
    const index = this.monthIndexAt(position);
    const month = this.months[index];
    const percent = clamp((position - month.top) / month.height, 0, 1);

    let offset = 0;
    for (let i = 0; i < index; i++) {
      offset += this.scrubberMonths[i].height;
    }
    offset += this.scrubberMonths[index].height * percent;
    return { fraction: clamp(offset / this.scrubberTotalHeight, 0, 1), month };
  }

  /** Month under a scrubber position, and how far inside it (0..1). */
  monthAtScrubberFraction(fraction: number): { month: TimelineMonth; percent: number } | undefined {
    if (this.scrubberMonths.length === 0) {
      return undefined;
    }
    let remaining = clamp(fraction, 0, 1) * this.scrubberTotalHeight;
    for (const item of this.scrubberMonths) {
      if (remaining < item.height) {
        return { month: item.month, percent: remaining / item.height };
      }
      remaining -= item.height;
    }
    return { month: this.scrubberMonths[this.scrubberMonths.length - 1].month, percent: 1 };
  }

  scrollToScrubberFraction(fraction: number) {
    const target = this.monthAtScrubberFraction(fraction);
    if (!target) {
      return;
    }
    const { month, percent } = target;
    this.scrollTo((month.top + percent * month.height) * this.scrollRatio);
  }
}
