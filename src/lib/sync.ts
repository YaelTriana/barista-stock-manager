/**
 * Sync engine for Barista Stock Manager.
 * Manages bidirectional sync between local Zustand store and Supabase.
 * All data is encrypted before upload and decrypted after download.
 */

import { supabase } from './supabase';
import { encrypt, decrypt } from './crypto';
import type { Product } from '../schemas/product';
import type { Movement } from '../schemas/movement';
import type { RealtimeChannel } from '@supabase/supabase-js';

/** Pending change for offline queue */
interface PendingChange {
  id: string;
  table: 'products' | 'movements';
  action: 'upsert' | 'delete';
  data: Product | Movement | null;
  timestamp: number;
}

/** Get the CryptoKey from the encrypted storage module */
let _syncKey: CryptoKey | null = null;

export function setSyncKey(key: CryptoKey): void {
  _syncKey = key;
}

export function clearSyncKey(): void {
  _syncKey = null;
}

// ─── PUSH (local → Supabase) ───

/** Encrypt and upsert a single product to Supabase */
export async function pushProduct(product: Product): Promise<void> {
  if (!_syncKey) return;

  try {
    const payload = await encrypt(_syncKey, JSON.stringify(product));
    const { error } = await supabase
      .from('products')
      .upsert({
        id: product.id,
        encrypted_payload: payload,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'id' });

    if (error) throw error;
  } catch (error) {
    if (error instanceof Error) {
      console.error('Error pushing product:', error.message);
    }
    throw error;
  }
}

/** Encrypt and upsert a single movement to Supabase */
export async function pushMovement(movement: Movement): Promise<void> {
  if (!_syncKey) return;

  try {
    const payload = await encrypt(_syncKey, JSON.stringify(movement));
    const { error } = await supabase
      .from('movements')
      .upsert({
        id: movement.id,
        product_id: movement.productId,
        encrypted_payload: payload,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'id' });

    if (error) throw error;
  } catch (error) {
    if (error instanceof Error) {
      console.error('Error pushing movement:', error.message);
    }
    throw error;
  }
}

/** Delete a product from Supabase (cascades to movements) */
export async function deleteProductRemote(productId: string): Promise<void> {
  try {
    const { error } = await supabase
      .from('products')
      .delete()
      .eq('id', productId);

    if (error) throw error;
  } catch (error) {
    if (error instanceof Error) {
      console.error('Error deleting product:', error.message);
    }
    throw error;
  }
}

// ─── PULL (Supabase → local) ───

/** Fetch all products from Supabase and decrypt */
export async function pullProducts(): Promise<Product[]> {
  if (!_syncKey) return [];

  try {
    const { data, error } = await supabase
      .from('products')
      .select('id, encrypted_payload, updated_at')
      .order('updated_at', { ascending: false });

    if (error) throw error;
    if (!data) return [];

    const products: Product[] = [];
    for (const row of data) {
      try {
        const json = await decrypt(_syncKey, row.encrypted_payload);
        products.push(JSON.parse(json) as Product);
      } catch {
        console.warn('Could not decrypt product:', row.id);
      }
    }
    return products;
  } catch (error) {
    if (error instanceof Error) {
      console.error('Error pulling products:', error.message);
    }
    return [];
  }
}

/** Fetch all movements from Supabase and decrypt */
export async function pullMovements(): Promise<Movement[]> {
  if (!_syncKey) return [];

  try {
    const { data, error } = await supabase
      .from('movements')
      .select('id, encrypted_payload, updated_at')
      .order('updated_at', { ascending: false });

    if (error) throw error;
    if (!data) return [];

    const movements: Movement[] = [];
    for (const row of data) {
      try {
        const json = await decrypt(_syncKey, row.encrypted_payload);
        movements.push(JSON.parse(json) as Movement);
      } catch {
        console.warn('Could not decrypt movement:', row.id);
      }
    }
    return movements;
  } catch (error) {
    if (error instanceof Error) {
      console.error('Error pulling movements:', error.message);
    }
    return [];
  }
}

// ─── OFFLINE QUEUE ───

const pendingChanges: PendingChange[] = [];

/** Add a change to the pending queue (for offline mode) */
export function queueChange(change: Omit<PendingChange, 'timestamp'>): void {
  pendingChanges.push({ ...change, timestamp: Date.now() });
}

/** Process all pending changes and sync them to Supabase */
export async function flushPendingChanges(): Promise<number> {
  if (!_syncKey || pendingChanges.length === 0) return 0;

  let synced = 0;
  const failed: PendingChange[] = [];

  for (const change of pendingChanges) {
    try {
      if (change.action === 'delete') {
        await deleteProductRemote(change.id);
      } else if (change.table === 'products' && change.data) {
        await pushProduct(change.data as Product);
      } else if (change.table === 'movements' && change.data) {
        await pushMovement(change.data as Movement);
      }
      synced++;
    } catch {
      failed.push(change);
    }
  }

  // Keep only failed changes for retry
  pendingChanges.length = 0;
  pendingChanges.push(...failed);

  return synced;
}

/** Get the number of pending changes */
export function getPendingCount(): number {
  return pendingChanges.length;
}

// ─── REALTIME SUBSCRIPTION ───

let realtimeChannel: RealtimeChannel | null = null;

/** Subscribe to Supabase Realtime changes */
export function subscribeToRealtime(
  onProductChange: () => void,
  onMovementChange: () => void
): () => void {
  realtimeChannel = supabase
    .channel('inventory-sync')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'products' },
      () => onProductChange()
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'movements' },
      () => onMovementChange()
    )
    .subscribe();

  return () => {
    if (realtimeChannel) {
      supabase.removeChannel(realtimeChannel);
      realtimeChannel = null;
    }
  };
}
