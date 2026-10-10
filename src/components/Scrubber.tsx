import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { formatShortMonth } from '../timeline/format';
import type { TimelineManager } from '../timeline/timeline-manager';
import { useTimelineVersion } from './useTimeline';

const PADDING_TOP = 28;
const PADDING_BOTTOM = 16;
const MIN_YEAR_LABEL_DISTANCE = 18;
const MIN_DOT_DISTANCE = 8;

interface Segment {
  key: string;
  top: number;
  height: number;
  year: number;
  hasLabel: boolean;
  hasDot: boolean;
}

/**
 * Immich-style date scrubber: a vertical track where each month takes a share
 * proportional to its height in the timeline. Hover shows the month, drag
 * scrolls the timeline (to the exact month + % inside it).
 */
export function Scrubber({ manager }: { manager: TimelineManager }) {
  useTimelineVersion(manager);
  const rootRef = useRef<HTMLDivElement>(null);
  const indicatorRef = useRef<HTMLDivElement>(null);
  const indicatorLabelRef = useRef<HTMLSpanElement>(null);
  const [trackHeight, setTrackHeight] = useState(0);
  const [hover, setHover] = useState<{ y: number; label: string } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [scrolling, setScrolling] = useState(false);

  useLayoutEffect(() => {
    const element = rootRef.current!;
    const observer = new ResizeObserver(() => setTrackHeight(element.clientHeight - PADDING_TOP - PADDING_BOTTOM));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const segments = useMemo(() => {
    const result: Segment[] = [];
    if (trackHeight <= 0 || manager.scrubberTotalHeight === 0) {
      return result;
    }
    let top = 0;
    let lastLabelTop = -Infinity;
    let lastLabelYear = -1;
    let lastDotTop = -Infinity;
    for (const { month, height } of manager.scrubberMonths) {
      const segmentHeight = (height / manager.scrubberTotalHeight) * trackHeight;
      const hasLabel = month.year !== lastLabelYear && top - lastLabelTop >= MIN_YEAR_LABEL_DISTANCE;
      if (hasLabel) {
        lastLabelTop = top;
        lastLabelYear = month.year;
      }
      const hasDot = !hasLabel && top - lastDotTop >= MIN_DOT_DISTANCE && top - lastLabelTop >= MIN_DOT_DISTANCE;
      if (hasDot || hasLabel) {
        lastDotTop = top;
      }
      result.push({ key: month.key, top, height: segmentHeight, year: month.year, hasLabel, hasDot });
      top += segmentHeight;
    }
    return result;
    // scrubberRevision changes when the manager takes a new snapshot.
  }, [manager, manager.scrubberRevision, trackHeight]);

  // Indicator follows the scroll position without re-rendering React.
  useEffect(() => {
    let idleTimer: ReturnType<typeof setTimeout> | undefined;
    const sync = () => {
      const { fraction, month } = manager.getScrubberPosition();
      if (indicatorRef.current) {
        indicatorRef.current.style.transform = `translateY(${PADDING_TOP + fraction * trackHeight}px)`;
      }
      if (indicatorLabelRef.current && month) {
        indicatorLabelRef.current.textContent = formatShortMonth(month.year, month.month);
      }
    };
    sync();
    const unsubscribe = manager.onScroll(() => {
      sync();
      setScrolling(true);
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => setScrolling(false), 1200);
    });
    return () => {
      unsubscribe();
      clearTimeout(idleTimer);
    };
  }, [manager, trackHeight, segments]);

  const fractionAt = (clientY: number) => {
    const rect = rootRef.current!.getBoundingClientRect();
    const y = Math.min(Math.max(clientY - rect.top - PADDING_TOP, 0), trackHeight);
    return { y: y + PADDING_TOP, fraction: trackHeight > 0 ? y / trackHeight : 0 };
  };

  const updateHover = (clientY: number) => {
    const { y, fraction } = fractionAt(clientY);
    const target = manager.monthAtScrubberFraction(fraction);
    setHover(target ? { y, label: formatShortMonth(target.month.year, target.month.month) } : null);
    return fraction;
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) {
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
    manager.setScrubbing(true);
    manager.scrollToScrubberFraction(updateHover(event.clientY));
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const fraction = updateHover(event.clientY);
    if (dragging) {
      manager.scrollToScrubberFraction(fraction);
    }
  };

  const endDrag = () => {
    setDragging(false);
    manager.setScrubbing(false);
  };

  const showIndicatorLabel = (scrolling || dragging) && !hover;

  return (
    <div
      ref={rootRef}
      className={`scrubber${dragging ? ' dragging' : ''}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onPointerLeave={() => !dragging && setHover(null)}
      role="scrollbar"
      aria-orientation="vertical"
      aria-controls="timeline"
      aria-valuenow={0}
    >
      {segments.map((segment) =>
        segment.hasLabel ? (
          <span key={segment.key} className="scrubber-year" style={{ top: PADDING_TOP + segment.top }}>
            {segment.year}
          </span>
        ) : segment.hasDot ? (
          <span key={segment.key} className="scrubber-dot" style={{ top: PADDING_TOP + segment.top }} />
        ) : null,
      )}

      <div ref={indicatorRef} className="scrubber-indicator">
        <span ref={indicatorLabelRef} className={`scrubber-bubble${showIndicatorLabel ? ' visible' : ''}`} />
      </div>

      {hover && (
        <div className="scrubber-hover" style={{ transform: `translateY(${hover.y}px)` }}>
          <span className="scrubber-bubble visible">{hover.label}</span>
        </div>
      )}
    </div>
  );
}
