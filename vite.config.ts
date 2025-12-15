import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['kaiku-icon.svg'], 
      manifest: {
        name: 'KAIKU',
        short_name: 'KAIKU',
        description: 'Anonymous Hyperlocal Signal Grid',
        theme_color: '#0a0a12',
        background_color: '#0a0a12',
        display: 'standalone',
        scope: '/',
        start_url: '/',
        orientation: 'portrait',
        icons: [
          {
            src: 'kaiku-icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any maskable'
          }
        ]
      },
      workbox: {
        // Caches these file types for offline use
        globPatterns: ['**/*.{js,css,html,ico,png,svg,json}'],
        // CRITICAL for Vercel/SPA: Redirects navigation to index.html if offline
        navigateFallback: 'index.html',
        // Don't cache API calls or remote images aggressively
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/kaiku_posts'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 300 // 5 minutes
              },
              networkTimeoutSeconds: 3
            }
          }
        ]
      }
    })
  ],
});