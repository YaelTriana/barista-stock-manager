---
name: barista-ui
description: >
  Usar cuando el agente trabaja en componentes React (InventoryList, ReportsList,
  MainLayout, SecurityGate), estilos Tailwind v4, variables de tema en index.css,
  o cualquier decisión de diseño visual. Incluye especificaciones exactas de
  paleta, tipografía, tamaños táctiles y comportamiento de tarjetas.
  No usar para lógica de store, cifrado o configuración de build.
---

# Barista UI Skill

## Regla crítica: Tailwind v4 CSS-first

**NO existe `tailwind.config.js` en este proyecto.** Tailwind v4 usa `@theme {}` en CSS.

```css
/* src/index.css — estructura obligatoria */
@import "tailwindcss";

@theme {
  --font-sans: 'Inter', sans-serif;
  --font-serif: 'Merriweather', serif;

  /* Colores como custom properties de Tailwind v4 */
  --color-bg-cream:     #FDFBF7;
  --color-wood-light:   #EBE1D5;
  --color-wood-medium:  #C8A98B;
  --color-coffee-brown: #5C3D2E;
  --color-coffee-dark:  #382218;
  --color-text-muted:   #8A7363;
  --color-accent-red:   #D9534F;
  --color-accent-green: #6B8E23;
  --color-card-alert-bg:     #FFF9F8;
  --color-card-alert-border: #F8D7D6;
  --color-card-alert-body:   #F8D7D6;
}

body {
  font-family: theme('fontFamily.sans');
  background-color: theme('colors.bg-cream');
  color: theme('colors.coffee-dark');
  -webkit-tap-highlight-color: transparent;
  padding-bottom: 80px; /* espacio para bottom nav */
}

h1, h2, h3 { font-family: theme('fontFamily.serif'); }
```

En componentes Tailwind v4 usar: `bg-[#FDFBF7]` o `bg-bg-cream` (si el token está en @theme).

---

## Navegación por estado (sin react-router-dom)

```typescript
// activeTab vive en el store, no en el router
type Tab = 'stock' | 'entradas' | 'reportes'

// MainLayout renderiza condicionalmente:
{activeTab === 'stock' && <InventoryList />}
{activeTab === 'entradas' && <EntradasView />}
{activeTab === 'reportes' && <ReportsList />}
```

---

## Especificaciones de componentes

### Bottom Navigation (`MainLayout.tsx`)

```
Tabs y sus iconos lucide-react:
  STOCK     → Coffee
  ENTRADAS  → PackagePlus
  REPORTES  → BarChart2

Estilos:
  position: fixed, bottom: 0, width: 100%
  background: rgba(255,255,255,0.95) + backdrop-filter: blur(10px)
  border-top: 1px solid var(--color-wood-light)
  padding-bottom: calc(12px + env(safe-area-inset-bottom))  ← iOS Safari safe area
  z-index: 100

Tab activo:  color coffee-brown + punto indicador 4×4px debajo del icono
Tab inactivo: color wood-medium
Área táctil por tab: mínimo 80px ancho × 56px alto
Font: 0.7rem, font-weight 600, letter-spacing 0.3px
```

### Tarjeta de producto — estado saludable

```
Contenedor:
  background: #FFFFFF
  border: 1px solid var(--color-wood-light)
  border-radius: 20px
  padding: 16px
  box-shadow: 0 2px 8px rgba(200,169,139,0.1)
  gap: 12px

Área interna de stock:
  background: var(--color-wood-light)
  border-radius: 12px
  padding: 8px 12px

Cantidad: font-size 1.5rem, font-weight 700, color coffee-dark
Unidad: color text-muted, font-weight 500
Botón −: background wood-medium, color coffee-dark
Botón +: background coffee-brown, shadow 0 4px 8px rgba(92,61,46,0.2), texto blanco
Botones: mínimo 48×48px (WCAG 2.5.5), border-radius 12px
```

### Tarjeta de producto — bajo stock (`currentStock <= minStock`)

```
Contenedor:
  background: #FFF9F8
  border: 1px solid #F8D7D6

Área interna de stock:
  background: #F8D7D6

Badge "BAJO STOCK":
  background: #FDE8E7, color accent-red
  border-radius: 8px, padding: 4px 8px
  font-size: 0.75rem, font-weight 600
  Icono: AlertCircle de lucide-react (14×14px)

Cantidad: color accent-red
Botón −: background #E2B2B1, color coffee-brown
```

### Search bar

```
padding: 14px 16px 14px 44px
border-radius: 16px
border: 1px solid var(--color-wood-medium)
background: rgba(255,255,255,0.8)
Icono Search (lucide) posición absoluta, left: 14px, color text-muted
Focus: border-color coffee-brown + box-shadow 0 0 0 3px rgba(92,61,46,0.1)
```

### Header de pantalla

```
Ícono en caja:
  background: coffee-brown
  border-radius: 14px
  padding: 10px
  box-shadow: 0 4px 12px rgba(92,61,46,0.15)
  Icono Coffee (lucide), 24×24px, color crema

Título h1: Merriweather, 1.5rem, color coffee-dark
```

---

## Comportamientos de InventoryList

- Búsqueda con debounce 200ms usando `useRef` + `setTimeout` (sin librerías)
- Botón `+ Nuevo` abre `<dialog>` nativo con `ref.current.showModal()`
- Ordenar: productos con bajo stock primero
- Al presionar `−`: verificar antes de despachar. Si stock resultante < 0 → toast de error
- Feedback háptico: `navigator.vibrate?.(10)` (optional chaining, falla silenciosamente)
- Toast de error: estado local en MainLayout, sin librería externa

## Comportamientos de ReportsList

- Selector de mes: `<input type="month">` nativo, default = mes actual `new Date().toISOString().slice(0, 7)`
- Tarjeta CONSUMO: `TrendingDown` (lucide), color accent-red
- Tarjeta INVERSIÓN: `TrendingUp` (lucide), color accent-green
- Formato moneda: `new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' })`
- Formato fecha: `new Intl.DateTimeFormat('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })`
- Lista > 50 items: paginación con botón "Cargar más" (sin virtualización)

---

## Do not use this skill when

- El agente trabaja en `src/lib/crypto.ts` o `src/lib/encryptedStorage.ts`
- El agente trabaja en `src/store/useInventoryStore.ts`
- El agente trabaja en `vite.config.ts` o `Dockerfile*`
