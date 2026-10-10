import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

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
    plugins: [react()],
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
