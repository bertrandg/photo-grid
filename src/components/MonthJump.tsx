import { useEffect, useRef, useState } from 'react';
import type { TimelineManager } from '../timeline/timeline-manager';

const currentMonth = (manager: TimelineManager) => manager.monthAtViewportTop()?.key.slice(0, 7) ?? '';

/**
 * "Aller à" month picker. Picking a month scrolls the timeline, and it follows
 * the timeline back: scrolling or using the scrubber updates it to the month
 * at the top of the screen. Only re-renders when that month changes.
 */
export function MonthJump({ manager, min, max }: { manager: TimelineManager; min: string; max: string }) {
  const [value, setValue] = useState(() => currentMonth(manager));
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const sync = () => {
      // Don't overwrite the field while the user is typing a date in it.
      if (document.activeElement !== inputRef.current) {
        setValue(currentMonth(manager));
      }
    };
    sync();
    const unsubscribe = manager.onScroll(sync);
    return () => {
      unsubscribe();
    };
  }, [manager]);

  return (
    <label className="app-jump">
      Aller à
      <input
        ref={inputRef}
        type="month"
        min={min}
        max={max}
        value={value}
        onChange={(event) => {
          setValue(event.target.value);
          if (event.target.value) {
            manager.scrollToMonth(event.target.value);
          }
        }}
        onBlur={() => setValue(currentMonth(manager))}
      />
    </label>
  );
}
