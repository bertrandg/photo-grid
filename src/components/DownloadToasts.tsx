import { useSyncExternalStore } from 'react';
import type { DownloadJob, Downloads } from '../downloads';

const numberFormat = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 });

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) {
    return `${numberFormat.format(bytes / 1024)} Ko`;
  }
  if (bytes < 1024 ** 3) {
    return `${numberFormat.format(bytes / 1024 ** 2)} Mo`;
  }
  return `${numberFormat.format(bytes / 1024 ** 3)} Go`;
}

function title(job: DownloadJob) {
  const photos = `${job.total} photo${job.total > 1 ? 's' : ''}`;
  switch (job.status) {
    case 'running':
      return `Téléchargement de ${photos}`;
    case 'done':
      return `${photos} téléchargée${job.total > 1 ? 's' : ''}`;
    case 'cancelled':
      return 'Téléchargement annulé';
    case 'error':
      return 'Échec du téléchargement';
  }
}

function Toast({ job, downloads }: { job: DownloadJob; downloads: Downloads }) {
  const percent = job.total > 0 ? Math.round((job.done / job.total) * 100) : 0;
  return (
    <div className={`toast toast-${job.status}`} role="status" aria-live="polite">
      <div className="toast-head">
        <span className="toast-icon" aria-hidden="true">
          {job.status === 'done' ? '✓' : job.status === 'error' ? '!' : job.status === 'cancelled' ? '✕' : '↓'}
        </span>
        <span className="toast-title">{title(job)}</span>
        {job.status === 'running' ? (
          <button type="button" className="toast-button" onClick={() => downloads.cancel(job.id)}>
            Annuler
          </button>
        ) : (
          <button
            type="button"
            className="toast-close"
            onClick={() => downloads.dismiss(job.id)}
            aria-label="Fermer la notification"
          >
            ✕
          </button>
        )}
      </div>
      {job.status === 'error' ? (
        <p className="toast-detail">{job.error}</p>
      ) : (
        <>
          <div
            className="toast-progress"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
          >
            <div style={{ width: `${job.status === 'done' ? 100 : percent}%` }} />
          </div>
          <p className="toast-detail">
            {job.status === 'running' && job.done === job.total && job.total > 0
              ? `Création du zip… · ${formatBytes(job.bytes)}`
              : `${job.done} / ${job.total} fichiers · ${formatBytes(job.bytes)}`}
          </p>
        </>
      )}
    </div>
  );
}

/** Bottom-left notifications, one per zip download. */
export function DownloadToasts({ downloads }: { downloads: Downloads }) {
  const jobs = useSyncExternalStore(downloads.subscribe, downloads.getSnapshot);
  if (jobs.length === 0) {
    return null;
  }
  return (
    <div className="toasts">
      {jobs.map((job) => (
        <Toast key={job.id} job={job} downloads={downloads} />
      ))}
    </div>
  );
}
