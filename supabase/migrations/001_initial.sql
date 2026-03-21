-- ============================================================
-- Barista Stock Manager — Schema inicial
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- ============================================================

-- Configuración global (salt y PIN hash)
-- Una sola fila por key. No contiene datos sensibles.
create table if not exists app_config (
  id         uuid primary key default gen_random_uuid(),
  key        text unique not null,
  value      text not null,
  created_at timestamptz default now()
);

-- Productos del inventario
-- encrypted_payload: JSON cifrado con AES-GCM
-- Supabase nunca ve el contenido — solo ciphertext
create table if not exists products (
  id                uuid primary key,
  encrypted_payload text not null,
  updated_at        timestamptz default now(),
  created_at        timestamptz default now()
);

-- Movimientos de inventario
create table if not exists movements (
  id                uuid primary key,
  product_id        uuid references products(id) on delete cascade,
  encrypted_payload text not null,
  updated_at        timestamptz default now(),
  created_at        timestamptz default now()
);

-- Actualizar updated_at automáticamente en cada UPDATE
create or replace function update_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger products_updated_at
  before update on products
  for each row execute function update_updated_at();

create trigger movements_updated_at
  before update on movements
  for each row execute function update_updated_at();

-- Habilitar Realtime para sincronización entre dispositivos
alter publication supabase_realtime add table products;
alter publication supabase_realtime add table movements;

-- Row Level Security (RLS habilitado pero permisivo)
-- La seguridad real está en el cifrado AES-GCM del cliente.
-- Supabase almacena ciphertext — RLS no agrega privacidad adicional aquí.
alter table app_config enable row level security;
alter table products   enable row level security;
alter table movements  enable row level security;

create policy "allow_all_app_config" on app_config for all to anon using (true) with check (true);
create policy "allow_all_products"   on products   for all to anon using (true) with check (true);
create policy "allow_all_movements"  on movements  for all to anon using (true) with check (true);
