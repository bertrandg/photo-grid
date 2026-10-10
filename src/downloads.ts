import type { TimelineApi, TimelineAsset } from './api/types';
import { downloadAsZip, type ZipProgress } from './download';

export interface DownloadJob extends ZipProgress {
  id: number;
  status: 'running' | 'done' | 'error' | 'cancelled';
  error?: string;
}

type Listener = () => void;

/** Running and finished zip downloads, shown as notifications. */
export class Downloads {
  jobs: DownloadJob[] = [];
  private nextId = 1;
  private controllers = new Map<number, AbortController>();
  private listeners = new Set<Listener>();
  private pendingEmit = 0;

  constructor(private readonly api: TimelineApi) {}

  subscribe = (listener: Listener) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = () => this.jobs;

  private update(id: number, patch: Partial<DownloadJob>) {
    this.jobs = this.jobs.map((job) => (job.id === id ? { ...job, ...patch } : job));
    // Byte progress fires per network chunk: notify React at most once per frame.
    if (!this.pendingEmit) {
      this.pendingEmit = requestAnimationFrame(() => {
        this.pendingEmit = 0;
        for (const listener of this.listeners) {
          listener();
        }
      });
    }
  }

  start(assets: TimelineAsset[]) {
    const id = this.nextId++;
    const controller = new AbortController();
    this.controllers.set(id, controller);
    this.jobs = [...this.jobs, { id, status: 'running', done: 0, total: assets.length, bytes: 0 }];
    this.update(id, {});

    downloadAsZip(this.api, assets, (progress) => this.update(id, progress), controller.signal)
      .then(() => {
        this.update(id, { status: 'done' });
        setTimeout(() => this.dismiss(id), 5000);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          this.update(id, { status: 'cancelled' });
          setTimeout(() => this.dismiss(id), 2500);
        } else {
          const reason = error instanceof Error ? error.message : String(error);
          this.update(id, { status: 'error', error: `Impossible de récupérer certaines photos (${reason}).` });
        }
      })
      .finally(() => this.controllers.delete(id));
  }

  cancel(id: number) {
    this.controllers.get(id)?.abort();
  }

  dismiss(id: number) {
    this.cancel(id);
    this.jobs = this.jobs.filter((job) => job.id !== id);
    this.update(id, {});
  }
}
