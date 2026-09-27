import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  server: {
    port: 3000,
    host: '0.0.0.0',
  },
  plugins: [react(), {
    name: 'practice-dev-csp',
    apply: 'serve',
    transformIndexHtml(html, context) {
      // The production policy stays strict. Vite's development refresh preamble
      // and local HMR WebSocket need these exceptions only in the dev server.
      return context.path === '/practice.html'
        ? html.replace("script-src 'self'; style-src 'self';", "script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline';")
          .replace("connect-src 'none'", "connect-src 'self' ws://localhost:* ws://127.0.0.1:*")
        : html;
    },
  }],
  build: {
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html'),
        practice: path.resolve(__dirname, 'practice.html'),
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    }
  }
});
