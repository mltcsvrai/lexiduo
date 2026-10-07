import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';
import { fileURLToPath } from 'url';
import packageJson from './package.json' with { type: 'json' };
import { youtubeDevProxyPlugin } from './vite/youtubeDevProxyPlugin.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@ytceviri/core': path.resolve(__dirname, '../../packages/core/src/index.ts')
    }
  },
  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(packageJson.version)
  },
  plugins: [react(), tailwindcss(), youtubeDevProxyPlugin()]
});
