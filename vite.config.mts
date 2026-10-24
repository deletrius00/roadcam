import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { handleCamerasRequest } from './server/handler';

/**
 * In production, Vercel serves `api/cameras.ts` as a serverless function.
 * In local development, this plugin runs the exact same handler inside the
 * Vite dev server, so `npm run dev` gives you the whole app with one command.
 */
function devApi(): Plugin {
  return {
    name: 'roadcam-dev-api',
    configureServer(server) {
      server.middlewares.use('/api/cameras', (req, res) => {
        const url = new URL(req.originalUrl ?? req.url ?? '/', 'http://localhost');
        handleCamerasRequest(new Request(url))
          .then(async (response) => {
            res.statusCode = response.status;
            response.headers.forEach((value, key) => res.setHeader(key, value));
            res.end(await response.text());
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
