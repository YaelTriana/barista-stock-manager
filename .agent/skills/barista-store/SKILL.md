---
name: barista-store
description: >
  Usar cuando el agente trabaja en src/store/useInventoryStore.ts,
  src/lib/sync.ts, lógica de sincronización offline/online, cola de
  cambios pendientes, o manejo de estado Zustand 5. No usar para
  componentes React, cifrado, o configuración de Supabase.
---

# Barista Store Skill

## Arquitectura del store — dos capas

```
Capa 1 — Local (siempre disponible, offline-first):
  Zustand (estado en memoria) ←→ localforage (cifrado en disco)

Capa 2 — Remoto (cuando hay conexión):
  Supabase PostgreSQL ←→ Supabase Realtime (WebSockets)
```

El estado local es la fuente de verdad para la UI. La sincronización
con Supabase ocurre en background y nunca bloquea la interfaz.

## `src/store/useInventoryStore.ts`

```typescript
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { Product } from '../schemas/product'
import { Movement } from '../schemas/movement'
import { ProductSchema } from '../schemas/product'
import { MovementSchema } from '../schemas/movement'
import { encryptedStorage } from '../lib/encryptedStorage'
import { syncQueue } from '../lib/sync'
import DOMPurify from 'dompurify'

// Estado completo del store
interface InventoryState {
  // Datos
  products:  Product[]
  movements: Movement[]

  // UI (NO persistido)
  activeTab:   'stock' | 'entradas' | 'reportes'
  isOnline:    boolean
  isSyncing:   boolean
  pendingCount: number  // cambios locales pendientes de sync

  // Acciones de datos
  addProduct:     (data: Omit<Product, 'id' | 'createdAt'>) => void
  updateProduct:  (id: string, data: Partial<Omit<Product, 'id' | 'createdAt'>>) => void
  deleteProduct:  (id: string) => void
  recordMovement: (data: Omit<Movement, 'id' | 'timestamp' | 'costTotal'>) => void

  // Acciones de sync
  setOnline:   (online: boolean) => void
  setSyncing:  (syncing: boolean) => void
  mergeRemoteProducts:  (products: Product[]) => void
  mergeRemoteMovements: (movements: Movement[]) => void

  // UI
  setActiveTab: (tab: 'stock' | 'entradas' | 'reportes') => void
}

export const useInventoryStore = create<InventoryState>()(
  persist(
    (set, get) => ({
      products:     [],
      movements:    [],
      activeTab:    'stock',
      isOnline:     navigator.onLine,
      isSyncing:    false,
      pendingCount: 0,

      addProduct: (data) => {
        // 1. Sanitizar strings
        const sanitized = {
          ...data,
          name:     DOMPurify.sanitize(data.name,     { ALLOWED_TAGS: [] }),
          category: DOMPurify.sanitize(data.category, { ALLOWED_TAGS: [] }),
        }
        // 2. Validar con Zod
        const product = ProductSchema.parse({
          ...sanitized,
          id:        crypto.randomUUID(),
          createdAt: new Date().toISOString(),
        })
        // 3. Mutar estado local
        set(state => ({ products: [...state.products, product] }))
        // 4. Encolar para sync remoto
        syncQueue.enqueue({ type: 'UPSERT_PRODUCT', payload: product })
      },

      updateProduct: (id, data) => {
        set(state => ({
          products: state.products.map(p =>
            p.id === id ? ProductSchema.parse({ ...p, ...data }) : p
          )
        }))
        const updated = get().products.find(p => p.id === id)
        if (updated) syncQueue.enqueue({ type: 'UPSERT_PRODUCT', payload: updated })
      },

      deleteProduct: (id) => {
        // Solo si no hay movimientos en las últimas 24h
        const recentMovements = get().movements.filter(m =>
          m.productId === id &&
          Date.now() - new Date(m.timestamp).getTime() < 24 * 60 * 60 * 1000
        )
        if (recentMovements.length > 0) {
          throw new Error('No se puede eliminar: tiene movimientos en las últimas 24h')
        }
        set(state => ({
          products:  state.products.filter(p => p.id !== id),
          movements: state.movements.filter(m => m.productId !== id),
        }))
        syncQueue.enqueue({ type: 'DELETE_PRODUCT', payload: { id } })
      },

      recordMovement: (data) => {
        const product = get().products.find(p => p.id === data.productId)
        if (!product) throw new Error('Producto no encontrado')

        // Verificar stock no negativo
        if ((data.type === 'OUT' || data.type === 'WASTE') &&
            product.currentStock - data.quantity < 0) {
          throw new Error(
            `Stock insuficiente: disponible ${product.currentStock} ${product.unit}`
          )
        }

        const sanitizedNote = data.note
          ? DOMPurify.sanitize(data.note, { ALLOWED_TAGS: [] })
          : undefined

        const movement = MovementSchema.parse({
          ...data,
          note:      sanitizedNote,
          id:        crypto.randomUUID(),
          timestamp: new Date().toISOString(),
          costTotal: data.quantity * product.unitPriceCost,
        })

        // Actualizar stock y agregar movimiento atómicamente
        const delta = data.type === 'IN' ? data.quantity : -data.quantity
        set(state => ({
          movements: [...state.movements, movement],
          products:  state.products.map(p =>
            p.id === data.productId
              ? { ...p, currentStock: p.currentStock + delta }
              : p
          ),
        }))

        syncQueue.enqueue({ type: 'UPSERT_MOVEMENT', payload: movement })
        syncQueue.enqueue({
          type: 'UPSERT_PRODUCT',
          payload: get().products.find(p => p.id === data.productId)!
        })
      },

      // Merge de datos remotos (sin sobreescribir cambios locales más nuevos)
      mergeRemoteProducts: (remoteProducts) => {
        set(state => {
          const merged = [...state.products]
          for (const remote of remoteProducts) {
            const localIdx = merged.findIndex(p => p.id === remote.id)
            if (localIdx === -1) {
              merged.push(remote)
            } else {
              // El más reciente gana — usar createdAt como desempate
              const local = merged[localIdx]
              if (new Date(remote.createdAt) > new Date(local.createdAt)) {
                merged[localIdx] = remote
              }
            }
          }
          return { products: merged }
        })
      },

      mergeRemoteMovements: (remoteMovements) => {
        set(state => {
          const ids = new Set(state.movements.map(m => m.id))
          const newMovements = remoteMovements.filter(m => !ids.has(m.id))
          return { movements: [...state.movements, ...newMovements] }
        })
      },

      setOnline:    (isOnline)  => set({ isOnline }),
      setSyncing:   (isSyncing) => set({ isSyncing }),
      setActiveTab: (activeTab) => set({ activeTab }),
    }),
    {
      name: 'bsm-store',
      storage: encryptedStorage,
      // NO persistir UI state — solo datos
      partialize: (state) => ({
        products:  state.products,
        movements: state.movements,
      }),
    }
  )
)
```

