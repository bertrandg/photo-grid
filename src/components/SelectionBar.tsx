import { useState } from 'react';
import type { TimelineApi } from '../api/types';
import { downloadAsZip } from '../download';
import type { Selection } from '../timeline/selection';

const countFormat = new Intl.NumberFormat();

const DownloadIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 4v11m0 0l-4.5-4.5M12 15l4.5-4.5M5 19h14" />
  </svg>
);

/** Blue bar replacing the header while something is selected. */
export function SelectionBar({ selection, api }: { selection: Selection; api: TimelineApi }) {
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const count = selection.size;

  const download = async () => {
    setError(null);
    setProgress({ done: 0, total: count });
    try {
      await downloadAsZip(api, selection.values(), (done, total) => setProgress({ done, total }));
    } catch (cause) {
      setError(`Échec du téléchargement : ${cause instanceof Error ? cause.message : String(cause)}`);
    } finally {
      setProgress(null);
    }
  };

  return (
    <div className="selection-bar">
      <button type="button" className="icon-button" onClick={() => selection.clear()} aria-label="Tout désélectionner">
        ✕
      </button>
      <span className="selection-count">
        {countFormat.format(count)} sélectionnée{count > 1 ? 's' : ''}
      </span>
      {error && <span className="selection-error">{error}</span>}
      <div className="selection-actions">
        {progress && (
          <span className="selection-progress">
            Préparation du zip… {progress.done}/{progress.total}
          </span>
        )}
        <button
          type="button"
          className="icon-button"
          onClick={download}
          disabled={progress !== null}
          aria-label="Télécharger (zip)"
          title="Télécharger (zip)"
        >
          <DownloadIcon />
        </button>
      </div>
    </div>
  );
}
