import { memo } from 'react';
import type { TimelineApi, TimelineAsset } from '../api/types';
import type { TimelineGeometry } from '../timeline/constants';
import type { RenderedDay } from '../timeline/timeline-manager';
import type { TimelineDay, TimelineMonth } from '../timeline/timeline-month';
import { Thumbnail } from './Thumbnail';

interface DayProps {
  day: TimelineDay;
  revision: number;
  firstAsset: number;
  lastAsset: number;
  geometry: TimelineGeometry;
  api: TimelineApi;
  showImages: boolean;
  onOpen: (asset: TimelineAsset) => void;
}

const DayGroup = memo(function DayGroup({ day, firstAsset, lastAsset, geometry, api, showImages, onOpen }: DayProps) {
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
        onOpen={onOpen}
      />,
    );
  }

  return (
    <div
      className="day"
      style={{ transform: `translate(${day.left}px, ${day.top}px)`, width: day.width, height: day.outerHeight }}
    >
      <h3 className="day-title" style={{ height: geometry.dayHeaderHeight }} title={day.title}>
        {day.title}
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
  onOpen: (asset: TimelineAsset) => void;
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
  onOpen,
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
              onOpen={onOpen}
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
