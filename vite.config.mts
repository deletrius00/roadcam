import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { handleCamerasRequest } from './server/handler';
import { handleSpeedTileRequest } from './server/speedTiles';
import { handleTrafficRequest } from './server/traffic';

/**
 * In production, Vercel serves `api/cameras.ts` as a serverless function.
 * In local development, this plugin runs the exact same handler inside the
 * Vite dev server, so `npm run dev` gives you the whole app with one command.
 */
function devApi(): Plugin {
  return {
    name: 'roadcam-dev-api',
    configureServer(server) {
      const routes: Array<[string, (r: Request) => Promise<Response>]> = [
        ['/api/cameras', (r) => handleCamerasRequest(r)],
        ['/api/traffic', (r) => handleTrafficRequest(r)],
        ['/api/speed-tile', (r) => handleSpeedTileRequest(r)],
      ];
      for (const [path, handler] of routes) server.middlewares.use(path, (req, res) => {
        const url = new URL(req.originalUrl ?? req.url ?? '/', 'http://localhost');
        handler(new Request(url))
          .then(async (response) => {
            res.statusCode = response.status;
            response.headers.forEach((value, key) => res.setHeader(key, value));
            // Bytes, not text: /api/speed-tile returns pictures.
            res.end(Buffer.from(await response.arrayBuffer()));
          })
          .catch((error: unknown) => {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: String(error) }));
          });
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), devApi()],
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
