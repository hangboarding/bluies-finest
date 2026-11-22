import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// BASE_PATH is set by the GitHub Pages workflow to "/<repo-name>/".
export default defineConfig({
  base: process.env.BASE_PATH || '/',
  plugins: [
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['favicon.ico', 'apple-touch-icon-180x180.png', 'logo.svg'],
      manifest: {
        name: 'Bluies Finest',
        short_name: 'Bluies',
        description: 'Hangboard accountability and bragging rights.',
        theme_color: '#0d1511',
        background_color: '#0d1511',
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
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        importScripts: ['push-sw.js'],
        navigateFallbackDenylist: [/^\/auth/, /\/tour\//],
        globIgnores: ['**/tour/**', '**/og-image.png'],
        runtimeCaching: [{ urlPattern: /supabase\.co\/storage/, handler: 'CacheFirst', options: { cacheName: 'avatars', cacheableResponse: { statuses: [0, 200] }, expiration: { maxEntries: 100, maxAgeSeconds: 30 * 864e2 } } }],
      },
    }),
  ],
});