## `src/lib/sync.ts` — cola de sincronización offline

```typescript
import { supabase } from './supabase'
import { encryptData } from './crypto'
import { useInventoryStore } from '../store/useInventoryStore'

// Tipos de operaciones en cola
type SyncOperation =
  | { type: 'UPSERT_PRODUCT';  payload: Product }
  | { type: 'UPSERT_MOVEMENT'; payload: Movement }
  | { type: 'DELETE_PRODUCT';  payload: { id: string } }

class SyncQueue {
  private queue: SyncOperation[] = []
  private cryptoKey: CryptoKey | null = null
  private processing = false

  setCryptoKey(key: CryptoKey | null) {
    this.cryptoKey = key
    // Si hay operaciones pendientes y ahora tenemos clave, procesar
    if (key && this.queue.length > 0) this.flush()
  }

  enqueue(op: SyncOperation) {
    this.queue.push(op)
    useInventoryStore.getState().setSyncing(true)
    // Solo procesar si hay conexión y clave
    if (navigator.onLine && this.cryptoKey) this.flush()
  }

  async flush() {
    if (this.processing || !this.cryptoKey || !navigator.onLine) return
    this.processing = true

    try {
      while (this.queue.length > 0) {
        const op = this.queue[0]
        await this.processOperation(op)
        this.queue.shift()
      }
    } finally {
      this.processing = false
      useInventoryStore.getState().setSyncing(false)
    }
  }

  private async processOperation(op: SyncOperation) {
    if (!this.cryptoKey) throw new Error('No hay clave de cifrado')

    switch (op.type) {
      case 'UPSERT_PRODUCT': {
        const encrypted = await encryptData(JSON.stringify(op.payload), this.cryptoKey)
        const { error } = await supabase
          .from('products')
          .upsert({ id: op.payload.id, encrypted_payload: encrypted })
        if (error) throw new Error(error.message)
        break
      }
      case 'UPSERT_MOVEMENT': {
        const encrypted = await encryptData(JSON.stringify(op.payload), this.cryptoKey)
        const { error } = await supabase
          .from('movements')
          .upsert({
            id:               op.payload.id,
            product_id:       op.payload.productId,
            encrypted_payload: encrypted,
          })
        if (error) throw new Error(error.message)
        break
      }
      case 'DELETE_PRODUCT': {
        const { error } = await supabase
          .from('products')
          .delete()
          .eq('id', op.payload.id)
        if (error) throw new Error(error.message)
        break
      }
    }
  }
}

export const syncQueue = new SyncQueue()

// Carga inicial desde Supabase (al autenticarse)
export async function loadFromSupabase(cryptoKey: CryptoKey) {
  const { decryptData } = await import('./crypto')
  const store = useInventoryStore.getState()

  // Productos
  const { data: products, error: pErr } = await supabase
    .from('products')
    .select('*')
  if (pErr) throw new Error(pErr.message)

  if (products) {
    const decrypted = await Promise.all(
      products.map(async (row) => {
        const json = await decryptData(row.encrypted_payload, cryptoKey)
        return JSON.parse(json) as Product
      })
    )
    store.mergeRemoteProducts(decrypted)
  }

  // Movimientos
  const { data: movements, error: mErr } = await supabase
    .from('movements')
    .select('*')
  if (mErr) throw new Error(mErr.message)

  if (movements) {
    const decrypted = await Promise.all(
      movements.map(async (row) => {
        const json = await decryptData(row.encrypted_payload, cryptoKey)
        return JSON.parse(json) as Movement
      })
    )
    store.mergeRemoteMovements(decrypted)
  }
}

// Escuchar cambios en tiempo real
export function subscribeToRealtime(cryptoKey: CryptoKey) {
  const { decryptData } = require('./crypto')
  const store = useInventoryStore.getState()

  const channel = supabase
    .channel('inventory-sync')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'products' },
      async (payload) => {
        if (payload.eventType === 'DELETE') {
          store.mergeRemoteProducts([]) // el delete ya se aplicó localmente
          return
        }
        const row = payload.new as DbProduct
        const json = await decryptData(row.encrypted_payload, cryptoKey)
        store.mergeRemoteProducts([JSON.parse(json)])
      }
    )
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'movements' },
      async (payload) => {
        const row = payload.new as DbMovement
        const json = await decryptData(row.encrypted_payload, cryptoKey)
        store.mergeRemoteMovements([JSON.parse(json)])
      }
    )
    .subscribe()

  return () => supabase.removeChannel(channel)
}
```

## Indicador de sincronización (`SyncIndicator`)

El estado `isOnline` e `isSyncing` del store deben mostrarse en la UI.
Ver skill `barista-ui` para el componente `SyncIndicator.tsx`.

## Do not use this skill when

- El agente trabaja en componentes React de UI pura
- El agente trabaja en `src/lib/crypto.ts`
- El agente trabaja en el schema SQL de Supabase
