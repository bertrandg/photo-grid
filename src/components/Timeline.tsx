import { useCallback, useEffect, useLayoutEffect, useRef, useSyncExternalStore } from 'react';
import type { TimelineAsset } from '../api/types';
import type { Selection } from '../timeline/selection';
import type { TimelineManager } from '../timeline/timeline-manager';
import { MonthGroup } from './MonthGroup';
import { useTimelineVersion } from './useTimeline';

interface Props {
  manager: TimelineManager;
  selection: Selection;
  onOpen: (asset: TimelineAsset) => void;
}

export function Timeline({ manager, selection, onOpen }: Props) {
  useTimelineVersion(manager);
  const selectionVersion = useSyncExternalStore(selection.subscribe, selection.getVersion);
  const onToggle = useCallback((asset: TimelineAsset) => selection.toggle(asset), [selection]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const element = scrollRef.current!;
    const content = contentRef.current!;
    manager.attach(element);
    const observer = new ResizeObserver(() => {
      manager.setViewport(Math.floor(content.clientWidth), element.clientHeight);
    });
    observer.observe(element);
    observer.observe(content);
    manager.setViewport(Math.floor(content.clientWidth), element.clientHeight);
    return () => {
      observer.disconnect();
      manager.attach(undefined);
    };
  }, [manager]);

  // Scroll compensation: months that got their real height moved the content;
  // apply the corrected scrollTop after React committed the new layout but before paint.
  useLayoutEffect(() => {
    const pending = manager.takePendingScroll();
    if (pending !== null && scrollRef.current) {
      scrollRef.current.scrollTop = pending;
    }
  });

  useEffect(() => {
    scrollRef.current?.focus({ preventScroll: true });
  }, []);

  return (
    <div
      ref={scrollRef}
      className="timeline-scroll"
      tabIndex={0}
      onScroll={(event) => manager.handleScroll(event.currentTarget.scrollTop)}
    >
      <div
        ref={contentRef}
        className={`timeline-content${selection.size > 0 ? ' selecting' : ''}`}
        style={{ height: manager.totalHeight }}>
        {manager.renderedMonths.map(({ month, days }) => (
          <MonthGroup
            key={month.key}
            month={month}
            top={month.top}
            height={month.height}
            revision={month.revision}
            status={month.status}
            days={days}
            geometry={manager.geometry}
            api={manager.api}
            showImages={!manager.isScrubbing}
            selection={selection}
            selectionVersion={selectionVersion}
            onOpen={onOpen}
            onToggle={onToggle}
          />
        ))}
      </div>
    </div>
  );
}
