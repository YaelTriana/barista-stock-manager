---
name: barista-supabase
description: >
  Usar cuando el agente trabaja en el schema de base de datos, migraciones SQL,
  cliente de Supabase, sincronización Realtime, o cualquier archivo en
  supabase/ o src/lib/supabase.ts. No usar para componentes React,
  lógica de cifrado, o configuración de build.
---

# Barista Supabase Skill

## Schema de base de datos

Crear en `supabase/migrations/001_initial.sql`:

```sql
-- Configuración global de la app (salt, PIN hash)
-- Una sola fila. No contiene datos sensibles.
create table if not exists app_config (
  id          uuid primary key default gen_random_uuid(),
  key         text unique not null,
  value       text not null,
  created_at  timestamptz default now()
);

-- Productos del inventario (payload cifrado)
create table if not exists products (
  id                uuid primary key,
  encrypted_payload text not null,    -- JSON cifrado AES-GCM: { name, category, currentStock, minStock, unit, unitPriceCost }
  updated_at        timestamptz default now(),
  created_at        timestamptz default now()
);

-- Movimientos de inventario (payload cifrado)
create table if not exists movements (
  id                uuid primary key,
  product_id        uuid references products(id) on delete cascade,
  encrypted_payload text not null,    -- JSON cifrado AES-GCM: { type, quantity, note, costTotal }
  updated_at        timestamptz default now(),
  created_at        timestamptz default now()
);

-- Trigger: actualizar updated_at automáticamente
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger products_updated_at
  before update on products
  for each row execute function update_updated_at();

create trigger movements_updated_at
  before update on movements
  for each row execute function update_updated_at();

-- Habilitar Realtime para sync en tiempo real
alter publication supabase_realtime add table products;
alter publication supabase_realtime add table movements;

-- Row Level Security: la app usa anon key, acceso sin restricción
-- (la seguridad está en el cifrado AES-GCM, no en RLS)
alter table app_config enable row level security;
alter table products enable row level security;
alter table movements enable row level security;

create policy "allow_all_app_config" on app_config for all using (true);
create policy "allow_all_products"   on products   for all using (true);
create policy "allow_all_movements"  on movements  for all using (true);
```

> Por qué RLS permisivo: La seguridad no depende de RLS sino del cifrado
> AES-GCM. Supabase solo almacena ciphertext — aunque alguien accediera
> a la DB directamente, no puede leer los datos sin el PIN.

## Cliente Supabase (`src/lib/supabase.ts`)

```typescript
import { createClient } from '@supabase/supabase-js'

const supabaseUrl  = import.meta.env.VITE_SUPABASE_URL
const supabaseKey  = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    'Faltan variables de entorno: VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY'
  )
}

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    // No usamos Supabase Auth — la autenticación es PIN local
    persistSession: false,
    autoRefreshToken: false,
  },
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
})
```

## Tipos de la base de datos

```typescript
// src/types/database.ts
export interface DbProduct {
  id: string
  encrypted_payload: string
  updated_at: string
  created_at: string
}

export interface DbMovement {
  id: string
  product_id: string
  encrypted_payload: string
  updated_at: string
  created_at: string
}

export interface DbAppConfig {
  id: string
  key: string
  value: string
  created_at: string
}
```

## Operaciones de config (salt y PIN hash)

```typescript
// Guardar salt y PIN hash en el setup inicial
async function saveAuthConfig(pinHash: string, salt: string): Promise<void> {
  const { error } = await supabase
    .from('app_config')
    .upsert([
      { key: 'pin_hash', value: pinHash },
      { key: 'salt',     value: salt    },
    ], { onConflict: 'key' })

  if (error) throw new Error(`Config save failed: ${error.message}`)
}

// Leer salt y PIN hash (cualquier dispositivo al arrancar)
async function loadAuthConfig(): Promise<{ pinHash: string; salt: string } | null> {
  const { data, error } = await supabase
    .from('app_config')
    .select('key, value')
    .in('key', ['pin_hash', 'salt'])

  if (error || !data || data.length < 2) return null

  const map = Object.fromEntries(data.map(r => [r.key, r.value]))
  if (!map.pin_hash || !map.salt) return null

  return { pinHash: map.pin_hash, salt: map.salt }
}
```

## Realtime — suscripción a cambios

```typescript
// Suscribir en useEffect del store o componente raíz
// Cleanup obligatorio en el return del useEffect

const channel = supabase
  .channel('inventory-sync')
  .on('postgres_changes', {
    event: '*',           // INSERT, UPDATE, DELETE
    schema: 'public',
    table: 'products',
  }, (payload) => {
    // Descifrar payload y actualizar Zustand
    handleRemoteProductChange(payload)
  })
  .on('postgres_changes', {
    event: '*',
    schema: 'public',
    table: 'movements',
  }, (payload) => {
    handleRemoteMovementChange(payload)
  })
  .subscribe()

// Cleanup
return () => { supabase.removeChannel(channel) }
```

## Variables de entorno requeridas

```bash
# .env.local (nunca commitear — ya está en .gitignore)
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

Obtenerlos en: Supabase Dashboard → Settings → API.

## Setup en Supabase Dashboard

1. Crear proyecto nuevo en supabase.com (tier gratuito)
2. SQL Editor → pegar y ejecutar `supabase/migrations/001_initial.sql`
3. Settings → API → copiar URL y anon key a `.env.local`
4. Realtime → verificar que `products` y `movements` aparecen en la lista

## Do not use this skill when

- El agente trabaja en componentes React (`src/components/`)
- El agente trabaja en `src/lib/crypto.ts` (cifrado AES-GCM)
- El agente trabaja en `Dockerfile*` o `vite.config.ts`
