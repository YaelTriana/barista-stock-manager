export interface Product {
  id: string;
  name: string;
  category: string;
  currentQuantity: number;
  minThreshold: number;
  unit: string;
  costPrice: number;
}

export type MovementType = 'in' | 'out';

export interface Movement {
  id: string;
  productId: string;
  productName: string;
  type: MovementType;
  quantity: number;
  date: string; // ISO string
  cost: number;
}

