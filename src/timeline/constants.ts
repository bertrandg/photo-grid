export interface TimelineGeometry {
  rowHeight: number;
  /** Space between thumbnails. */
  spacing: number;
  /** Space between two day groups on the same line. */
  dayGap: number;
  monthHeaderHeight: number;
  dayHeaderHeight: number;
  /** Space after each month. */
  monthGap: number;
}

/** Same breakpoint / row heights as Immich: 235px on desktop, 100px on phones. */
export function geometryFor(viewportWidth: number): TimelineGeometry {
  const small = viewportWidth < 850;
  return {
    rowHeight: small ? 100 : 235,
    spacing: small ? 2 : 4,
    dayGap: small ? 8 : 16,
    monthHeaderHeight: small ? 44 : 64,
    dayHeaderHeight: small ? 32 : 40,
    monthGap: small ? 8 : 16,
  };
}

/** Months/days are mounted in the DOM this far outside the viewport (px). */
export const RENDER_MARGIN = 600;
/** Months are fetched when they are within this many viewports of the visible area. */
export const LOAD_MARGIN_VIEWPORTS = 1.5;
/** Pending fetches are cancelled when the month moves further than this. */
export const CANCEL_MARGIN_VIEWPORTS = 4;
