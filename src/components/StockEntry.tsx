import React, { useState } from 'react';
import { PackagePlus, Save } from 'lucide-react';
import { useInventoryStore } from '../store/useInventoryStore';

export const StockEntry: React.FC = () => {
  const { products, registerEntry } = useInventoryStore();
  
  const [selectedProductId, setSelectedProductId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [costPrice, setCostPrice] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const selectedProduct = products.find(p => p.id === selectedProductId);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProductId || !quantity) return;

    const qtyNumber = parseFloat(quantity);
    const costNumber = costPrice ? parseFloat(costPrice) : undefined;
    
    registerEntry(selectedProductId, qtyNumber, costNumber);
    
    // Reset form and show success message
    setQuantity('');
    setCostPrice('');
    setSuccessMsg('¡Entrada registrada con éxito!');
    setTimeout(() => setSuccessMsg(''), 3000);
  };

  return (
    <div className="p-6 max-w-md mx-auto min-h-screen pb-24">
      <header className="flex items-center gap-3 mb-8">
        <div className="bg-coffee-brown text-cream p-2.5 rounded-2xl shadow-[0_4px_12px_rgba(92,61,46,0.15)] flex items-center justify-center">
          <PackagePlus size={24} />
        </div>
        <h1 className="text-2xl font-serif text-coffee-dark">Registrar Entrada</h1>
      </header>

      <div className="bg-white p-6 rounded-3xl shadow-[0_2px_8px_rgba(200,169,139,0.1)] border border-wood-light">
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Selección de Producto */}
          <div>
            <label className="block text-sm font-semibold text-text-muted mb-1.5 ml-1">Producto o Insumo</label>
            <select 
              value={selectedProductId}
              onChange={(e) => setSelectedProductId(e.target.value)}
              className="w-full px-4 py-3.5 rounded-2xl bg-cream border border-wood-medium text-coffee-dark focus:outline-none focus:border-coffee-brown focus:ring-4 focus:ring-coffee-brown/10 appearance-none"
              required
            >
              <option value="" disabled>Selecciona un producto...</option>
              {products.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          {/* Cantidad y Unidad */}
          <div>
            <label className="block text-sm font-semibold text-text-muted mb-1.5 ml-1">
              Cantidad Entrante {selectedProduct && `(${selectedProduct.unit})`}
            </label>
            <input 
              type="number" 
              step="0.01"
              min="0.01"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="Ej. 10"
              className="w-full px-4 py-3.5 rounded-2xl bg-cream border border-wood-medium text-coffee-dark focus:outline-none focus:border-coffee-brown focus:ring-4 focus:ring-coffee-brown/10"
              required
            />
          </div>

          {/* Coste Base Unitario (Opcional) */}
          <div>
            <label className="block text-sm font-semibold text-text-muted mb-1.5 ml-1">
              Costo Unitario Nuevo (Opcional, $)
            </label>
            <input 
              type="number" 
              step="0.01"
              min="0"
              value={costPrice}
              onChange={(e) => setCostPrice(e.target.value)}
              placeholder={selectedProduct ? `Actual: $${selectedProduct.costPrice}` : "Ej. 15.50"}
              className="w-full px-4 py-3.5 rounded-2xl bg-cream border border-wood-medium text-coffee-dark focus:outline-none focus:border-coffee-brown focus:ring-4 focus:ring-coffee-brown/10"
            />
            <p className="text-xs text-text-muted mt-2 ml-1">Si el proveedor cambió el precio, actualízalo aquí.</p>
          </div>

          <button 
            type="submit"
            className="w-full py-4 mt-2 bg-coffee-brown hover:bg-coffee-dark text-white rounded-2xl font-semibold transition-all active:scale-95 shadow-[0_4px_12px_rgba(92,61,46,0.2)] flex justify-center items-center gap-2"
          >
            <Save size={20} />
            Guardar Entrada
          </button>

          {successMsg && (
            <div className="p-3 bg-accent-red-bg text-accent-green rounded-xl text-center text-sm font-semibold border border-wood-light">
              {successMsg}
            </div>
          )}
        </form>
      </div>
    </div>
  );
};

export default StockEntry;
