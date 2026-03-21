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

**NO existe `tailwind.config.js` en este proyecto.**

```css
/* src/index.css — estructura completa */
@import "tailwindcss";

@theme {
  --font-sans:  'Inter', sans-serif;
  --font-serif: 'Merriweather', serif;

  --color-bg-cream:          #FDFBF7;
  --color-wood-light:        #EBE1D5;
  --color-wood-medium:       #C8A98B;
  --color-coffee-brown:      #5C3D2E;
  --color-coffee-dark:       #382218;
  --color-text-muted:        #8A7363;
  --color-accent-red:        #D9534F;
  --color-accent-green:      #6B8E23;
  --color-card-alert-bg:     #FFF9F8;
  --color-card-alert-border: #F8D7D6;
  --color-card-alert-body:   #F8D7D6;
}

body {
  font-family: theme('fontFamily.sans');
  background-color: #FDFBF7;
  color: #382218;
  -webkit-tap-highlight-color: transparent;
  padding-bottom: 80px;
}

h1, h2, h3 { font-family: theme('fontFamily.serif'); }
```

---

## Navegación por estado (sin react-router-dom)

```typescript
// activeTab vive en useInventoryStore
type Tab = 'stock' | 'entradas' | 'reportes'

// MainLayout renderiza condicionalmente:
{activeTab === 'stock'    && <InventoryList />}
{activeTab === 'entradas' && <EntradasView />}
{activeTab === 'reportes' && <ReportsList />}
```

---

## Nuevo en v4: `SyncIndicator.tsx`

Componente que muestra el estado de conexión y sync en la esquina superior derecha.

```
Sin conexión:  punto rojo parpadeante + "Sin conexión"
Sincronizando: spinner pequeño + "Sincronizando..."
Sincronizado:  punto verde + "Sincronizado" (desaparece a los 3s)
```

```typescript
// Lee del store:
const { isOnline, isSyncing } = useInventoryStore()

// Posición: fixed top-4 right-4 (sobre el contenido, bajo el nav si hay uno arriba)
// Estilo: pill pequeña, fondo rgba(255,255,255,0.9), backdrop-blur, border wood-light
// Font: 0.7rem, Inter 500
```

---

## Bottom Navigation (`MainLayout.tsx`)

```
Tabs con iconos lucide-react:
  STOCK     → Coffee
  ENTRADAS  → PackagePlus
  REPORTES  → BarChart2

Estilos:
  position: fixed, bottom: 0, width: 100%
  background: rgba(255,255,255,0.95) + backdrop-filter: blur(10px)
  border-top: 1px solid #EBE1D5
  padding-bottom: calc(12px + env(safe-area-inset-bottom))
  z-index: 100

Tab activo:  color #5C3D2E + punto indicador 4×4px debajo del icono
Tab inactivo: color #C8A98B
Área táctil: mínimo 80px ancho × 56px alto
Font: 0.7rem, font-weight 600, letter-spacing 0.3px
```

---

## Tarjeta de producto — estado saludable

```
Contenedor:
  background: #FFFFFF
  border: 1px solid #EBE1D5
  border-radius: 20px, padding: 16px
  box-shadow: 0 2px 8px rgba(200,169,139,0.1)

Área interna de stock:
  background: #EBE1D5, border-radius: 12px, padding: 8px 12px

Cantidad: font-size 1.5rem, font-weight 700, color #382218
Botón −: background #C8A98B, color #382218, mínimo 48×48px
Botón +: background #5C3D2E, texto blanco, shadow 0 4px 8px rgba(92,61,46,0.2)
```

## Tarjeta de producto — bajo stock (`currentStock <= minStock`)

```
Contenedor: background #FFF9F8, border 1px solid #F8D7D6
Área stock: background #F8D7D6
Badge "BAJO STOCK": background #FDE8E7, color #D9534F, border-radius 8px
Icono: AlertCircle lucide 14×14px
Cantidad: color #D9534F
Botón −: background #E2B2B1, color #5C3D2E
```

## Comportamientos de InventoryList

- Búsqueda: debounce 200ms con `useRef` + `setTimeout` (sin librería)
- Botón `+ Nuevo`: `<dialog>` nativo con `ref.current.showModal()`
- Ordenar: bajo stock primero
- Al presionar `−`: verificar stock antes de enviar al store
- Toast error: estado local en MainLayout (`useState<string | null>`)
- Feedback háptico: `navigator.vibrate?.(10)`

## Comportamientos de ReportsList

- Selector: `<input type="month">` nativo, default `new Date().toISOString().slice(0, 7)`
- Tarjeta CONSUMO: `TrendingDown` lucide, color `#D9534F`
- Tarjeta INVERSIÓN: `TrendingUp` lucide, color `#6B8E23`
- Moneda: `new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' })`
- Fecha: `new Intl.DateTimeFormat('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })`
- Lista > 50 items: paginación con "Cargar más"

## Fuentes (en index.html)

```html
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Merriweather:wght@700&display=swap" rel="stylesheet">
```

## Do not use this skill when

- El agente trabaja en src/lib/crypto.ts o encryptedStorage.ts
- El agente trabaja en src/store/ o src/lib/sync.ts
- El agente trabaja en vite.config.ts o Dockerfile
