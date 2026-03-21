---
name: barista-pwa
description: >
  Usar cuando el agente trabaja en vite.config.ts, configuración de
  vite-plugin-pwa, manifest.webmanifest, service worker, workbox,
  estrategias de caché, o headers de Content-Security-Policy.
  No usar para componentes React o lógica de store.
---

# Barista PWA Skill

## vite.config.ts — configuración completa

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    tailwindcss(), // DEBE ir primero (antes de react)
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png'],
      manifest: {
        name: 'Gestión Interna de Café',
        short_name: 'CaféPOS',
        description: 'Gestión de inventario privada para cafetería',
        theme_color: '#5C3D2E',        // coffee-brown
        background_color: '#FDFBF7',   // bg-cream
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          {
            src: '/icons/icon-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: '/icons/icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      },
      workbox: {
        // Solo cachear assets del shell estático
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        // SEGURIDAD: datos del usuario nunca en SW cache
        navigateFallbackDenylist: [/^\/api/],
        runtimeCaching: [
          {
            // Google Fonts CSS
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365
              },
              cacheableResponse: { statuses: [0, 200] }
            }
          },
          {
            // Google Fonts archivos (woff2)
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'gstatic-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365
              },
              cacheableResponse: { statuses: [0, 200] }
            }
          }
        ]
      },
      // No habilitar SW en dev para no interferir con HMR
      devOptions: { enabled: false }
    })
  ],

  server: {
    host: '0.0.0.0', // REQUERIDO para Docker — no eliminar
    port: 5173,
    headers: {
      // CSP alineada con nginx.conf para paridad dev/prod
      'Content-Security-Policy':
        "default-src 'self'; " +
        "script-src 'self'; " +
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
        "font-src 'self' https://fonts.gstatic.com; " +
        "img-src 'self' data: blob:; " +
        "connect-src 'self'; " +
        "worker-src 'self' blob:;",
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'no-referrer'
    }
  }
})
```

## Reglas críticas del Service Worker

**El SW NUNCA debe cachear datos de usuario.** Los datos viven en IndexedDB
(via localforage) y el SW no tiene acceso a IndexedDB por diseño.
Lo que sí se cachea: JS, CSS, HTML, íconos, fuentes — el shell estático.

**El SW (sw.js) nunca se cachea en el browser.** Si el browser cachea sw.js,
`autoUpdate` deja de funcionar. El header `Cache-Control: no-store` en nginx.conf
ya lo garantiza en producción.

## Versiones del stack de build

```
vite: ^8.0.0
vite-plugin-pwa: ^1.2.0
@tailwindcss/vite: ^4.2.1
@vitejs/plugin-react: ^6.0.0
```

## Do not use this skill when

- El agente trabaja en componentes React (`src/components/`)
- El agente trabaja en `src/lib/crypto.ts` o el store
- El agente trabaja en `Dockerfile*` o `docker-compose.yml`
