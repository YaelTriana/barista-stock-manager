import React, { useMemo, useState } from 'react';
import {
  FileBarChart2, ArrowDownCircle, ArrowUpCircle, AlertTriangle,
  Download, TrendingUp, TrendingDown, ChevronDown, ChevronRight,
  BarChart3, List, User, Tag,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { useInventoryStore } from '../../store/useInventoryStore';
import { useCurrentUser } from '../../contexts/UserContext';
import type { Movement } from '../../schemas/movement';

type HistoryView = 'daily' | 'detail';

// ─── helpers ───────────────────────────────────────────────────────────────

function prevMonthStr(month: string): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y!, m! - 1, 1);
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('es-MX', {
    weekday: 'short', day: 'numeric', month: 'short',
  });
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('es-MX', {
    hour: '2-digit', minute: '2-digit',
  });
}

function pctChange(current: number, prev: number): number | null {
  if (prev === 0) return null;
  return ((current - prev) / prev) * 100;
}

// ─── component ─────────────────────────────────────────────────────────────

export const ReportsList: React.FC = () => {
  const movements = useInventoryStore((s) => s.movements);
  const products  = useInventoryStore((s) => s.products);
  const showToast = useInventoryStore((s) => s.showToast);
  const { role } = useCurrentUser();
  const isAdmin = role === 'admin';

  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

  const [historyView, setHistoryView]   = useState<HistoryView>('daily');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set());

  // Resolve category: prefer denormalized field (Phase 2), fallback to products join
  const getCategory = (m: Movement): string =>
    m.category ?? products.find(p => p.id === m.productId)?.category ?? 'Sin categoría';

  // ── month movements ──────────────────────────────────────────────────────

  const prevMonth = useMemo(() => prevMonthStr(selectedMonth), [selectedMonth]);

  const currentMovements = useMemo(
    () => movements.filter(m => m.date.substring(0, 7) === selectedMonth),
    [movements, selectedMonth],
  );

  const prevMovements = useMemo(
    () => movements.filter(m => m.date.substring(0, 7) === prevMonth),
    [movements, prevMonth],
  );

  // ── summary totals ───────────────────────────────────────────────────────

  const { totalOut, totalIn } = useMemo(() => ({
    totalOut: currentMovements.filter(m => m.type === 'out').reduce((a, m) => a + m.cost, 0),
    totalIn:  currentMovements.filter(m => m.type === 'in').reduce((a, m) => a + m.cost, 0),
  }), [currentMovements]);

  const prevTotalOut = useMemo(
    () => prevMovements.filter(m => m.type === 'out').reduce((a, m) => a + m.cost, 0),
    [prevMovements],
  );

  const outChangePct = pctChange(totalOut, prevTotalOut);

  // ── low-stock alerts ─────────────────────────────────────────────────────

  const lowStock = useMemo(
    () => products
      .filter(p => p.currentQuantity <= p.minThreshold)
      .sort((a, b) => (a.currentQuantity / Math.max(a.minThreshold, 0.01)) - (b.currentQuantity / Math.max(b.minThreshold, 0.01))),
    [products],
  );

  // ── top 5 consumed ───────────────────────────────────────────────────────

  const top5 = useMemo(() => {
    const map = new Map<string, { name: string; qty: number; cost: number }>();
    for (const m of currentMovements) {
      if (m.type !== 'out') continue;
      const prev = map.get(m.productId) ?? { name: m.productName, qty: 0, cost: 0 };
      map.set(m.productId, { ...prev, qty: prev.qty + m.quantity, cost: prev.cost + m.cost });
    }
    return [...map.values()].sort((a, b) => b.cost - a.cost).slice(0, 5);
  }, [currentMovements]);

  const maxTop5Cost = Math.max(...top5.map(t => t.cost), 1);

  // ── category breakdown ───────────────────────────────────────────────────

  const categoryBreakdown = useMemo(() => {
    const map = new Map<string, { outCost: number; inCost: number; outQty: number }>();
    for (const m of currentMovements) {
      const cat = getCategory(m);
      const prev = map.get(cat) ?? { outCost: 0, inCost: 0, outQty: 0 };
      if (m.type === 'out') {
        map.set(cat, { ...prev, outCost: prev.outCost + m.cost, outQty: prev.outQty + m.quantity });
      } else {
        map.set(cat, { ...prev, inCost: prev.inCost + m.cost });
      }
    }
    return [...map.entries()]
      .map(([name, d]) => ({ name, ...d }))
      .sort((a, b) => b.outCost - a.outCost);
  }, [currentMovements, products]);

  // ── all categories for filter ────────────────────────────────────────────

  const allCategories = useMemo(() => {
    const set = new Set<string>();
    currentMovements.forEach(m => set.add(getCategory(m)));
    return [...set].sort();
  }, [currentMovements, products]);

  // ── filtered + grouped history ───────────────────────────────────────────

  const filteredMovements = useMemo(
    () => categoryFilter === 'all'
      ? currentMovements
      : currentMovements.filter(m => getCategory(m) === categoryFilter),
    [currentMovements, categoryFilter, products],
  );

  const dailyGroups = useMemo(() => {
    const map = new Map<string, { mvs: Movement[]; outCost: number; inCost: number }>();
    for (const m of filteredMovements) {
      const day = m.date.substring(0, 10);
      const prev = map.get(day) ?? { mvs: [], outCost: 0, inCost: 0 };
      map.set(day, {
        mvs: [...prev.mvs, m],
        outCost: prev.outCost + (m.type === 'out' ? m.cost : 0),
        inCost:  prev.inCost  + (m.type === 'in'  ? m.cost : 0),
      });
    }
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [filteredMovements]);

  const toggleDay = (day: string) =>
    setExpandedDays(prev => {
      const next = new Set(prev);
      next.has(day) ? next.delete(day) : next.add(day);
      return next;
    });

  // ── export Excel ─────────────────────────────────────────────────────────

  const handleExport = () => {
    const wb = XLSX.utils.book_new();

    // Sheet 1 — Resumen
    const ws1 = XLSX.utils.aoa_to_sheet([
      [`REPORTE MENSUAL — ${selectedMonth}`],
      [],
      ['RESUMEN FINANCIERO'],
      ['Consumo (Salidas)',    `$${totalOut.toFixed(2)}`],
      ['Inversión (Entradas)', `$${totalIn.toFixed(2)}`],
      ['Balance neto',         `$${(totalIn - totalOut).toFixed(2)}`],
      [],
      ['DESGLOSE POR CATEGORÍA'],
      ['Categoría', 'Consumo ($)', 'Inversión ($)'],
      ...categoryBreakdown.map(c => [c.name, c.outCost.toFixed(2), c.inCost.toFixed(2)]),
      [],
      ['TOP 5 MÁS CONSUMIDOS'],
      ['Producto', 'Cantidad', 'Costo ($)'],
      ...top5.map(t => [t.name, t.qty.toFixed(2), t.cost.toFixed(2)]),
    ]);
    ws1['!cols'] = [{ wch: 30 }, { wch: 15 }, { wch: 15 }];
    XLSX.utils.book_append_sheet(wb, ws1, 'Resumen');

    // Sheet 2 — Movimientos
    const ws2 = XLSX.utils.json_to_sheet(
      [...currentMovements]
        .sort((a, b) => b.date.localeCompare(a.date))
        .map(m => ({
          'Fecha':     new Date(m.date).toLocaleDateString('es-MX'),
          'Hora':      fmtTime(m.date),
          'Tipo':      m.type === 'in' ? 'Entrada' : 'Salida',
          'Producto':  m.productName,
          'Categoría': getCategory(m),
          'Cantidad':  m.quantity,
          'Costo ($)': m.cost.toFixed(2),
          ...(isAdmin ? { 'Registrado por': m.registeredBy ?? '—' } : {}),
        }))
    );
    ws2['!cols'] = [
      { wch: 12 }, { wch: 8 }, { wch: 10 },
      { wch: 24 }, { wch: 14 }, { wch: 10 }, { wch: 12 }, { wch: 18 },
    ];
    XLSX.utils.book_append_sheet(wb, ws2, 'Movimientos');

    // Sheet 3 — Alertas de stock
    const ws3 = XLSX.utils.json_to_sheet(
      products
        .map(p => ({
          'Producto':      p.name,
          'Categoría':     p.category,
          'Stock Actual':  p.currentQuantity,
          'Stock Mínimo':  p.minThreshold,
          'Unidad':        p.unit,
          'Estado':        p.currentQuantity === 0 ? 'SIN STOCK'
                         : p.currentQuantity <= p.minThreshold ? 'CRÍTICO'
                         : 'OK',
        }))
        .sort((a, b) => {
          const ra = a['Stock Actual'] / Math.max(a['Stock Mínimo'], 0.01);
          const rb = b['Stock Actual'] / Math.max(b['Stock Mínimo'], 0.01);
          return ra - rb;
        })
    );
    ws3['!cols'] = [{ wch: 24 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 8 }, { wch: 10 }];
    XLSX.utils.book_append_sheet(wb, ws3, 'Alertas de Stock');

    XLSX.writeFile(wb, `reporte_${selectedMonth}.xlsx`);
    showToast('Reporte Excel descargado');
  };

  // ── render ───────────────────────────────────────────────────────────────

  return (
    <div className="p-6 max-w-md mx-auto min-h-screen pb-24 space-y-6">

      {/* ── Header ── */}
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-coffee-brown text-cream p-2.5 rounded-2xl shadow-[0_4px_12px_rgba(92,61,46,0.15)]">
            <FileBarChart2 size={24} />
          </div>
          <h1 className="text-2xl font-serif text-coffee-dark">Reportes</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExport}
            disabled={currentMovements.length === 0}
            className="flex items-center gap-1.5 px-3 py-2 bg-white border border-wood-medium text-coffee-brown rounded-xl font-semibold text-sm hover:bg-wood-light transition-colors active:scale-95 min-h-[44px] disabled:opacity-40 disabled:cursor-not-allowed"
            title="Exportar reporte completo a Excel (3 hojas)"
          >
            <Download size={16} />
            Excel
          </button>
          <input
            type="month"
            value={selectedMonth}
            onChange={e => setSelectedMonth(e.target.value)}
            className="px-3 py-2 rounded-xl bg-white border border-wood-medium text-coffee-dark text-sm font-medium focus:outline-none focus:border-coffee-brown focus:ring-2 focus:ring-coffee-brown/20 min-h-[44px]"
            aria-label="Seleccionar mes"
          />
        </div>
      </header>

      {/* ── Summary Cards ── */}
      <section>
        <div className="grid grid-cols-3 gap-3">
          {/* Consumo */}
          <div className="bg-white p-4 rounded-[20px] shadow-[0_2px_8px_rgba(200,169,139,0.1)] border border-wood-light flex flex-col items-center text-center">
            <div className="p-2 bg-accent-red-bg rounded-xl mb-2">
              <ArrowDownCircle size={22} className="text-accent-red" />
            </div>
            <p className="text-[0.62rem] text-text-muted font-bold uppercase tracking-widest mb-1">Consumo</p>
            <p className="text-base font-bold text-coffee-dark leading-tight">${totalOut.toFixed(2)}</p>
            {outChangePct !== null && (
              <div className={`flex items-center gap-0.5 mt-1.5 text-[0.62rem] font-bold ${outChangePct > 0 ? 'text-accent-red' : 'text-accent-green'}`}>
                {outChangePct > 0 ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
                {Math.abs(outChangePct).toFixed(0)}% vs anterior
              </div>
            )}
          </div>

          {/* Inversión */}
          <div className="bg-white p-4 rounded-[20px] shadow-[0_2px_8px_rgba(200,169,139,0.1)] border border-wood-light flex flex-col items-center text-center">
            <div className="p-2 bg-accent-green-light rounded-xl mb-2">
              <ArrowUpCircle size={22} className="text-accent-green" />
            </div>
            <p className="text-[0.62rem] text-text-muted font-bold uppercase tracking-widest mb-1">Inversión</p>
            <p className="text-base font-bold text-coffee-dark leading-tight">${totalIn.toFixed(2)}</p>
          </div>

          {/* Balance */}
          <div className={`p-4 rounded-[20px] shadow-[0_2px_8px_rgba(200,169,139,0.1)] border flex flex-col items-center text-center ${
            totalIn - totalOut >= 0
              ? 'bg-accent-green-light border-accent-green/20'
              : 'bg-accent-red-bg border-accent-red/20'
          }`}>
            <div className={`p-2 rounded-xl mb-2 ${totalIn - totalOut >= 0 ? 'bg-accent-green/15' : 'bg-accent-red/15'}`}>
              {totalIn - totalOut >= 0
                ? <TrendingUp size={22} className="text-accent-green" />
                : <TrendingDown size={22} className="text-accent-red" />
              }
            </div>
            <p className="text-[0.62rem] text-text-muted font-bold uppercase tracking-widest mb-1">Balance</p>
            <p className={`text-base font-bold leading-tight ${totalIn - totalOut >= 0 ? 'text-accent-green' : 'text-accent-red'}`}>
              {totalIn - totalOut >= 0 ? '+' : ''}${(totalIn - totalOut).toFixed(2)}
            </p>
          </div>
        </div>
      </section>

      {/* ── Low Stock Alerts ── */}
      {lowStock.length > 0 && (
        <section className="bg-amber-50 border border-amber-200 rounded-2xl overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-amber-200">
            <AlertTriangle size={16} className="text-amber-600 shrink-0" />
            <span className="text-sm font-bold text-amber-700">
              {lowStock.length} producto{lowStock.length !== 1 ? 's' : ''} con stock bajo
            </span>
          </div>
          <div className="divide-y divide-amber-100">
            {lowStock.map(p => (
              <div key={p.id} className="flex items-center justify-between px-4 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-coffee-dark truncate">{p.name}</p>
                  <p className="text-xs text-text-muted">{p.category}</p>
                </div>
                <div className="text-right ml-3 shrink-0">
                  <p className={`text-sm font-bold ${p.currentQuantity === 0 ? 'text-accent-red' : 'text-amber-600'}`}>
                    {p.currentQuantity} {p.unit}
                  </p>
                  <p className="text-[0.65rem] text-text-muted">mín. {p.minThreshold}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Top 5 Consumed ── */}
      {top5.length > 0 && (
        <section>
          <h2 className="text-base font-bold text-coffee-dark mb-3 flex items-center gap-2">
            <BarChart3 size={16} className="text-coffee-brown" />
            Top 5 más consumidos
          </h2>
          <div className="bg-white rounded-2xl border border-wood-light shadow-[0_2px_8px_rgba(200,169,139,0.06)] p-4 space-y-3">
            {top5.map((item, i) => {
              const barPct = (item.cost / maxTop5Cost) * 100;
              return (
                <div key={item.name}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-[0.65rem] font-bold text-text-muted w-4 shrink-0">#{i + 1}</span>
                      <span className="text-sm font-semibold text-coffee-dark truncate">{item.name}</span>
                    </div>
                    <div className="text-right ml-2 shrink-0">
                      <span className="text-sm font-bold text-accent-red">${item.cost.toFixed(2)}</span>
                      <span className="text-[0.65rem] text-text-muted ml-1">({item.qty.toFixed(1)} u)</span>
                    </div>
                  </div>
                  <div className="h-2 bg-wood-light rounded-full overflow-hidden">
                    <div
                      className="h-full bg-coffee-brown rounded-full transition-all duration-500"
                      style={{ width: `${barPct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ── Category Breakdown ── */}
      {categoryBreakdown.length > 0 && (
        <section>
          <h2 className="text-base font-bold text-coffee-dark mb-3 flex items-center gap-2">
            <Tag size={16} className="text-coffee-brown" />
            Desglose por categoría
          </h2>
          <div className="bg-white rounded-2xl border border-wood-light shadow-[0_2px_8px_rgba(200,169,139,0.06)] overflow-hidden">
            {/* Header */}
            <div className="grid grid-cols-[1fr_auto_auto] gap-3 px-4 py-2.5 bg-cream border-b border-wood-light">
              <span className="text-[0.65rem] font-bold text-text-muted uppercase tracking-widest">Categoría</span>
              <span className="text-[0.65rem] font-bold text-text-muted uppercase tracking-widest text-right w-20">Consumo</span>
              <span className="text-[0.65rem] font-bold text-text-muted uppercase tracking-widest text-right w-20">Inversión</span>
            </div>
            <div className="divide-y divide-wood-light/60">
              {categoryBreakdown.map(c => (
                <div key={c.name} className="grid grid-cols-[1fr_auto_auto] gap-3 px-4 py-3 items-center">
                  <span className="text-sm font-semibold text-coffee-dark truncate">{c.name}</span>
                  <span className="text-sm font-bold text-accent-red text-right w-20">${c.outCost.toFixed(2)}</span>
                  <span className="text-sm font-bold text-accent-green text-right w-20">${c.inCost.toFixed(2)}</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── Movement History ── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-bold text-coffee-dark flex items-center gap-2">
            <List size={16} className="text-coffee-brown" />
            Historial del mes
          </h2>
          {/* View toggle */}
          <div className="flex items-center bg-cream rounded-xl p-0.5 border border-wood-light">
            <button
              onClick={() => setHistoryView('daily')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${historyView === 'daily' ? 'bg-white text-coffee-brown shadow-sm' : 'text-text-muted'}`}
            >
              Por día
            </button>
            <button
              onClick={() => setHistoryView('detail')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${historyView === 'detail' ? 'bg-white text-coffee-brown shadow-sm' : 'text-text-muted'}`}
            >
              Detalle
            </button>
          </div>
        </div>

        {/* Category filter chips */}
        {allCategories.length > 1 && (
          <div className="flex gap-2 overflow-x-auto pb-2 mb-3 no-scrollbar">
            <button
              onClick={() => setCategoryFilter('all')}
              className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap shrink-0 border transition-all ${
                categoryFilter === 'all'
                  ? 'bg-coffee-brown text-white border-coffee-brown'
                  : 'bg-white text-text-muted border-wood-medium hover:border-coffee-brown'
              }`}
            >
              Todas
            </button>
            {allCategories.map(cat => (
              <button
                key={cat}
                onClick={() => setCategoryFilter(cat)}
                className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap shrink-0 border transition-all ${
                  categoryFilter === cat
                    ? 'bg-coffee-brown text-white border-coffee-brown'
                    : 'bg-white text-text-muted border-wood-medium hover:border-coffee-brown'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        )}

        {filteredMovements.length === 0 ? (
          <div className="text-center py-8 text-text-muted font-medium bg-white rounded-2xl border border-wood-light border-dashed text-sm">
            No hay movimientos en este mes.
          </div>
        ) : historyView === 'daily' ? (
          /* ── Daily grouped view ── */
          <div className="space-y-2">
            {dailyGroups.map(([day, group]) => {
              const isOpen = expandedDays.has(day);
              return (
                <div key={day} className="bg-white rounded-2xl border border-wood-light overflow-hidden shadow-[0_1px_4px_rgba(200,169,139,0.07)]">
                  <button
                    className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-cream/60 transition-colors text-left"
                    onClick={() => toggleDay(day)}
                  >
                    <div className="flex items-center gap-3">
                      {isOpen ? <ChevronDown size={16} className="text-coffee-brown shrink-0" /> : <ChevronRight size={16} className="text-text-muted shrink-0" />}
                      <div>
                        <p className="text-sm font-bold text-coffee-dark capitalize">{fmtDate(day + 'T12:00:00')}</p>
                        <p className="text-xs text-text-muted mt-0.5">{group.mvs.length} movimiento{group.mvs.length !== 1 ? 's' : ''}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      {group.outCost > 0 && (
                        <p className="text-xs font-bold text-accent-red">-${group.outCost.toFixed(2)}</p>
                      )}
                      {group.inCost > 0 && (
                        <p className="text-xs font-bold text-accent-green">+${group.inCost.toFixed(2)}</p>
                      )}
                    </div>
                  </button>
                  {isOpen && (
                    <div className="border-t border-wood-light/60 divide-y divide-wood-light/40">
                      {group.mvs
                        .sort((a, b) => b.date.localeCompare(a.date))
                        .map(m => (
                          <div key={m.id} className="flex items-center gap-3 px-4 py-3">
                            <div className={`p-1.5 rounded-lg shrink-0 ${m.type === 'in' ? 'bg-accent-green-light text-accent-green' : 'bg-accent-red-bg text-accent-red'}`}>
                              {m.type === 'in' ? <ArrowUpCircle size={16} /> : <ArrowDownCircle size={16} />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-coffee-dark leading-tight truncate">{m.productName}</p>
                              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                <span className="text-[0.65rem] text-text-muted">{fmtTime(m.date)}</span>
                                {isAdmin && m.registeredBy && (
                                  <span className="flex items-center gap-0.5 text-[0.65rem] text-text-muted">
                                    <User size={9} />
                                    {m.registeredBy}
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="text-right shrink-0">
                              <p className={`text-sm font-bold ${m.type === 'in' ? 'text-accent-green' : 'text-accent-red'}`}>
                                {m.type === 'in' ? '+' : '-'}{m.quantity}
                              </p>
                              <p className="text-[0.65rem] text-text-muted">${m.cost.toFixed(2)}</p>
                            </div>
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          /* ── Detail view ── */
          <div className="space-y-2">
            {[...filteredMovements]
              .sort((a, b) => b.date.localeCompare(a.date))
              .map(m => (
                <div key={m.id} className="bg-white p-4 rounded-2xl border border-wood-light shadow-[0_1px_4px_rgba(200,169,139,0.07)] flex items-center gap-3">
                  <div className={`p-2 rounded-xl shrink-0 ${m.type === 'in' ? 'bg-accent-green-light text-accent-green' : 'bg-accent-red-bg text-accent-red'}`}>
                    {m.type === 'in' ? <ArrowUpCircle size={18} /> : <ArrowDownCircle size={18} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-coffee-dark leading-tight truncate">{m.productName}</p>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <span className="text-[0.65rem] text-text-muted">
                        {fmtDate(m.date)} · {fmtTime(m.date)}
                      </span>
                      {isAdmin && m.registeredBy && (
                        <span className="flex items-center gap-0.5 text-[0.65rem] text-text-muted">
                          <User size={9} />
                          {m.registeredBy}
                        </span>
                      )}
                      {getCategory(m) !== 'Sin categoría' && (
                        <span className="text-[0.65rem] text-text-muted">{getCategory(m)}</span>
                      )}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className={`font-bold text-base leading-tight ${m.type === 'in' ? 'text-accent-green' : 'text-accent-red'}`}>
                      {m.type === 'in' ? '+' : '-'}{m.quantity}
                    </p>
                    <p className="text-xs text-text-muted">${m.cost.toFixed(2)}</p>
                  </div>
                </div>
              ))}
          </div>
        )}
      </section>

    </div>
  );
};

export default ReportsList;
