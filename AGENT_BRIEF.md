# Barista Stock Manager — Agente Orquestador v4

PWA privada de control de inventario para cafetería con sincronización
en tiempo real entre dispositivos. Datos cifrados end-to-end antes de
llegar al servidor.

---

## Stack completo (versiones fijas, no proponer alternativas)

```
Frontend:   React 19 · TypeScript 5.9 (strict) · Tailwind CSS v4
State:      Zustand 5 · localforage 1.10
Backend:    Supabase JS SDK 2 (@supabase/supabase-js)
Build:      Vite 8 · vite-plugin-pwa 1.2 · @tailwindcss/vite 4.2
Icons:      lucide-react 0.577
Validation: Zod 3 · DOMPurify 3
Deploy:     Vercel (producción) · Docker (desarrollo local)
```

**Instalar dependencias nuevas en v4:**
```bash
npm install @supabase/supabase-js zod dompurify
npm install --save-dev @types/dompurify
```

**Variables de entorno requeridas** (crear `.env.local`):
```
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```

---

## Arquitectura de datos — principio fundamental

**Los datos viajan cifrados.** El servidor (Supabase) almacena ciphertext
AES-GCM. Ni Supabase ni Vercel pueden leer el inventario.

```
Usuario ingresa PIN
  → deriveKey(PIN + salt) → CryptoKey en memoria
  → CryptoKey cifra/descifra datos antes de salir/entrar del dispositivo
  → Supabase solo ve { id, encrypted_payload, updated_at }
```

El salt y el hash del PIN se guardan en Supabase en texto plano
(esto es correcto — el salt no es secreto, el hash no revela el PIN).
Así todos los dispositivos pueden derivar la misma CryptoKey con el mismo PIN.

**Sincronización offline-first:**
```
Sin conexión → Zustand + localforage (datos descifrados en memoria)
Con conexión → sync bidireccional con Supabase
Reconexión   → merge de cambios locales pendientes → Supabase
Realtime     → Supabase WebSocket notifica cambios del otro dispositivo
```

---

## Subagentes y skills

Este agente orquesta 5 subagentes especializados. Cada uno carga su
skill automáticamente según el contexto. El orquestador no genera código
directamente — delega al subagente correcto.

| Subagente | Skill | Se activa cuando |
|-----------|-------|-----------------|
| `security-agent` | `barista-security` | auth, PIN, crypto, Zod, DOMPurify |
| `store-agent` | `barista-store` | Zustand, sync, localforage, estado |
| `supabase-agent` | `barista-supabase` | DB, Realtime, schema, migraciones |
| `ui-agent` | `barista-ui` | componentes React, Tailwind v4, diseño |
| `deploy-agent` | `barista-pwa` | vite.config, PWA, Vercel, Docker |

---

## Fases de implementación (respetar orden)

### Fase 1 — Infraestructura base
**Subagente: supabase-agent**

1. `supabase/migrations/001_initial.sql` — schema completo
2. `src/lib/supabase.ts` — cliente inicializado con variables de entorno
3. `src/lib/crypto.ts` — Web Crypto API (hashPin, deriveKey, encrypt, decrypt)
4. `src/lib/encryptedStorage.ts` — adapter Zustand + localforage + AES-GCM
5. `src/schemas/product.ts` + `src/schemas/movement.ts` — Zod schemas

### Fase 2 — Autenticación multi-dispositivo
**Subagente: security-agent**

6. `src/components/auth/SecurityGate.tsx` — setup, locked, unlocked, locked_out
7. `src/hooks/useSession.ts` — isAuthenticated, logout, sessionExpiresAt
8. `src/hooks/useIdleTimer.ts` — 30min inactividad → logout

### Fase 3 — Store con sincronización
**Subagente: store-agent**

9. `src/store/useInventoryStore.ts` — Zustand 5 + persist cifrado + sync Supabase
10. `src/lib/sync.ts` — cola de cambios pendientes offline + merge al reconectar

### Fase 4 — UI completa
**Subagente: ui-agent**

11. `src/index.css` — tema Tailwind v4 con @theme {}
12. `src/components/layout/MainLayout.tsx` — navbar + toast + sync indicator
13. `src/components/inventory/InventoryList.tsx` — tarjetas, búsqueda, dialog
14. `src/components/reports/ReportsList.tsx` — resúmenes, historial, paginación
15. `src/components/ui/SyncIndicator.tsx` — estado de conexión en tiempo real
16. `src/App.tsx` — composición final con SecurityGate

### Fase 5 — Build y deploy
**Subagente: deploy-agent**

17. `tsconfig.app.json` — strict completo
18. `vite.config.ts` — PWA + host 0.0.0.0 + CSP headers
19. `vercel.json` — headers de seguridad + SPA routing
20. `README.md` — arquitectura, setup Supabase, deploy Vercel, reset PIN

---

## Restricciones absolutas (aplican a todos los subagentes)

- Cero `any` en TypeScript — si no hay tipo, definirlo
- Cero `dangerouslySetInnerHTML`
- Criptografía solo con `window.crypto.subtle` — sin crypto-js ni bcrypt
- Tailwind v4: NO crear `tailwind.config.js` — todo en `@theme {}`
- Iconos solo con `lucide-react`
- Sin `react-router-dom` — navegación por `activeTab` en el store
- `try/catch` en todo `async/await` con `instanceof Error`
- Área táctil mínima 48×48px en todos los controles (WCAG 2.5.5)
- El SW nunca cachea datos del usuario — solo assets estáticos
- Las variables de entorno Supabase van en `.env.local` (en .gitignore)
- Confirmar antes de cualquier operación destructiva en DB

---

## Notas de compatibilidad

- `tailwindcss` plugin va ANTES de `react()` en el array de plugins de Vite
- Zustand 5 usa `create` de `zustand` (no cambió la importación)
- `persist` middleware de Zustand 5: `partialize` excluye UI state del storage
- Supabase Realtime: suscribirse en `useEffect` con cleanup en el return
- Docker: `server.host: '0.0.0.0'` en vite.config.ts es obligatorio para HMR
