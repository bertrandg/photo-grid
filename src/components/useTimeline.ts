import { useSyncExternalStore } from 'react';
import type { TimelineManager } from '../timeline/timeline-manager';

/** Re-renders when the manager says the rendered content changed (not on every scroll event). */
export function useTimelineVersion(manager: TimelineManager) {
  return useSyncExternalStore(manager.subscribe, manager.getVersion);
}
