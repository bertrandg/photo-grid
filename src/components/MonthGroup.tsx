import { memo } from 'react';
import type { TimelineApi, TimelineAsset } from '../api/types';
import type { TimelineGeometry } from '../timeline/constants';
import type { Selection } from '../timeline/selection';
import type { RenderedDay } from '../timeline/timeline-manager';
import type { TimelineDay, TimelineMonth } from '../timeline/timeline-month';
import { Check, Thumbnail } from './Thumbnail';

const countFormat = new Intl.NumberFormat();

interface DayProps {
  day: TimelineDay;
  revision: number;
  firstAsset: number;
  lastAsset: number;
  geometry: TimelineGeometry;
  api: TimelineApi;
  showImages: boolean;
  selection: Selection;
  /** Memo key: re-render visible days when the selection changes. */
  selectionVersion: number;
  onOpen: (asset: TimelineAsset) => void;
  onToggle: (asset: TimelineAsset) => void;
}

const DayGroup = memo(function DayGroup({
  day,
  firstAsset,
  lastAsset,
  geometry,
  api,
  showImages,
  selection,
  onOpen,
  onToggle,
}: DayProps) {
  const selecting = selection.size > 0;
  let selectedCount = 0;
  for (const asset of day.assets) {
    if (selection.has(asset.id)) {
      selectedCount++;
    }
  }
  const allSelected = selectedCount === day.assets.length;

  const assets = [];
  for (let index = firstAsset; index <= lastAsset; index++) {
    const asset = day.assets[index];
    assets.push(
      <Thumbnail
        key={asset.id}
        asset={asset}
        box={day.boxes[index]}
        url={api.getThumbnailUrl(asset)}
        showImage={showImages}
        selected={selection.has(asset.id)}
        selecting={selecting}
        onOpen={onOpen}
        onToggle={onToggle}
      />,
    );
  }

  return (
    <div
      className="day"
      style={{ transform: `translate(${day.left}px, ${day.top}px)`, width: day.width, height: day.outerHeight }}
    >
      <h3 className="day-title" style={{ height: geometry.dayHeaderHeight }} title={day.title}>
        <span
          className={`check day-check${selectedCount > 0 ? ' checked' : ''}`}
          role="checkbox"
          aria-checked={allSelected ? true : selectedCount > 0 ? 'mixed' : false}
          aria-label="Sélectionner la journée"
          onClick={() => selection.setMany(day.assets, !allSelected)}
        >
          <Check checked={allSelected} partial={selectedCount > 0 && !allSelected} />
        </span>
        <span className="day-name">{day.title}</span>
        <span className="day-count">
          {countFormat.format(day.assets.length)} {day.assets.length > 1 ? 'photos' : 'photo'}
        </span>
      </h3>
      <div className="day-grid" style={{ height: day.height }}>
        {assets}
      </div>
    </div>
  );
});

interface MonthProps {
  month: TimelineMonth;
  // Passed explicitly so memo() re-renders when they change (the month object is mutable).
  top: number;
  height: number;
  revision: number;
  status: TimelineMonth['status'];
  days: RenderedDay[];
  geometry: TimelineGeometry;
  api: TimelineApi;
  showImages: boolean;
  selection: Selection;
  selectionVersion: number;
  onOpen: (asset: TimelineAsset) => void;
  onToggle: (asset: TimelineAsset) => void;
}

export const MonthGroup = memo(function MonthGroup({
  month,
  top,
  height,
  revision,
  status,
  days,
  geometry,
  api,
  showImages,
  selection,
  selectionVersion,
  onOpen,
  onToggle,
}: MonthProps) {
  return (
    <section className="month" style={{ transform: `translateY(${top}px)`, height }} data-month={month.key}>
      <h2 className="month-title" style={{ height: geometry.monthHeaderHeight }}>
        {month.title}
      </h2>
      {status === 'loaded' ? (
        days.map(({ index, firstAsset, lastAsset }) => {
          const day = month.days[index];
          return (
            <DayGroup
              key={day.day}
              day={day}
              revision={revision}
              firstAsset={firstAsset}
              lastAsset={lastAsset}
              geometry={geometry}
              api={api}
              showImages={showImages}
              selection={selection}
              selectionVersion={selectionVersion}
              onOpen={onOpen}
              onToggle={onToggle}
            />
          );
        })
      ) : (
        <div
          className={`month-skeleton${status === 'error' ? ' error' : ''}`}
          style={{
            top: geometry.monthHeaderHeight,
            height: Math.max(0, height - geometry.monthHeaderHeight - geometry.monthGap),
            backgroundSize: `100% ${geometry.rowHeight + geometry.dayHeaderHeight}px`,
          }}
        />
      )}
    </section>
  );
});
