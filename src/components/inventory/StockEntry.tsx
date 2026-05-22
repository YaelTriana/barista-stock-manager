import React, { useState } from 'react';
import { PackagePlus, Save } from 'lucide-react';
import { useInventoryStore } from '../../store/useInventoryStore';
import { useCurrentUser } from '../../contexts/UserContext';

export const StockEntry: React.FC = () => {
  const products = useInventoryStore((s) => s.products);
  const registerEntry = useInventoryStore((s) => s.registerEntry);
  const showToast = useInventoryStore((s) => s.showToast);
  const { username } = useCurrentUser();

  const [selectedProductId, setSelectedProductId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [costPrice, setCostPrice] = useState('');

  const selectedProduct = products.find(p => p.id === selectedProductId);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProductId || !quantity) return;

    const qtyNumber = parseFloat(quantity);
    const costNumber = costPrice ? parseFloat(costPrice) : undefined;

    registerEntry(selectedProductId, qtyNumber, costNumber, username);

    setQuantity('');
    setCostPrice('');
    showToast('¡Entrada registrada con éxito!');
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
          <div>
            <label htmlFor="entry-product" className="block text-sm font-semibold text-text-muted mb-1.5 ml-1">Producto o Insumo</label>
            <select
              id="entry-product"
              value={selectedProductId}
              onChange={(e) => setSelectedProductId(e.target.value)}
              className="w-full px-4 py-3.5 rounded-2xl bg-cream border border-wood-medium text-coffee-dark focus:outline-none focus:border-coffee-brown focus:ring-4 focus:ring-coffee-brown/10 appearance-none min-h-[48px]"
              required
            >
              <option value="" disabled>Selecciona un producto...</option>
              {products.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="entry-quantity" className="block text-sm font-semibold text-text-muted mb-1.5 ml-1">
              Cantidad Entrante {selectedProduct && `(${selectedProduct.unit})`}
            </label>
            <input
              id="entry-quantity"
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

          <div>
            <label htmlFor="entry-cost" className="block text-sm font-semibold text-text-muted mb-1.5 ml-1">
              Costo Unitario Nuevo (Opcional, $)
            </label>
            <input
              id="entry-cost"
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
            className="w-full py-4 mt-2 bg-coffee-brown hover:bg-coffee-dark text-white rounded-2xl font-semibold transition-all active:scale-95 shadow-[0_4px_12px_rgba(92,61,46,0.2)] flex justify-center items-center gap-2 min-h-[48px]"
          >
            <Save size={20} />
            Guardar Entrada
          </button>
        </form>
      </div>
    </div>
  );
};

export default StockEntry;
