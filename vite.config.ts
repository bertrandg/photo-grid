import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { MockApi } from './src/api/mock-api';

/**
 * Turns the generated demo library into static JSON files shaped like Immich's API:
 *   data/buckets.json            (months + counts)
 *   data/bucket/YYYY-MM-01.json  (assets of one month, columnar)
 * `npm run dev` serves them on the fly, `npm run build` writes them to dist/.
 */
function mockData(): Plugin {
  const api = new MockApi();
  const file = (path: string): string | undefined => {
    if (path === 'buckets.json') {
      return JSON.stringify(api.generateBuckets());
    }
    const match = /^bucket\/(\d{4}-\d{2}-01)\.json$/.exec(path);
    if (match && api.generateBuckets().some((bucket) => bucket.timeBucket === match[1])) {
      return JSON.stringify(api.generateBucket(match[1]));
    }
    return undefined;
  };

  return {
    name: 'mock-data',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = req.url?.split('?')[0].match(/^\/data\/(.+)$/)?.[1];
        const body = path && file(path);
        if (!body) {
          next();
          return;
        }
        res.setHeader('Content-Type', 'application/json');
        res.end(body);
      });
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'data/buckets.json', source: file('buckets.json')! });
      for (const { timeBucket } of api.generateBuckets()) {
        const fileName = `bucket/${timeBucket}.json`;
        this.emitFile({ type: 'asset', fileName: `data/${fileName}`, source: file(fileName)! });
      }
    },
  };
}

// Optional: browse a real Immich library.
// IMMICH_URL / IMMICH_API_KEY are read server-side only (no VITE_ prefix), the dev
// server proxies `/immich/*` to Immich and injects the API key, so the key never
// reaches the browser and <img> tags can load thumbnails without custom headers.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const immichUrl = env.IMMICH_URL;

  return {
    // Relative asset paths: works at the root and under https://<user>.github.io/<repo>/.
    base: './',
    plugins: [react(), mockData()],
    server: {
      proxy: immichUrl
        ? {
            '/immich': {
              target: immichUrl,
              changeOrigin: true,
              rewrite: (path) => path.replace(/^\/immich/, ''),
              headers: { 'x-api-key': env.IMMICH_API_KEY ?? '' },
            },
          }
        : undefined,
    },
  };
});
