import React, { useState } from 'react';
import { X, Save } from 'lucide-react';
import { useInventoryStore } from '../store/useInventoryStore';
import type { Product } from '../types';

interface AddProductModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AddProductModal: React.FC<AddProductModalProps> = ({ isOpen, onClose }) => {
  const { addProduct } = useInventoryStore();
  
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [unit, setUnit] = useState('');
  const [minThreshold, setMinThreshold] = useState('');
  const [costPrice, setCostPrice] = useState('');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !category || !unit || !minThreshold || !costPrice) return;

    const newProduct: Product = {
      id: crypto.randomUUID(),
      name,
      category,
      currentQuantity: 0, // Inicia en 0, se debe registrar una entrada luego
      minThreshold: parseFloat(minThreshold),
      unit,
      costPrice: parseFloat(costPrice),
    };

    addProduct(newProduct);
    
    // Reset form for next time
    setName('');
    setCategory('');
    setUnit('');
    setMinThreshold('');
    setCostPrice('');
    
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-coffee-dark/40 backdrop-blur-sm transition-opacity" 
        onClick={onClose}
      />
      
      {/* Modal Dialog */}
      <div className="bg-cream w-full max-w-md rounded-t-[32px] sm:rounded-3xl shadow-2xl relative z-10 p-6 pt-8 animate-in slide-in-from-bottom-full sm:slide-in-from-bottom-10 fade-in duration-200">
        
        {/* Mobile handle indicator */}
        <div className="w-12 h-1.5 bg-wood-medium/50 rounded-full mx-auto mb-6 sm:hidden absolute top-3 left-1/2 -translate-x-1/2" />

        <button 
          onClick={onClose}
          className="absolute top-6 right-6 p-2 bg-wood-light text-coffee-brown rounded-full hover:bg-wood-medium/50 transition-colors"
        >
          <X size={20} />
        </button>

        <h2 className="text-2xl font-serif font-bold text-coffee-dark mb-6 text-center sm:text-left">
          Nuevo Insumo
        </h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-text-muted mb-1.5 ml-1">Nombre</label>
            <input 
              type="text" 
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej. Tazas de cerámica"
              className="w-full px-4 py-3 rounded-2xl border border-wood-medium bg-white text-coffee-dark focus:outline-none focus:border-coffee-brown focus:ring-2 focus:ring-coffee-brown/20"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-text-muted mb-1.5 ml-1">Categoría</label>
              <input 
                type="text" 
                required
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="Ej. Vasos"
                className="w-full px-4 py-3 rounded-2xl border border-wood-medium bg-white text-coffee-dark focus:outline-none focus:border-coffee-brown focus:ring-2 focus:ring-coffee-brown/20"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-text-muted mb-1.5 ml-1">Unidad</label>
              <input 
                type="text" 
                required
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                placeholder="Ej. un., kg, L"
                className="w-full px-4 py-3 rounded-2xl border border-wood-medium bg-white text-coffee-dark focus:outline-none focus:border-coffee-brown focus:ring-2 focus:ring-coffee-brown/20"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-text-muted mb-1.5 ml-1">Alerta Mínima</label>
              <input 
                type="number" 
                min="0"
                step="0.01"
                required
                value={minThreshold}
                onChange={(e) => setMinThreshold(e.target.value)}
                placeholder="Ej. 10"
                className="w-full px-4 py-3 rounded-2xl border border-wood-medium bg-white text-coffee-dark focus:outline-none focus:border-coffee-brown focus:ring-2 focus:ring-coffee-brown/20"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-text-muted mb-1.5 ml-1">Costo Base ($)</label>
              <input 
                type="number" 
                min="0"
                step="0.01"
                required
                value={costPrice}
                onChange={(e) => setCostPrice(e.target.value)}
                placeholder="Ej. 5.50"
                className="w-full px-4 py-3 rounded-2xl border border-wood-medium bg-white text-coffee-dark focus:outline-none focus:border-coffee-brown focus:ring-2 focus:ring-coffee-brown/20"
              />
            </div>
          </div>

          <div className="pt-2">
            <button 
              type="submit"
              className="w-full py-4 bg-coffee-brown hover:bg-coffee-dark text-white rounded-2xl font-semibold transition-all active:scale-95 flex items-center justify-center gap-2 shadow-[0_4px_12px_rgba(92,61,46,0.2)]"
            >
              <Save size={20} />
              Crear Insumo
            </button>
            <p className="text-center text-xs text-text-muted mt-3">
              Al guardar, se creará con cantidad 0 por defecto.
            </p>
          </div>
        </form>

      </div>
    </div>
  );
};
