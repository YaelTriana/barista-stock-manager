import React, { useState } from 'react';
import { Plus, Minus, Search, AlertCircle, Coffee, Trash2, Lock } from 'lucide-react';
import { useInventoryStore } from '../../store/useInventoryStore';
import { AddProductModal } from './AddProductModal';
import { useCurrentUser } from '../../contexts/UserContext';
import { PERMISSIONS } from '../../schemas/user';

export const InventoryList: React.FC = () => {
  const products = useInventoryStore((s) => s.products);
  const updateStock = useInventoryStore((s) => s.updateStock);
  const deleteProduct = useInventoryStore((s) => s.deleteProduct);
  const showToast = useInventoryStore((s) => s.showToast);
  const isInventoryLockedToday = useInventoryStore((s) => s.isInventoryLockedToday);

  const { role, username } = useCurrentUser();
  const canAdd = PERMISSIONS.canAddProduct(role);
  const canDelete = PERMISSIONS.canDeleteProduct(role);
  const canUpdateStock = PERMISSIONS.canRegisterEntry(role) || PERMISSIONS.canRegisterOutput(role);

  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);

  const filteredProducts = products.filter(p =>
    p.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const inventoryLocked = isInventoryLockedToday();

  const handleDelete = (id: string, name: string) => {
    if (!canDelete) {
      showToast('No tienes permiso para eliminar productos.');
      return;
    }
    if (inventoryLocked) {
      showToast('No se puede eliminar: el inventario fue confirmado hoy.');
      return;
    }
    if (window.confirm(`¿Eliminar "${name}" del inventario? Esta acción no se puede deshacer.`)) {
      deleteProduct(id);
      showToast(`"${name}" eliminado`);
    }
  };

  return (
    <div className="p-6 max-w-md mx-auto min-h-screen pb-24">

      {/* Header */}
      <header className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <div className="bg-coffee-brown text-cream p-2.5 rounded-2xl shadow-[0_4px_12px_rgba(92,61,46,0.15)] flex items-center justify-center">
            <Coffee size={24} />
          </div>
          <h1 className="text-2xl font-serif text-coffee-dark leading-none mt-1">Inventario</h1>
        </div>

        {canAdd && (
          <button
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-1.5 px-4 py-2 bg-wood-light text-coffee-brown rounded-xl font-semibold text-sm hover:bg-wood-medium/40 transition-colors active:scale-95 min-h-[48px]"
          >
            <Plus size={18} className="stroke-[3px]" />
            Nuevo
          </button>
        )}
      </header>

      {/* Inventory locked banner */}
      {inventoryLocked && canDelete && (
        <div className="flex items-center gap-2 bg-wood-light border border-wood-medium rounded-2xl px-4 py-3 mb-5">
          <Lock size={16} className="text-text-muted shrink-0" />
          <p className="text-sm font-medium text-text-muted">
            Inventario confirmado hoy — eliminación de productos deshabilitada.
          </p>
        </div>
      )}

      {/* Search */}
      <div className="relative mb-6">
        <input
          id="search-inventory"
          type="text"
          placeholder="Buscar insumo (ej. Leche)..."
          className="w-full pl-11 pr-4 py-3.5 rounded-2xl border border-wood-medium bg-white/80 text-coffee-dark focus:outline-none focus:border-coffee-brown focus:ring-4 focus:ring-coffee-brown/10 transition-all text-base"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted" size={20} />
      </div>

      {/* Product List */}
      <div className="flex flex-col gap-4">
        {filteredProducts.map((product) => {
          const isLowStock = product.currentQuantity <= product.minThreshold;
          const deleteDisabled = !canDelete || inventoryLocked;

          return (
            <div
              key={product.id}
              className={`border rounded-2xl p-4 shadow-[0_2px_8px_rgba(200,169,139,0.1)] transition-transform active:scale-[0.98] ${
                isLowStock ? 'bg-accent-red-bg border-accent-red-border' : 'bg-white border-wood-light'
              }`}
            >
              <div className="flex justify-between items-start mb-3">
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-[1.1rem] text-coffee-dark leading-tight truncate">{product.name}</h3>
                  <p className="text-[0.85rem] text-text-muted mt-0.5">
                    {product.category} • Mín: {product.minThreshold} {product.unit}
                  </p>
                </div>
                <div className="flex items-center gap-2 ml-2 shrink-0">
                  {isLowStock && (
                    <div className="flex items-center gap-1 bg-accent-red-light text-accent-red px-2 py-1 rounded-lg text-xs font-bold">
                      <AlertCircle size={14} />
                      Bajo
                    </div>
                  )}
                  {/* Delete button — only shown to admin, hidden when locked */}
                  {canDelete && (
                    <button
                      onClick={() => handleDelete(product.id, product.name)}
                      disabled={deleteDisabled}
                      className={`p-1.5 rounded-lg transition-all ${
                        deleteDisabled
                          ? 'text-wood-medium cursor-not-allowed opacity-40'
                          : 'text-text-muted hover:text-accent-red hover:bg-accent-red-light'
                      }`}
                      aria-label={deleteDisabled ? 'Eliminación bloqueada' : `Eliminar ${product.name}`}
                      title={inventoryLocked ? 'Inventario confirmado hoy' : `Eliminar ${product.name}`}
                    >
                      {inventoryLocked ? <Lock size={16} /> : <Trash2 size={16} />}
                    </button>
                  )}
                </div>
              </div>

              <div className={`flex items-center justify-between px-3 py-2 rounded-xl ${
                isLowStock ? 'bg-accent-red-border/50' : 'bg-wood-light'
              }`}>
                <div className="flex items-baseline gap-1">
                  <span className={`text-2xl font-bold ${isLowStock ? 'text-accent-red' : 'text-coffee-dark'}`}>
                    {product.currentQuantity}
                  </span>
                  <span className={`font-medium ${isLowStock ? 'text-accent-red' : 'text-text-muted'}`}>
                    {product.unit}
                  </span>
                </div>

                {/* Stock controls — only for admin/registrar */}
                {canUpdateStock && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => updateStock(product.id, -1, true, username)}
                      className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all active:scale-90 ${
                        isLowStock ? 'bg-accent-red-btn text-coffee-brown' : 'bg-wood-medium text-coffee-dark'
                      }`}
                      aria-label="Registrar consumo"
                    >
                      <Minus size={20} className="stroke-[2.5px]" />
                    </button>
                    <button
                      onClick={() => updateStock(product.id, 1, true, username)}
                      className="w-12 h-12 bg-coffee-brown text-white rounded-xl flex items-center justify-center shadow-[0_4px_8px_rgba(92,61,46,0.2)] transition-all active:scale-90"
                      aria-label="Registrar entrada rápida"
                    >
                      <Plus size={20} className="stroke-[2.5px]" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {filteredProducts.length === 0 && (
          <div className="text-center py-10 text-text-muted font-medium bg-white rounded-2xl border border-wood-light border-dashed">
            No se encontraron insumos.
            {canAdd && (
              <button
                onClick={() => setIsModalOpen(true)}
                className="mt-4 px-6 py-2 bg-coffee-brown text-white rounded-xl font-medium mx-auto block min-h-[48px]"
              >
                Agregar el primer item
              </button>
            )}
          </div>
        )}
      </div>

      {canAdd && (
        <AddProductModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
        />
      )}
    </div>
  );
};

export default InventoryList;
