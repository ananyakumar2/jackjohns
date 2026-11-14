import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: { port: 5173, strictPort: true },
  // three.js is most of the one JS chunk (213 KB gzip); splitting it would only add a request
  build: { target: 'es2022', assetsInlineLimit: 0, chunkSizeWarningLimit: 900 },
});
