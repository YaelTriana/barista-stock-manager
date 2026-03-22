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

type SyncStatus = 'synced' | 'pending' | 'syncing' | 'offline' | 'error';
type ActiveTab = 'inventory' | 'entry' | 'reports';

interface InventoryState {
  // Data
  products: Product[];
  movements: Movement[];

  // UI state (not persisted)
  syncStatus: SyncStatus;
  activeTab: ActiveTab;
  isOnline: boolean;
  toastMessage: string | null;

  // Actions
  addProduct: (product: Product) => void;
  deleteProduct: (id: string) => void;
  updateStock: (id: string, delta: number, recordMovement?: boolean) => void;
  registerEntry: (id: string, quantity: number, costOverwrite?: number) => void;

  // UI actions
  setActiveTab: (tab: ActiveTab) => void;
  setSyncStatus: (status: SyncStatus) => void;
  setOnline: (online: boolean) => void;
  showToast: (message: string) => void;
  clearToast: () => void;

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
      syncStatus: 'synced' as SyncStatus,
      activeTab: 'inventory' as ActiveTab,
      isOnline: navigator.onLine,
      toastMessage: null,

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

      updateStock: (id, delta, recordMovement = true) => {
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
                }
              : null;

          // Queue sync
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

      registerEntry: (id, quantity, costOverwrite) => {
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
          };

          // Queue sync
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
      },

      // ─── UI ACTIONS ───

      setActiveTab: (tab) => set({ activeTab: tab }),
      setSyncStatus: (status) => set({ syncStatus: status }),
      setOnline: (online) => set({ isOnline: online }),
      showToast: (message) => {
        set({ toastMessage: message });
        setTimeout(() => {
          set({ toastMessage: null });
        }, 3500);
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
          () => {
            // On product change from another device
            get().syncFromRemote();
          },
          () => {
            // On movement change from another device
            get().syncFromRemote();
          }
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
      }),
    }
  )
);
