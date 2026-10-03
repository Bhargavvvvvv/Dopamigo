import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { randomBytes } from 'node:crypto';
const nonce = randomBytes(16).toString('base64');
export default defineConfig({
  root: 'apps/desktop/renderer', base: './', plugins: [react(), { name: 'development-csp', apply: 'serve', transformIndexHtml: { order: 'post', handler: html => html.replace("script-src 'self'", `script-src 'self' 'nonce-${nonce}'`) } }],
  html: { cspNonce: nonce },
  build: { outDir: '../../../dist/renderer', emptyOutDir: true },
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
});
