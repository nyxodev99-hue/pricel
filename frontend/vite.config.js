import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In dev, `wrangler dev` runs the backend on http://127.0.0.1:8787.
// The proxy lets the frontend call relative /api/* paths in both dev and
// prod (in prod, VITE_API_URL points straight at the deployed Worker).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8787',
        changeOrigin: true,
        ws: true,
      },
    },
  },
});
