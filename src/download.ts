import { downloadZip } from 'client-zip';
import type { TimelineApi, TimelineAsset } from './api/types';

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
};

function fileName(asset: TimelineAsset, response: Response) {
  const type = response.headers.get('content-type')?.split(';')[0].trim() ?? '';
  const extension = EXTENSIONS[type] ?? (asset.isVideo ? 'mp4' : 'jpg');
  return `${asset.localDateTime.replace('T', '_').replaceAll(':', '-')}_${asset.id}.${extension}`;
}

/** How many files are fetched ahead of the one being written into the zip. */
const PREFETCH = 4;

export interface ZipProgress {
  /** Files fully written into the zip. */
  done: number;
  total: number;
  /** Bytes received so far. */
  bytes: number;
}

/**
 * Builds a zip in the browser (client-zip streams the files in, no server needed)
 * and hands it to the browser as a download.
 */
export async function downloadAsZip(
  api: TimelineApi,
  assets: TimelineAsset[],
  onProgress: (progress: ZipProgress) => void,
  signal?: AbortSignal,
) {
  const downloadable = assets.filter((asset) => api.getDownloadUrl(asset));
  if (downloadable.length === 0) {
    throw new Error('aucun fichier téléchargeable');
  }
  const progress: ZipProgress = { done: 0, total: downloadable.length, bytes: 0 };
  onProgress({ ...progress });

  const fetches: Promise<Response>[] = [];
  const startFetch = (index: number) => {
    if (index < downloadable.length && !fetches[index]) {
      fetches[index] = fetch(api.getDownloadUrl(downloadable[index])!, { signal }).then((response) => {
        if (!response.ok) {
          throw new Error(`${response.status} ${response.statusText}`);
        }
        return response;
      });
      // Avoid unhandled rejections for prefetched files if we stop early.
      fetches[index].catch(() => undefined);
    }
  };

  // Counts bytes as client-zip reads each file.
  const counted = (response: Response) =>
    response.body!.pipeThrough(
      new TransformStream<Uint8Array, Uint8Array>({
        transform(chunk, controller) {
          progress.bytes += chunk.byteLength;
          onProgress({ ...progress });
          controller.enqueue(chunk);
        },
      }),
    );

  async function* files() {
    for (let i = 0; i < downloadable.length; i++) {
      signal?.throwIfAborted();
      for (let ahead = i; ahead <= i + PREFETCH; ahead++) {
        startFetch(ahead);
      }
      const response = await fetches[i];
      const asset = downloadable[i];
      yield {
        name: fileName(asset, response),
        lastModified: new Date(`${asset.localDateTime}Z`),
        input: counted(response),
      };
      progress.done = i + 1;
      onProgress({ ...progress });
    }
  }

  const blob = await downloadZip(files()).blob();
  signal?.throwIfAborted();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `photos-${new Date().toISOString().slice(0, 10)}.zip`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
