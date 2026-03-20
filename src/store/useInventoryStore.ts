import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import localforage from 'localforage';
import type { Product, Movement } from '../types';

interface InventoryState {
  products: Product[];
  movements: Movement[];
  addProduct: (product: Product) => void;
  updateStock: (id: string, delta: number, recordMovement?: boolean) => void;
  registerEntry: (id: string, quantity: number, costOverwrite?: number) => void;
}

const mockInventory: Product[] = [
  { id: '1', name: 'Granos de Café (Arabica)', category: 'Insumo', currentQuantity: 2.5, minThreshold: 5, unit: 'kg', costPrice: 15.00 },
  { id: '2', name: 'Leche Entera', category: 'Lácteos', currentQuantity: 12, minThreshold: 10, unit: 'L', costPrice: 1.20 },
  { id: '3', name: 'Sirope de Vainilla', category: 'Complemento', currentQuantity: 4, minThreshold: 2, unit: 'Botellas', costPrice: 8.50 },
];

localforage.config({
  name: 'cafe-inventory',
  storeName: 'inventory_store'
});

export const useInventoryStore = create<InventoryState>()(
  persist(
    (set) => ({
      products: mockInventory,
      movements: [],
      addProduct: (product) => set((state) => ({ products: [...state.products, product] })),
      
      updateStock: (id, delta, recordMovement = true) => set((state) => {
        const product = state.products.find(p => p.id === id);
        if (!product) return state;

        const newQuantity = Math.max(0, parseFloat((product.currentQuantity + delta).toFixed(2)));
        const actualDelta = newQuantity - product.currentQuantity; // En caso de que delta sea muy negativo, no bajar de 0

        const newMovement: Movement | null = recordMovement && actualDelta !== 0 ? {
          id: crypto.randomUUID(),
          productId: id,
          productName: product.name,
          type: actualDelta > 0 ? 'in' : 'out',
          quantity: Math.abs(actualDelta),
          date: new Date().toISOString(),
          cost: product.costPrice * Math.abs(actualDelta),
        } : null;

        return {
          products: state.products.map(p => p.id === id ? { ...p, currentQuantity: newQuantity } : p),
          movements: newMovement ? [newMovement, ...state.movements] : state.movements
        };
      }),

      registerEntry: (id, quantity, costOverwrite) => set((state) => {
        const product = state.products.find(p => p.id === id);
        if (!product || quantity <= 0) return state;

        const appliedCost = costOverwrite !== undefined ? costOverwrite : product.costPrice;

        const newMovement: Movement = {
          id: crypto.randomUUID(),
          productId: id,
          productName: product.name,
          type: 'in',
          quantity: quantity,
          date: new Date().toISOString(),
          cost: appliedCost * quantity,
        };

        return {
          products: state.products.map(p => 
            p.id === id ? { 
              ...p, 
              currentQuantity: parseFloat((p.currentQuantity + quantity).toFixed(2)),
              costPrice: appliedCost // Actualiza el costo base si es diferente
            } : p
          ),
          movements: [newMovement, ...state.movements]
        };
      })
    }),
    {
      name: 'inventory-storage',
      storage: createJSONStorage(() => ({
        getItem: async (name: string): Promise<string | null> => {
          return (await localforage.getItem(name)) || null;
        },
        setItem: async (name: string, value: string): Promise<void> => {
          await localforage.setItem(name, value);
        },
        removeItem: async (name: string): Promise<void> => {
          await localforage.removeItem(name);
        },
      })),
    }
  )
);
