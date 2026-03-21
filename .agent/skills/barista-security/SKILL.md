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
5. Acceso directo a Supabase DB — solo ve ciphertext, nunca plaintext

---

## `src/lib/crypto.ts` — Web Crypto API únicamente

```typescript
// Sin librerías de terceros. Solo window.crypto.subtle.

// SHA-256 del PIN → hex string
// Almacenar en Supabase app_config key='pin_hash'
export async function hashPin(pin: string): Promise<string> {
  const encoded = new TextEncoder().encode(pin)
  const buffer  = await crypto.subtle.digest('SHA-256', encoded)
  return Array.from(new Uint8Array(buffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

// PBKDF2 → CryptoKey AES-GCM 256-bit
// 100_000 iteraciones: cada intento de fuerza bruta cuesta ~100ms
// La CryptoKey NUNCA se persiste — solo vive en memoria de la sesión
export async function deriveKey(pin: string, saltB64: string): Promise<CryptoKey> {
  const salt    = base64ToUint8Array(saltB64)
  const keyMat  = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(pin),
    'PBKDF2', false, ['deriveKey']
  )
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 100_000, hash: 'SHA-256' },
    keyMat,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
}

// AES-GCM con IV aleatorio nuevo en CADA llamada
// Retorna JSON string: { iv: base64, data: base64 }
// IV nuevo por escritura previene ataques de nonce reuse
export async function encryptData(plaintext: string, key: CryptoKey): Promise<string> {
  const iv        = crypto.getRandomValues(new Uint8Array(12))
  const encoded   = new TextEncoder().encode(plaintext)
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv }, key, encoded
  )
  return JSON.stringify({
    iv:   uint8ArrayToBase64(iv),
    data: uint8ArrayToBase64(new Uint8Array(encrypted)),
  })
}

// Descifra el JSON { iv, data }
// Si falla: throw new Error('DECRYPT_FAILED') — nunca silenciar
export async function decryptData(ciphertext: string, key: CryptoKey): Promise<string> {
  try {
    const { iv, data } = JSON.parse(ciphertext) as { iv: string; data: string }
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: base64ToUint8Array(iv) },
      key,
      base64ToUint8Array(data)
    )
    return new TextDecoder().decode(decrypted)
  } catch {
    throw new Error('DECRYPT_FAILED')
  }
}

// Genera salt de 16 bytes → base64
// Llamar UNA SOLA VEZ en el setup. Guardar en Supabase app_config key='salt'.
// El salt no es secreto — puede estar en Supabase sin cifrar.
export function generateSalt(): string {
  return uint8ArrayToBase64(crypto.getRandomValues(new Uint8Array(16)))
}

// Helpers base64
function uint8ArrayToBase64(arr: Uint8Array): string {
  return btoa(String.fromCharCode(...arr))
}
function base64ToUint8Array(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), c => c.charCodeAt(0))
}
```

---

## `src/components/auth/SecurityGate.tsx` — multi-dispositivo

**Cambio clave vs v3:** El salt y PIN hash vienen de Supabase, no de localforage local.
Esto permite que cualquier dispositivo con el PIN correcto derive la misma CryptoKey.

**Estados:** `'loading' | 'setup' | 'locked' | 'unlocked' | 'locked_out' | 'offline_setup'`

**Estado `loading`** (arranque):
```
1. Intentar loadAuthConfig() de Supabase
2a. Si hay config → estado 'locked'
2b. Si no hay config y hay conexión → estado 'setup'
2c. Si no hay config y NO hay conexión → estado 'offline_setup'
   (mostrar mensaje: "Conecta a internet para configurar el PIN por primera vez")
```

**Estado `setup`** (primer uso con conexión):
```
1. Dos entradas PIN para confirmar
2. Al confirmar:
   a. generateSalt() → saltB64
   b. hashPin(pin)   → pinHash
   c. saveAuthConfig(pinHash, saltB64) en Supabase
   d. deriveKey(pin, saltB64) → CryptoKey en memoria
   e. syncQueue.setCryptoKey(cryptoKey)
   f. loadFromSupabase(cryptoKey) → cargar datos existentes
   g. subscribeToRealtime(cryptoKey) → iniciar Realtime
   h. estado → 'unlocked'
```

