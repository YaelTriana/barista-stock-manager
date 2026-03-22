import React, { useMemo, useState } from 'react';
import { FileBarChart2, ArrowDownCircle, ArrowUpCircle } from 'lucide-react';
import { useInventoryStore } from '../../store/useInventoryStore';

export const ReportsList: React.FC = () => {
  const movements = useInventoryStore((s) => s.movements);
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

  const { filteredMovements, totalOut, totalIn } = useMemo(() => {
    const filtered = movements.filter(m => {
      const dbMonth = m.date.substring(0, 7);
      return dbMonth === selectedMonth;
    });

    const outCosts = filtered.filter(m => m.type === 'out').reduce((acc, curr) => acc + curr.cost, 0);
    const inCosts = filtered.filter(m => m.type === 'in').reduce((acc, curr) => acc + curr.cost, 0);

    return { filteredMovements: filtered, totalOut: outCosts, totalIn: inCosts };
  }, [movements, selectedMonth]);

  return (
    <div className="p-6 max-w-md mx-auto min-h-screen pb-24">
      <header className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <div className="bg-coffee-brown text-cream p-2.5 rounded-2xl shadow-[0_4px_12px_rgba(92,61,46,0.15)] flex items-center justify-center">
            <FileBarChart2 size={24} />
          </div>
          <h1 className="text-2xl font-serif text-coffee-dark">Reportes</h1>
        </div>

        <input
          id="report-month"
          type="month"
          value={selectedMonth}
          onChange={(e) => setSelectedMonth(e.target.value)}
          className="px-3 py-2 rounded-xl bg-white border border-wood-medium text-coffee-dark text-sm font-medium focus:outline-none focus:border-coffee-brown focus:ring-2 focus:ring-coffee-brown/20 min-h-[48px]"
          aria-label="Seleccionar mes"
        />
      </header>

      {/* Financial Summary */}
      <div className="grid grid-cols-2 gap-4 mb-8">
        <div className="bg-white p-5 rounded-[24px] shadow-[0_2px_8px_rgba(200,169,139,0.1)] border border-wood-light flex flex-col items-center text-center">
          <div className="p-2.5 bg-accent-red-bg rounded-xl mb-3">
            <ArrowDownCircle size={28} className="text-accent-red" />
          </div>
          <p className="text-[0.7rem] text-text-muted font-bold uppercase tracking-widest mb-1.5">Consumo</p>
          <p className="text-xl font-bold text-coffee-dark">${totalOut.toFixed(2)}</p>
        </div>

        <div className="bg-white p-5 rounded-[24px] shadow-[0_2px_8px_rgba(200,169,139,0.1)] border border-wood-light flex flex-col items-center text-center">
          <div className="p-2.5 bg-accent-green-light rounded-xl mb-3">
            <ArrowUpCircle size={28} className="text-accent-green" />
          </div>
          <p className="text-[0.7rem] text-text-muted font-bold uppercase tracking-widest mb-1.5">Inversión</p>
          <p className="text-xl font-bold text-coffee-dark">${totalIn.toFixed(2)}</p>
        </div>
      </div>

      {/* Movement History */}
      <div className="mb-4">
        <h2 className="text-lg font-serif font-bold text-coffee-dark mb-4 px-1">Historial del Mes</h2>

        <div className="space-y-3">
          {filteredMovements.length === 0 ? (
            <div className="text-center py-8 text-text-muted font-medium bg-white rounded-2xl border border-wood-light border-dashed">
              No hay movimientos en este mes.
            </div>
          ) : (
            filteredMovements.map((movement) => (
              <div key={movement.id} className="bg-white p-4 rounded-2xl shadow-[0_2px_8px_rgba(200,169,139,0.05)] border border-wood-light flex items-center justify-between transition-transform active:scale-[0.98]">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-xl ${movement.type === 'in' ? 'bg-accent-green-light text-accent-green' : 'bg-accent-red-bg text-accent-red'}`}>
                    {movement.type === 'in' ? <ArrowUpCircle size={20} /> : <ArrowDownCircle size={20} />}
                  </div>
                  <div>
                    <h4 className="font-semibold text-coffee-dark leading-tight">{movement.productName}</h4>
                    <p className="text-xs text-text-muted mt-0.5 font-medium">
                      {new Date(movement.date).toLocaleDateString()} • {new Date(movement.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className={`font-bold text-lg leading-tight ${movement.type === 'in' ? 'text-accent-green' : 'text-accent-red'}`}>
                    {movement.type === 'in' ? '+' : '-'}{movement.quantity}
                  </p>
                  <p className="text-xs text-text-muted font-medium">${movement.cost.toFixed(2)}</p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default ReportsList;
