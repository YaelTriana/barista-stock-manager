---
name: barista-pwa
description: >
  Usar cuando el agente trabaja en vite.config.ts, configuración de
  vite-plugin-pwa, manifest.webmanifest, service worker, workbox,
  vercel.json, o headers de Content-Security-Policy.
  No usar para componentes React o lógica de store.
---

# Barista PWA + Deploy Skill

## Deploy: Vercel (producción) + Docker (desarrollo local)

| Entorno | Comando | URL |
|---------|---------|-----|
| Desarrollo | `docker compose up dev` | http://localhost:5173 |
| Producción | `git push` → Vercel auto-deploy | https://tu-app.vercel.app |

Docker ya NO se usa para producción en v4 — Vercel lo reemplaza.

---

## `vite.config.ts`

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    tailwindcss(), // PRIMERO — antes de react()
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png'],
      manifest: {
        name: 'Gestión Interna de Café',
        short_name: 'CaféPOS',
        description: 'Gestión de inventario privada para cafetería',
        theme_color: '#5C3D2E',
        background_color: '#FDFBF7',
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          { src: '/icons/icon-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }
        ]
      },
      workbox: {
        // Solo assets estáticos del shell — NUNCA datos del usuario
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        navigateFallbackDenylist: [/^\/api/],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: { maxEntries: 10, maxAgeSeconds: 31_536_000 },
              cacheableResponse: { statuses: [0, 200] }
            }
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'gstatic-fonts-cache',
              expiration: { maxEntries: 10, maxAgeSeconds: 31_536_000 },
              cacheableResponse: { statuses: [0, 200] }
            }
          }
        ]
      },
      devOptions: { enabled: false } // NO activar SW en dev
    })
  ],

  server: {
    host: '0.0.0.0', // OBLIGATORIO para Docker HMR
    port: 5173,
    // Headers en desarrollo — Vercel los aplica en producción via vercel.json
    headers: {
      'Content-Security-Policy':
        "default-src 'self'; " +
        "script-src 'self'; " +
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
        "font-src 'self' https://fonts.gstatic.com; " +
        "img-src 'self' data: blob:; " +
        "connect-src 'self' https://*.supabase.co wss://*.supabase.co; " +
        "worker-src 'self' blob:;",
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'no-referrer',
    }
  }
})
```

> CRÍTICO: `connect-src` incluye `https://*.supabase.co` y `wss://*.supabase.co`
> para permitir las llamadas a la API y los WebSockets de Realtime.

---

## `vercel.json`

```json
{
  "rewrites": [
    { "source": "/(.*)", "destination": "/index.html" }
  ],
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        {
          "key": "Content-Security-Policy",
          "value": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self' https://*.supabase.co wss://*.supabase.co; worker-src 'self' blob:;"
        },
        { "key": "X-Content-Type-Options", "value": "nosniff" },
        { "key": "X-Frame-Options",        "value": "DENY" },
        { "key": "Referrer-Policy",        "value": "no-referrer" },
        { "key": "Permissions-Policy",     "value": "geolocation=(), camera=(), microphone=()" }
      ]
    },
    {
      "source": "/sw.js",
      "headers": [
        { "key": "Cache-Control", "value": "no-store, no-cache, must-revalidate" }
      ]
    },
    {
      "source": "/workbox-(.*)",
      "headers": [
        { "key": "Cache-Control", "value": "no-store, no-cache, must-revalidate" }
      ]
    },
    {
      "source": "/(.*)\\.webmanifest",
      "headers": [
        { "key": "Cache-Control", "value": "public, max-age=86400" },
        { "key": "Content-Type", "value": "application/manifest+json" }
      ]
    }
  ]
}
```

## Setup de deploy en Vercel

1. Conectar repo en vercel.com → Import Project
2. Framework preset: Vite (auto-detectado)
3. Environment Variables → agregar:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. Deploy → cada `git push` a `main` redespliega automáticamente

## `.env.local` en .gitignore

```bash
# Verificar que .gitignore incluye:
.env.local
.env*.local
```

Las variables de Supabase NUNCA van al repo. En Vercel se agregan
manualmente desde el dashboard o CLI.

## Do not use this skill when

- El agente trabaja en componentes React (`src/components/`)
- El agente trabaja en `src/lib/crypto.ts` o el store
- El agente trabaja en `Dockerfile*` o `docker-compose.yml`
