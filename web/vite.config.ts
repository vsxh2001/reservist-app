import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    basicSsl(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon-180x180.png', 'icon.svg'],
      devOptions: { enabled: true, type: 'module' },
      manifest: {
        name: 'Reservist · Commander',
        short_name: 'Reservist',
        description: 'Roster, status, and duty slots for IDF reservist commanders (PRD §1).',
        theme_color: '#5A6B3A',
        background_color: '#E8DFC9',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        icons: [
          { src: 'pwa-64x64.png',  sizes: '64x64',  type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Reservist ships small updates often (auto-update worker). Without
        // explicit cleanup Workbox leaves stale precache buckets behind on
        // each deploy, eventually pushing iOS Safari over its quota.
        cleanupOutdatedCaches: true,
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.origin === 'https://fonts.googleapis.com' || url.origin === 'https://fonts.gstatic.com',
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts',
              expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
        ],
      },
    }),
  ],
  server: {
    port: 5174,
    host: true,
    proxy: {
      '/rest':       { target: 'http://127.0.0.1:54321', changeOrigin: true, secure: false },
      '/auth':       { target: 'http://127.0.0.1:54321', changeOrigin: true, secure: false },
      '/storage':    { target: 'http://127.0.0.1:54321', changeOrigin: true, secure: false },
      '/realtime':   { target: 'http://127.0.0.1:54321', changeOrigin: true, secure: false, ws: true },
      '/functions':  { target: 'http://127.0.0.1:54321', changeOrigin: true, secure: false },
    },
  },
  build: {
    // Without manual chunking vite bundles everything into one ~607 KB file.
    // Splitting vendor groups lets the browser cache them independently
    // across deploys (only the app chunk invalidates when our code ships).
    //
    // Vite 8 bundles with Rolldown, whose `manualChunks` only accepts the
    // function form (the Rollup object form throws "manualChunks is not a
    // function"). The id-based function below is equivalent and portable.
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (!id.includes('node_modules')) return;
          if (/[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id)) return 'react';
          if (id.includes('node_modules/@supabase/')) return 'supabase';
          if (id.includes('node_modules/@tanstack/')) return 'query';
        },
      },
    },
  },
});
