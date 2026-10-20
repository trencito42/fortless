import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [react(), tailwindcss()],

  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },

  build: {
    chunkSizeWarningLimit: 700,
    outDir: 'dist-react-preview',
    emptyOutDir: true,
  },

  server: {
    host: '127.0.0.1',
    proxy: fortlessProxy(),
  },

  preview: {
    host: '127.0.0.1',
    port: 4173,
    strictPort: true,
    allowedHosts: ['fortless.net', 'www.fortless.net'],
    proxy: fortlessProxy(),
  },
});

function fortlessProxy() {
  const target = process.env['FORTLESS_PREVIEW_BACKEND'] ?? 'http://127.0.0.1:3021';
  const origin = process.env['FORTLESS_PREVIEW_ORIGIN'] ?? 'https://fortless.net';
  const route = {
    target,
    changeOrigin: false,
    // Fastify protects all state-changing auth endpoints with an Origin check.
    // The browser talks to a loopback preview, so present the configured public
    // origin only on the preview-to-backend hop.
    headers: { origin },
  };
  return {
    '/api': route,
    '/login': route,
    '/register': route,
    '/forgot-password': route,
    '/reset-password': route,
    '/verify-email': route,
    '/mfa': route,
    '/oidc': route,
    // Authentication pages are rendered by Fastify and reference these
    // root-relative assets. Keep React's other /assets files served by Vite.
    '/assets/auth-ui.': route,
    '/assets/fortless-icon.': route,
    '/favicon.svg': route,
  };
}