**Estado `locked`**:
```
1. loadAuthConfig() de Supabase (o caché local si offline)
2. Numpad 3×4, botones mínimo 64×64px
3. Puntos de progreso (● ● ● ●)
4. Al completar 4 dígitos:
   a. hashPin(inputPin) === storedHash ?
   b. SÍ → deriveKey(inputPin, salt) → CryptoKey
           syncQueue.setCryptoKey(cryptoKey)
           loadFromSupabase(cryptoKey) si hay conexión
           subscribeToRealtime(cryptoKey)
           estado → 'unlocked'
   c. NO → incrementar intentos → mostrar "X intentos restantes"
```

**Lockout progresivo:**
```typescript
const LOCKOUT_MS = [0, 0, 0, 0, 0, 30_000, 60_000, 120_000]
// Intentos en sessionStorage (resetean al cerrar navegador)
// Nivel de lockout en localforage (persiste entre sesiones)
```

**Estado `unlocked`**:
- Renderizar `{children}`
- Iniciar useIdleTimer (30min → 'locked', limpiar CryptoKey, syncQueue.setCryptoKey(null))

**NUNCA renderizar datos de inventario fuera del estado `'unlocked'`.**

---

## `src/hooks/useIdleTimer.ts`

```typescript
export function useIdleTimer(onIdle: () => void, timeoutMs = 30 * 60 * 1000) {
  useEffect(() => {
    let timer = setTimeout(onIdle, timeoutMs)
    const reset = () => {
      clearTimeout(timer)
      timer = setTimeout(onIdle, timeoutMs)
    }
    const events = ['pointermove', 'keydown', 'touchstart', 'click'] as const
    events.forEach(e => document.addEventListener(e, reset, { passive: true }))
    return () => {
      clearTimeout(timer)
      events.forEach(e => document.removeEventListener(e, reset))
    }
  }, [onIdle, timeoutMs])
}
```

---

## Schemas Zod (`src/schemas/`)

```typescript
// product.ts
export const ProductSchema = z.object({
  id:            z.string().uuid(),
  name:          z.string().min(1).max(100),
  category:      z.string().min(1).max(50),
  currentStock:  z.number().nonnegative(),
  minStock:      z.number().nonnegative(),
  unit:          z.string().min(1).max(20),
  unitPriceCost: z.number().nonnegative(),
  createdAt:     z.string().datetime(),
})
export type Product = z.infer<typeof ProductSchema>

// movement.ts
export const MovementSchema = z.object({
  id:        z.string().uuid(),
  productId: z.string().uuid(),
  type:      z.enum(['IN', 'OUT', 'WASTE']),
  quantity:  z.number().positive(),
  timestamp: z.string().datetime(),
  note:      z.string().max(255).optional(),
  costTotal: z.number().nonnegative(),
})
export type Movement = z.infer<typeof MovementSchema>
```

---

## Por qué cada decisión de seguridad

| Decisión | Razón |
|----------|-------|
| PBKDF2 100k iteraciones | Fuerza bruta de PIN = 10,000 × 100ms = ~17min mínimo |
| AES-GCM (autenticado) | Detecta tampering — si alguien modifica el ciphertext, falla con error |
| IV nuevo por escritura | Sin reutilización de nonce — evita ataques de nonce reuse en AES-GCM |
| CryptoKey no serializable | No puede salir de memoria ni ser copiada por scripts externos |
| Salt en Supabase sin cifrar | El salt no es secreto. Permite sync multi-dispositivo con el mismo PIN |
| Hash del PIN en Supabase | Permite verificar el PIN sin enviarlo por la red |

---

## Do not use this skill when

- El agente trabaja en componentes de UI pura (InventoryList, ReportsList)
- El agente trabaja en el schema SQL
- El agente trabaja en vite.config.ts o Dockerfile
