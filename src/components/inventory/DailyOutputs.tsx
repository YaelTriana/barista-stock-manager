import React, { useState, useMemo } from 'react';
import { ArrowDownCircle, CheckCircle, Download, ClipboardList, AlertCircle } from 'lucide-react';
import * as XLSX from 'xlsx';
import { useInventoryStore } from '../../store/useInventoryStore';
import { PERMISSIONS } from '../../schemas/user';
import { useCurrentUser } from '../../contexts/UserContext';

interface OutputRow {
  productId: string;
  name: string;
  category: string;
  currentQuantity: number;
  originalQuantity: number; // snapshot taken on mount — never updated after confirm
  unit: string;
  costPrice: number;
  outputQty: string; // string for controlled input
}

export const DailyOutputs: React.FC = () => {
  const products = useInventoryStore(s => s.products);
  const registerOutputs = useInventoryStore(s => s.registerOutputs);
  const showToast = useInventoryStore(s => s.showToast);
  const isInventoryLockedToday = useInventoryStore(s => s.isInventoryLockedToday);
  const { role, username } = useCurrentUser();

  const canRegister = PERMISSIONS.canRegisterOutput(role);

  // Build rows from products
  const [rows, setRows] = useState<OutputRow[]>(() =>
    products.map(p => ({
      productId: p.id,
      name: p.name,
      category: p.category,
      currentQuantity: p.currentQuantity,
      originalQuantity: p.currentQuantity, // snapshot at mount
      unit: p.unit,
      costPrice: p.costPrice,
      outputQty: '',
    }))
  );

  // Sync product list if it changes — preserve originalQuantity so it never reflects post-confirm stock
  React.useEffect(() => {
    setRows(prev => {
      const prevMap = new Map(prev.map(r => [r.productId, { outputQty: r.outputQty, originalQuantity: r.originalQuantity }]));
      return products.map(p => ({
        productId: p.id,
        name: p.name,
        category: p.category,
        currentQuantity: p.currentQuantity,
        originalQuantity: prevMap.get(p.id)?.originalQuantity ?? p.currentQuantity,
        unit: p.unit,
        costPrice: p.costPrice,
        outputQty: prevMap.get(p.id)?.outputQty ?? '',
      }));
    });
  }, [products]);

  const [confirmed, setConfirmed] = useState(false);

  // Compute totals
  const { totalOutputCost, totalOutputItems, validOutputs } = useMemo(() => {
    let cost = 0;
    let items = 0;
    const valid: { productId: string; quantity: number }[] = [];

    for (const row of rows) {
      const qty = parseFloat(row.outputQty);
      if (!isNaN(qty) && qty > 0) {
        cost += row.costPrice * Math.min(qty, row.currentQuantity);
        items++;
        valid.push({ productId: row.productId, quantity: qty });
      }
    }
    return { totalOutputCost: cost, totalOutputItems: items, validOutputs: valid };
  }, [rows]);

  const updateRow = (productId: string, val: string) => {
    setRows(prev => prev.map(r =>
      r.productId === productId ? { ...r, outputQty: val } : r
    ));
  };

  const handleConfirm = () => {
    if (validOutputs.length === 0) {
      showToast('Ingresa al menos una cantidad de salida.');
      return;
    }

    registerOutputs(validOutputs, username);
    setConfirmed(true);
    showToast(`✓ ${validOutputs.length} salidas registradas`);

    // Reset quantities after a moment
    setTimeout(() => {
      setRows(prev => prev.map(r => ({ ...r, outputQty: '' })));
      setConfirmed(false);
    }, 2000);
  };

  // Export to XLSX
  const handleExport = () => {
    const today = new Date().toLocaleDateString('es-MX', {
      year: 'numeric', month: '2-digit', day: '2-digit',
    });

    const data = rows.map(row => {
      const qty = parseFloat(row.outputQty) || 0;
      // originalQuantity = stock antes de confirmar salidas (nunca se sobreescribe)
      const stockAntes = row.originalQuantity;
      return {
        'Producto': row.name,
        'Categoría': row.category,
        'Stock Actual': stockAntes,
        'Unidad': row.unit,
        'Salida': qty,
        'Costo Unitario ($)': row.costPrice,
        'Costo Total ($)': qty > 0 ? parseFloat((row.costPrice * Math.min(qty, stockAntes)).toFixed(2)) : 0,
        'Stock Restante': qty > 0 ? Math.max(0, parseFloat((stockAntes - qty).toFixed(2))) : stockAntes,
      };
    });

    const ws = XLSX.utils.json_to_sheet(data);

    // Column widths
    ws['!cols'] = [
      { wch: 22 }, { wch: 14 }, { wch: 14 }, { wch: 10 },
      { wch: 10 }, { wch: 18 }, { wch: 16 }, { wch: 16 },
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Salidas del Día');
    XLSX.writeFile(wb, `salidas_${today.replace(/\//g, '-')}.xlsx`);
    showToast('Archivo Excel descargado');
  };

  const isLocked = isInventoryLockedToday();

  return (
    <div className="p-6 max-w-md mx-auto min-h-screen pb-32">

      {/* Header */}
      <header className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="bg-accent-red text-white p-2.5 rounded-2xl shadow-[0_4px_12px_rgba(200,80,60,0.2)] flex items-center justify-center">
            <ArrowDownCircle size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-serif text-coffee-dark leading-tight">Salidas del Día</h1>
            <p className="text-xs text-text-muted font-medium mt-0.5">
              {new Date().toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })}
            </p>
          </div>
        </div>
        <button
          onClick={handleExport}
          className="flex items-center gap-1.5 px-3 py-2 bg-white border border-wood-medium text-coffee-brown rounded-xl font-semibold text-sm hover:bg-wood-light transition-colors active:scale-95 min-h-[44px]"
          title="Exportar a Excel"
        >
          <Download size={16} />
          Excel
        </button>
      </header>

      {/* Lock notice */}
      {isLocked && (
        <div className="flex items-center gap-2 bg-accent-green-light border border-accent-green/30 rounded-2xl px-4 py-3 mb-5">
          <CheckCircle size={18} className="text-accent-green shrink-0" />
          <p className="text-sm font-medium text-accent-green">Inventario confirmado hoy. Las salidas ya fueron registradas.</p>
        </div>
      )}

      {/* Read-only notice for viewers */}
      {!canRegister && (
        <div className="flex items-center gap-2 bg-wood-light border border-wood-medium rounded-2xl px-4 py-3 mb-5">
          <AlertCircle size={18} className="text-text-muted shrink-0" />
          <p className="text-sm font-medium text-text-muted">Solo visualización. No tienes permiso para registrar salidas.</p>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 mb-5">
        <div className="bg-white rounded-2xl border border-wood-light p-4 flex flex-col items-center text-center shadow-[0_2px_8px_rgba(200,169,139,0.08)]">
          <ClipboardList size={20} className="text-coffee-brown mb-2" />
          <p className="text-2xl font-bold text-coffee-dark">{totalOutputItems}</p>
          <p className="text-[0.7rem] font-bold text-text-muted uppercase tracking-widest mt-0.5">Productos</p>
        </div>
        <div className="bg-white rounded-2xl border border-wood-light p-4 flex flex-col items-center text-center shadow-[0_2px_8px_rgba(200,169,139,0.08)]">
          <ArrowDownCircle size={20} className="text-accent-red mb-2" />
          <p className="text-2xl font-bold text-coffee-dark">${totalOutputCost.toFixed(2)}</p>
          <p className="text-[0.7rem] font-bold text-text-muted uppercase tracking-widest mt-0.5">Costo Total</p>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-3xl border border-wood-light shadow-[0_2px_8px_rgba(200,169,139,0.08)] overflow-hidden mb-5">

        {/* Table header */}
        <div className="grid grid-cols-[1fr_auto_auto] gap-3 px-4 py-3 bg-cream border-b border-wood-light">
          <span className="text-[0.7rem] font-bold text-text-muted uppercase tracking-widest">Producto</span>
          <span className="text-[0.7rem] font-bold text-text-muted uppercase tracking-widest text-center w-20">Stock</span>
          <span className="text-[0.7rem] font-bold text-text-muted uppercase tracking-widest text-center w-24">Salida</span>
        </div>

        {/* Rows */}
        <div className="divide-y divide-wood-light/60">
          {rows.length === 0 && (
            <div className="py-8 text-center text-text-muted font-medium text-sm">
              No hay productos en el inventario.
            </div>
          )}
          {rows.map(row => {
            const qty = parseFloat(row.outputQty) || 0;
            const exceedsStock = qty > row.currentQuantity && row.currentQuantity > 0;
            const isLowStock = row.currentQuantity <= 0;

            return (
              <div key={row.productId} className="grid grid-cols-[1fr_auto_auto] gap-3 px-4 py-3.5 items-center">
                <div className="min-w-0">
                  <p className="font-semibold text-coffee-dark text-sm leading-tight truncate">{row.name}</p>
                  <p className="text-xs text-text-muted mt-0.5 truncate">{row.category}</p>
                </div>
                <div className="w-20 text-center">
                  <p className={`font-bold text-base ${isLowStock ? 'text-accent-red' : 'text-coffee-dark'}`}>
                    {row.currentQuantity}
                  </p>
                  <p className="text-[0.65rem] text-text-muted">{row.unit}</p>
                </div>
                <div className="w-24">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={row.outputQty}
                    onChange={e => updateRow(row.productId, e.target.value)}
                    disabled={!canRegister || confirmed}
                    placeholder="0"
                    className={`w-full px-3 py-2 rounded-xl text-center font-bold text-sm border focus:outline-none focus:ring-2 transition-all
                      ${exceedsStock
                        ? 'border-accent-red bg-accent-red-bg text-accent-red focus:ring-accent-red/20'
                        : 'border-wood-medium bg-cream text-coffee-dark focus:border-coffee-brown focus:ring-coffee-brown/15'
                      }
                      ${!canRegister || confirmed ? 'opacity-60 cursor-not-allowed' : ''}
                    `}
                  />
                  {exceedsStock && (
                    <p className="text-[0.6rem] text-accent-red font-bold text-center mt-0.5">Excede stock</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Confirm button */}
      {canRegister && (
        <button
          onClick={handleConfirm}
          disabled={validOutputs.length === 0 || confirmed}
          className={`w-full py-4 rounded-2xl font-semibold transition-all flex items-center justify-center gap-2 min-h-[56px] shadow-[0_4px_12px_rgba(92,61,46,0.15)]
            ${confirmed
              ? 'bg-accent-green text-white cursor-not-allowed'
              : validOutputs.length === 0
                ? 'bg-wood-light text-text-muted cursor-not-allowed'
                : 'bg-coffee-brown hover:bg-coffee-dark text-white active:scale-[0.98]'
            }
          `}
        >
          {confirmed ? (
            <>
              <CheckCircle size={20} />
              Salidas Registradas
            </>
          ) : (
            <>
              <ArrowDownCircle size={20} />
              Confirmar Salidas ({validOutputs.length} productos)
            </>
          )}
        </button>
      )}
    </div>
  );
};

export default DailyOutputs;
