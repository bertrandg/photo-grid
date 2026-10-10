import type { TimelineAsset } from '../api/types';

type Listener = () => void;

/** Selected assets, as a tiny external store (useSyncExternalStore), kept apart from the timeline layout. */
export class Selection {
  private assets = new Map<string, TimelineAsset>();
  private version = 0;
  private listeners = new Set<Listener>();

  subscribe = (listener: Listener) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getVersion = () => this.version;

  private emit() {
    this.version++;
    for (const listener of this.listeners) {
      listener();
    }
  }

  get size() {
    return this.assets.size;
  }

  has(id: string) {
    return this.assets.has(id);
  }

  /** Newest first, like the timeline. */
  values() {
    return [...this.assets.values()].sort((a, b) => (a.localDateTime < b.localDateTime ? 1 : -1));
  }

  toggle(asset: TimelineAsset) {
    if (!this.assets.delete(asset.id)) {
      this.assets.set(asset.id, asset);
    }
    this.emit();
  }

  setMany(assets: TimelineAsset[], selected: boolean) {
    for (const asset of assets) {
      if (selected) {
        this.assets.set(asset.id, asset);
      } else {
        this.assets.delete(asset.id);
      }
    }
    this.emit();
  }

  clear() {
    if (this.assets.size > 0) {
      this.assets.clear();
      this.emit();
    }
  }
}
