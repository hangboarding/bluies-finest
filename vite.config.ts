import { defineConfig, type Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

/** With real backend keys the app loads the Supabase chunk as soon as it starts (src/lib/state.ts imports it
 *  dynamically only so demo builds can leave it out). Tell the browser to fetch it alongside the main bundle
 *  instead of after it, saving a round trip on a cold load. Demo builds have no such chunk, so nothing is added. */
function preloadBackend(): Plugin {
  let base = '/';
  return {
    name: 'preload-backend',
    apply: 'build',
    configResolved(c) { base = c.base; },
    transformIndexHtml: {
      order: 'post',
      handler(_html, ctx) {
        const chunk = Object.values(ctx.bundle ?? {}).find(c => c.type === 'chunk' && c.name === 'supabase-store');
        return chunk ? [{ tag: 'link', attrs: { rel: 'modulepreload', crossorigin: true, href: base + chunk.fileName }, injectTo: 'head' }] : [];
      },
    },
  };
}

// BASE_PATH is set by the GitHub Pages workflow to "/<repo-name>/".
export default defineConfig({
  base: process.env.BASE_PATH || '/',
  plugins: [
    preloadBackend(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['favicon.ico', 'apple-touch-icon-180x180.png', 'logo.svg'],
      manifest: {
        name: 'Bluies Finest',
        short_name: 'Bluies Finest',
        description: 'Hangboard accountability and bragging rights.',
        theme_color: '#0f1419',
        background_color: '#0f1419',
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,webp,ico,woff2}'],
        importScripts: ['push-sw.js'],
        navigateFallbackDenylist: [/^\/auth/, /\/tour\//],
        globIgnores: ['**/tour/**', '**/og-image.png'],
        runtimeCaching: [{ urlPattern: /supabase\.co\/storage/, handler: 'CacheFirst', options: { cacheName: 'avatars', cacheableResponse: { statuses: [0, 200] }, expiration: { maxEntries: 100, maxAgeSeconds: 30 * 864e2 } } }],
      },
    }),
  ],
});
