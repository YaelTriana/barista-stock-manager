import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { encryptedStorage } from '../lib/encryptedStorage';
import {
  pushProduct,
  pushMovement,
  deleteProductRemote,
  pullProducts,
  pullMovements,
  queueChange,
  flushPendingChanges,
  getPendingCount,
  subscribeToRealtime,
} from '../lib/sync';
import type { Product } from '../schemas/product';
import type { Movement } from '../schemas/movement';
import type { UserRole } from '../schemas/user';

type SyncStatus = 'synced' | 'pending' | 'syncing' | 'offline' | 'error';
type ActiveTab = 'inventory' | 'entry' | 'outputs' | 'reports';

/** Returns today's date as "YYYY-MM-DD" */
function todayStr(): string {
  return new Date().toISOString().substring(0, 10);
}

interface InventoryState {
  // Data
  products: Product[];
  movements: Movement[];

  // Inventory lock — prevents product deletion after entries are confirmed today
  inventoryLockedDate: string | null;

  // UI state (not persisted)
  syncStatus: SyncStatus;
  activeTab: ActiveTab;
  isOnline: boolean;
  toastMessage: string | null;
  currentUserRole: UserRole | null;

  // ─── ACTIONS ───
  addProduct: (product: Product) => void;
  deleteProduct: (id: string) => void;
  updateStock: (id: string, delta: number, recordMovement?: boolean, registeredBy?: string) => void;
  registerEntry: (id: string, quantity: number, costOverwrite?: number, registeredBy?: string) => void;
  registerOutputs: (outputs: { productId: string; quantity: number }[], registeredBy?: string) => void;

  // Inventory lock
  lockInventoryForDay: () => void;
  isInventoryLockedToday: () => boolean;

  // UI actions
  setActiveTab: (tab: ActiveTab) => void;
  setSyncStatus: (status: SyncStatus) => void;
  setOnline: (online: boolean) => void;
  showToast: (message: string) => void;
  clearToast: () => void;
  setCurrentUserRole: (role: UserRole | null) => void;

  // Sync actions
  syncFromRemote: () => Promise<void>;
  flushPending: () => Promise<void>;
  startRealtime: () => () => void;
}

