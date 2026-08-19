import { resolve } from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiTarget = env.FUNDLY_API_URL ?? 'http://127.0.0.1:8787';
  const rootDir = import.meta.dirname;

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': resolve(rootDir, './src'),
      },
    },
    build: {
      outDir: '../worker/static',
      emptyOutDir: true,
    },
    server: {
      port: 7044,
      allowedHosts: ['fundly.dev.hexly.ai'],
      proxy: {
        '/api': {
          target: apiTarget,
          changeOrigin: true,
        },
      },
    },
  };
});
