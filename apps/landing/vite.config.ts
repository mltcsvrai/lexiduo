import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  base: process.env.BASE_URL || '/lexiduo/',
  resolve: {
    alias: {
      '@lexiduo/core': path.resolve(__dirname, '../../packages/core/src/index.ts')
    }
  },
  plugins: [react(), tailwindcss()],
  server: {
    port: 5174
  },
  build: {
    chunkSizeWarningLimit: 800
  }
});
