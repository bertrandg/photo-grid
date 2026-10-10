import { useCallback, useEffect, useState } from 'react';
import { createApi, type TimelineAsset } from './api';
import { AssetViewer } from './components/AssetViewer';
import { Scrubber } from './components/Scrubber';
import { Timeline } from './components/Timeline';
import { useTimelineVersion } from './components/useTimeline';
import { TimelineManager } from './timeline/timeline-manager';

const numberFormat = new Intl.NumberFormat();

export function App() {
  const [manager] = useState(() => new TimelineManager(createApi()));
  const [viewing, setViewing] = useState<TimelineAsset | null>(null);
  useTimelineVersion(manager);

  useEffect(() => {
    void manager.init();
    return () => manager.destroy();
  }, [manager]);

  const closeViewer = useCallback(() => {
    setViewing((asset) => {
      if (asset) {
        void manager.scrollToAsset(asset);
      }
      return null;
    });
  }, [manager]);

  const newest = manager.months[0];
  const oldest = manager.months.at(-1);

  return (
    <div className="app">
      <header className="app-bar">
        <h1>Photos</h1>
        {manager.status === 'ready' && (
          <span className="app-count">
            {numberFormat.format(manager.assetCount)} photos · {manager.months.length} mois
          </span>
        )}
        {newest && oldest && (
          <label className="app-jump">
            Aller à
            <input
              type="month"
              min={oldest.key.slice(0, 7)}
              max={newest.key.slice(0, 7)}
              onChange={(event) => event.target.value && manager.scrollToMonth(event.target.value)}
            />
          </label>
        )}
      </header>

      <main className="timeline-area">
        {manager.status === 'error' && <div className="app-message">Erreur : {manager.error}</div>}
        {manager.status === 'loading' && <div className="app-message">Chargement de la timeline…</div>}
        <Timeline manager={manager} onOpen={setViewing} />
        <Scrubber manager={manager} />
      </main>

      {viewing && <AssetViewer manager={manager} asset={viewing} onNavigate={setViewing} onClose={closeViewer} />}
    </div>
  );
}
