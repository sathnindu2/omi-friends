import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const clientRoot = fileURLToPath(new URL('.', import.meta.url));
const projectRoot = fileURLToPath(new URL('..', import.meta.url));

export default defineConfig({
  root: clientRoot,
  envDir: projectRoot,
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    host: true, // lets phones on the same Wi-Fi open http://<your-computer-ip>:5173
    fs: { allow: [projectRoot] }, // the client imports ../shared
    proxy: {
      // In development the game server runs on port 3001.
      '/socket.io': { target: 'http://localhost:3001', ws: true },
      '/healthz': 'http://localhost:3001',
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
  },
});
