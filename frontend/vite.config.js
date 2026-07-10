import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    proxy: {
      '/api': 'http://127.0.0.1:8787',
      '/events': { target: 'http://127.0.0.1:8787', ws: false },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
  },
});