export const useInventoryStore = create<InventoryState>()(
  persist(
    (set, get) => ({
      // Initial state
      products: [],
      movements: [],
      inventoryLockedDate: null,
      syncStatus: 'synced' as SyncStatus,
      activeTab: 'inventory' as ActiveTab,
      isOnline: navigator.onLine,
      toastMessage: null,
      currentUserRole: null,

      // ─── INVENTORY LOCK ───

      lockInventoryForDay: () => set({ inventoryLockedDate: todayStr() }),

      isInventoryLockedToday: () => {
        return get().inventoryLockedDate === todayStr();
      },

      // ─── PRODUCT ACTIONS ───

      addProduct: (product) => {
        set((state) => ({ products: [...state.products, product] }));

        const { isOnline } = get();
        if (isOnline) {
          pushProduct(product)
            .then(() => set({ syncStatus: 'synced' }))
            .catch(() => {
              queueChange({ id: product.id, table: 'products', action: 'upsert', data: product });
              set({ syncStatus: 'pending' });
            });
        } else {
          queueChange({ id: product.id, table: 'products', action: 'upsert', data: product });
          set({ syncStatus: 'pending' });
        }
      },

      deleteProduct: (id) => {
        // Safety check: cannot delete if inventory is locked today
        if (get().isInventoryLockedToday()) {
          get().showToast('No se puede eliminar: el inventario fue confirmado hoy.');
          return;
        }

        set((state) => ({
          products: state.products.filter((p) => p.id !== id),
          movements: state.movements.filter((m) => m.productId !== id),
        }));

        const { isOnline } = get();
        if (isOnline) {
          deleteProductRemote(id)
            .then(() => set({ syncStatus: 'synced' }))
            .catch(() => {
              queueChange({ id, table: 'products', action: 'delete', data: null });
              set({ syncStatus: 'pending' });
            });
        } else {
          queueChange({ id, table: 'products', action: 'delete', data: null });
          set({ syncStatus: 'pending' });
        }
      },

      updateStock: (id, delta, recordMovement = true, registeredBy) => {
        set((state) => {
          const product = state.products.find((p) => p.id === id);
          if (!product) return state;

          const newQuantity = Math.max(0, parseFloat((product.currentQuantity + delta).toFixed(2)));
          const actualDelta = newQuantity - product.currentQuantity;

          const updatedProduct = { ...product, currentQuantity: newQuantity };
          const newMovement: Movement | null =
            recordMovement && actualDelta !== 0
              ? {
                  id: crypto.randomUUID(),
                  productId: id,
                  productName: product.name,
                  type: actualDelta > 0 ? ('in' as const) : ('out' as const),
                  quantity: Math.abs(actualDelta),
                  date: new Date().toISOString(),
                  cost: product.costPrice * Math.abs(actualDelta),
                  registeredBy,
                  category: product.category,
                }
              : null;

          const { isOnline } = get();
          if (isOnline) {
            pushProduct(updatedProduct).catch(() => {
              queueChange({ id: updatedProduct.id, table: 'products', action: 'upsert', data: updatedProduct });
            });
            if (newMovement) {
              pushMovement(newMovement).catch(() => {
                queueChange({ id: newMovement.id, table: 'movements', action: 'upsert', data: newMovement });
              });
            }
          } else {
            queueChange({ id: updatedProduct.id, table: 'products', action: 'upsert', data: updatedProduct });
            if (newMovement) {
              queueChange({ id: newMovement.id, table: 'movements', action: 'upsert', data: newMovement });
            }
          }

          return {
            products: state.products.map((p) => (p.id === id ? updatedProduct : p)),
            movements: newMovement ? [newMovement, ...state.movements] : state.movements,
          };
        });
      },

      registerEntry: (id, quantity, costOverwrite, registeredBy) => {
        set((state) => {
          const product = state.products.find((p) => p.id === id);
          if (!product || quantity <= 0) return state;

          const appliedCost = costOverwrite !== undefined ? costOverwrite : product.costPrice;

          const updatedProduct = {
            ...product,
            currentQuantity: parseFloat((product.currentQuantity + quantity).toFixed(2)),
            costPrice: appliedCost,
          };

          const newMovement: Movement = {
            id: crypto.randomUUID(),
            productId: id,
            productName: product.name,
            type: 'in' as const,
            quantity,
            date: new Date().toISOString(),
            cost: appliedCost * quantity,
            registeredBy,
            category: product.category,
          };

          const { isOnline } = get();
          if (isOnline) {
            pushProduct(updatedProduct).catch(() => {
              queueChange({ id: updatedProduct.id, table: 'products', action: 'upsert', data: updatedProduct });
            });
            pushMovement(newMovement).catch(() => {
              queueChange({ id: newMovement.id, table: 'movements', action: 'upsert', data: newMovement });
            });
          } else {
            queueChange({ id: updatedProduct.id, table: 'products', action: 'upsert', data: updatedProduct });
            queueChange({ id: newMovement.id, table: 'movements', action: 'upsert', data: newMovement });
          }

          return {
            products: state.products.map((p) => (p.id === id ? updatedProduct : p)),
            movements: [newMovement, ...state.movements],
          };
        });

        // Lock inventory for the day after registering entries
        get().lockInventoryForDay();
      },

      registerOutputs: (outputs, registeredBy) => {
        const now = new Date().toISOString();
        const { isOnline } = get();

        set((state) => {
          const newMovements: Movement[] = [];
          let updatedProducts = [...state.products];

          for (const { productId, quantity } of outputs) {
            if (quantity <= 0) continue;
            const idx = updatedProducts.findIndex(p => p.id === productId);
            if (idx === -1) continue;

            const product = updatedProducts[idx]!;
            const newQty = Math.max(0, parseFloat((product.currentQuantity - quantity).toFixed(2)));
            const actualQty = parseFloat((product.currentQuantity - newQty).toFixed(2));
            if (actualQty <= 0) continue;

            const updatedProduct = { ...product, currentQuantity: newQty };
            updatedProducts = updatedProducts.map((p, i) => i === idx ? updatedProduct : p);

            const movement: Movement = {
              id: crypto.randomUUID(),
              productId,
              productName: product.name,
              type: 'out' as const,
              quantity: actualQty,
              date: now,
              cost: product.costPrice * actualQty,
              registeredBy,
              category: product.category,
            };
            newMovements.push(movement);

            // Queue sync
            if (isOnline) {
              pushProduct(updatedProduct).catch(() =>
                queueChange({ id: updatedProduct.id, table: 'products', action: 'upsert', data: updatedProduct })
              );
              pushMovement(movement).catch(() =>
                queueChange({ id: movement.id, table: 'movements', action: 'upsert', data: movement })
              );
            } else {
              queueChange({ id: updatedProduct.id, table: 'products', action: 'upsert', data: updatedProduct });
              queueChange({ id: movement.id, table: 'movements', action: 'upsert', data: movement });
            }
          }

          return {
            products: updatedProducts,
            movements: [...newMovements, ...state.movements],
          };
        });

        // Lock inventory for the day
        get().lockInventoryForDay();
      },

      // ─── UI ACTIONS ───

      setActiveTab: (tab) => set({ activeTab: tab }),
      setSyncStatus: (status) => set({ syncStatus: status }),
      setOnline: (online) => set({ isOnline: online }),
      setCurrentUserRole: (role) => set({ currentUserRole: role }),
      showToast: (message) => {
        set({ toastMessage: message });
        setTimeout(() => set({ toastMessage: null }), 3500);
      },
      clearToast: () => set({ toastMessage: null }),

      // ─── SYNC ACTIONS ───

      syncFromRemote: async () => {
        try {
          set({ syncStatus: 'syncing' });
          const [products, movements] = await Promise.all([
            pullProducts(),
            pullMovements(),
          ]);

          if (products.length > 0 || movements.length > 0) {
            set({ products, movements, syncStatus: 'synced' });
          } else {
            set({ syncStatus: 'synced' });
          }
        } catch {
          set({ syncStatus: 'error' });
        }
      },

      flushPending: async () => {
        try {
          const count = getPendingCount();
          if (count === 0) return;

          set({ syncStatus: 'syncing' });
          const synced = await flushPendingChanges();

          if (getPendingCount() === 0) {
            set({ syncStatus: 'synced' });
            if (synced > 0) {
              get().showToast(`${synced} cambios sincronizados`);
            }
          } else {
            set({ syncStatus: 'pending' });
          }
        } catch {
          set({ syncStatus: 'error' });
        }
      },

      startRealtime: () => {
        const unsubscribe = subscribeToRealtime(
          () => get().syncFromRemote(),
          () => get().syncFromRemote()
        );
        return unsubscribe;
      },
    }),
    {
      name: 'inventory-storage',
      storage: createJSONStorage(() => encryptedStorage),
      partialize: (state) => ({
        products: state.products,
        movements: state.movements,
        inventoryLockedDate: state.inventoryLockedDate,
      }),
    }
  )
);
