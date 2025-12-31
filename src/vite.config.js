import { defineConfig } from 'vite';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Read version from version.txt in repo root
const version = readFileSync(resolve(__dirname, '../version.txt'), 'utf-8').trim();

export default defineConfig({
  root: '.',
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(version),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false
  },
  server: {
    port: 3000,
    open: true
  }
});


