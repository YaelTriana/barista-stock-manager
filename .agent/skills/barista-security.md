---
name: barista-security
description: >
  Usar cuando el agente trabaja en autenticación PIN, cifrado del store,
  Web Crypto API, Zustand persist, validación con Zod, sanitización con
  DOMPurify, sesión con idle timer, o cualquier módulo en src/lib/ o
  src/components/auth/. No usar para componentes UI puros.
---

# Barista Security Skill

## Modelo de amenazas

1. Acceso físico al dispositivo desbloqueado por persona no autorizada
2. Extensión de navegador maliciosa con acceso a localStorage/IndexedDB
3. Entradas de texto maliciosas en campos libres (XSS stored)
4. Fuerza bruta sobre PIN de 4 dígitos (10,000 combinaciones)

---

## Módulos a implementar

### `src/lib/crypto.ts` — Web Crypto API únicamente

Sin librerías de terceros. Solo `window.crypto.subtle`.

```typescript
// Contratos completos:
export async function hashPin(pin: string): Promise<string>
// SHA-256 del PIN. Retorna hex string.
// Uso: almacenar en localforage key 'bsm_pin_hash'

export async function deriveKey(pin: string, salt: Uint8Array): Promise<CryptoKey>
// PBKDF2 → AES-GCM 256-bit
// iterations: 100_000  ← hace cada intento de fuerza bruta ~100ms
// hash: 'SHA-256'
// La CryptoKey resultante NUNCA se persiste. Solo vive en memoria.

export async function encryptData(data: string, key: CryptoKey): Promise<string>
// AES-GCM con IV aleatorio de 96 bits (12 bytes)
// Retorna JSON string: { iv: base64, data: base64 }
// Generar IV nuevo en CADA llamada con crypto.getRandomValues(new Uint8Array(12))

export async function decryptData(ciphertext: string, key: CryptoKey): Promise<string>
// Parsea el JSON { iv, data }, decodifica base64, descifra con AES-GCM
// Si falla: throw new Error('DECRYPT_FAILED') — nunca silenciar

export function generateSalt(): Uint8Array
// crypto.getRandomValues(new Uint8Array(16))
// Llamar UNA SOLA VEZ en el setup inicial. Persistir en localforage 'bsm_salt'
```

### `src/lib/encryptedStorage.ts` — Adapter Zustand + localforage

```typescript
// Implementar StateStorage de Zustand 5
// Recibe CryptoKey | null — si es null, throw Error('NOT_AUTHENTICATED')
// getItem: localforage.getItem → decryptData → return string
// setItem: encryptData → localforage.setItem
// removeItem: localforage.removeItem
//
// Por qué localforage en vez de localStorage:
// - Usa IndexedDB nativo (no bloquea hilo principal)
// - Maneja buffers binarios correctamente
// - Fallback automático a WebSQL/localStorage
```

### `src/components/auth/SecurityGate.tsx`

Estados: `'setup' | 'locked' | 'unlocked' | 'locked_out'`

**`setup`** — primer uso (no existe 'bsm_pin_hash' en localforage):
- Dos entradas PIN para confirmar
- Al confirmar: `hashPin` → guardar hash, `generateSalt` → guardar salt, `deriveKey` → guardar CryptoKey en memoria, transicionar a `'unlocked'`

**`locked`**:
- Numpad 3×4 (1-9, luego 0 centrado)
- Cada botón: mínimo 64×64px, `border-radius: 16px`
- Puntos de progreso (● ● ● ●)
- Al completar 4 dígitos: verificar hash automáticamente
- Si PIN correcto: `deriveKey(pin, salt)` → guardar CryptoKey en memoria → `'unlocked'`
- Si PIN incorrecto: incrementar contador → mostrar "X intentos restantes"
- Input type="password" para que el SO no sugiera autocompletado

**Lockout progresivo**:
```typescript
const LOCKOUT_DELAYS = [0, 0, 0, 0, 0, 30_000, 60_000, 120_000] // ms por intento
// Contador en sessionStorage (se resetea al cerrar navegador)
// Penalidad acumulada en localforage 'bsm_lockout_level'
```

**`locked_out`**:
- Countdown en tiempo real con `useEffect` + `setInterval`
- Al expirar → `'locked'`, limpiar CryptoKey de memoria

**`unlocked`**:
- Renderizar `{children}`
- Iniciar `useIdleTimer` (30min → `'locked'`, limpiar CryptoKey)

### `src/hooks/useSession.ts`

```typescript
export function useSession(): {
  isAuthenticated: boolean
  logout: () => void
  sessionExpiresAt: Date | null
}
```

### `src/schemas/` — Zod primero, TypeScript inferido

```typescript
// product.ts
export const ProductSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100),
  category: z.string().min(1).max(50),
  currentStock: z.number().nonnegative(),
  minStock: z.number().nonnegative(),
  unit: z.string().min(1).max(20),
  unitPriceCost: z.number().nonnegative(),
  createdAt: z.string().datetime(),
})
export type Product = z.infer<typeof ProductSchema>

// movement.ts
export const MovementSchema = z.object({
  id: z.string().uuid(),
  productId: z.string().uuid(),
  type: z.enum(['IN', 'OUT', 'WASTE']),
  quantity: z.number().positive(),
  timestamp: z.string().datetime(),
  note: z.string().max(255).optional(),
  costTotal: z.number().nonnegative(),
})
export type Movement = z.infer<typeof MovementSchema>
```

### `src/store/useInventoryStore.ts` — Zustand 5

```typescript
// Acciones con validación obligatoria:

addProduct(data: Omit<Product, 'id' | 'createdAt'>):
  1. DOMPurify.sanitize(name, { ALLOWED_TAGS: [] })
  2. DOMPurify.sanitize(category, { ALLOWED_TAGS: [] })
  3. ProductSchema.parse({ ...data, id: crypto.randomUUID(), createdAt: new Date().toISOString() })
  4. Mutar estado

recordMovement(data: Omit<Movement, 'id' | 'timestamp' | 'costTotal'>):
  1. Si note: DOMPurify.sanitize(note, { ALLOWED_TAGS: [] })
  2. Para OUT/WASTE: verificar currentStock - quantity >= 0
     → Si no: throw new Error(`Stock insuficiente: quedarían ${currentStock - quantity} ${unit}`)
  3. costTotal = quantity * product.unitPriceCost
  4. MovementSchema.parse({ ...data, id: crypto.randomUUID(), timestamp: new Date().toISOString(), costTotal })
  5. Actualizar product.currentStock atómicamente en el mismo dispatch

deleteProduct(id: string):
  → Solo si no hay movimientos en las últimas 24h para ese producto

// persist: solo products y movements (excluir UI state con partialize)
// storage: encryptedStorage adapter
```

---

## Comentarios obligatorios en el código

Incluir en los bloques criptográficos:
- Por qué PBKDF2 con 100,000 iteraciones (costo de fuerza bruta)
- Por qué AES-GCM vs otras variantes (autenticado, detecta tampering)
- Por qué IV nuevo en cada escritura (evita ataques de nonce reuse)
- Por qué CryptoKey nunca se persiste (no serializable, solo en memoria)

---

## Safety

Este skill propone código que escribe en IndexedDB. Antes de ejecutar `localforage.clear()` o
cualquier operación destructiva, el agente DEBE solicitar confirmación explícita al usuario.
Nunca ejecutar reseteo de datos sin confirmación.
