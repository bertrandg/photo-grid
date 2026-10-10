import type { Downloads } from '../downloads';
import type { Selection } from '../timeline/selection';

const countFormat = new Intl.NumberFormat();

const DownloadIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 4v11m0 0l-4.5-4.5M12 15l4.5-4.5M5 19h14" />
  </svg>
);

/** Blue bar replacing the header while something is selected. */
export function SelectionBar({ selection, downloads }: { selection: Selection; downloads: Downloads }) {
  const count = selection.size;
  return (
    <div className="selection-bar">
      <button type="button" className="icon-button" onClick={() => selection.clear()} aria-label="Tout désélectionner">
        ✕
      </button>
      <span className="selection-count">
        {countFormat.format(count)} sélectionnée{count > 1 ? 's' : ''}
      </span>
      <div className="selection-actions">
        <button
          type="button"
          className="icon-button"
          onClick={() => downloads.start(selection.values())}
          aria-label="Télécharger (zip)"
          title="Télécharger (zip)"
        >
          <DownloadIcon />
        </button>
      </div>
    </div>
  );
}
