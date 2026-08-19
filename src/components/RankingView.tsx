import React, { useState, useMemo } from 'react';
import { Trophy, Flame, ShoppingBag, ArrowUpRight, Award } from 'lucide-react';
import { useStock } from '../context/StockContext';
import { formatCurrency } from '../utils/inventoryUtils';

export const RankingView: React.FC = () => {
  const { products } = useStock();
  const [metric, setMetric] = useState<'faturamento' | 'quantidade'>('faturamento');

  // Sorted product list for ranking
  const rankedProducts = useMemo(() => {
    const list = [...products];
    if (metric === 'faturamento') {
      list.sort((a, b) => b.totalSalesValue - a.totalSalesValue);
    } else {
      list.sort((a, b) => b.totalSalesQuantity - a.totalSalesQuantity);
    }
    return list;
  }, [products, metric]);

  const maxVal = useMemo(() => {
    if (rankedProducts.length === 0) return 1;
    return metric === 'faturamento'
      ? rankedProducts[0].totalSalesValue
      : rankedProducts[0].totalSalesQuantity;
  }, [rankedProducts, metric]);

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      
      {/* Title & Metric Switcher */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-2xl bg-amber-50 text-amber-600 border border-amber-200">
            <Trophy className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-black text-slate-900">
                Ranking de Saída de Produtos (Giro Fini)
              </h2>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-800 uppercase">
                Top Vendas
              </span>
            </div>
            <p className="text-xs text-slate-500">
              Acompanhe os campeões de vendas e saída de estoque em Nova Friburgo
            </p>
          </div>
        </div>

        {/* Toggle metric */}
        <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200">
          <button
            onClick={() => setMetric('faturamento')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              metric === 'faturamento'
                ? 'bg-white text-rose-600 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Por Faturamento (R$)
          </button>
          <button
            onClick={() => setMetric('quantidade')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              metric === 'quantidade'
                ? 'bg-white text-rose-600 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Por Unidades Vendidas
          </button>
        </div>
      </div>

      {/* Top 3 Medals Podia */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {rankedProducts.slice(0, 3).map((prod, idx) => {
          const isGold = idx === 0;
          const isSilver = idx === 1;
          const isBronze = idx === 2;

          return (
            <div
              key={prod.id}
              className={`p-5 rounded-3xl border relative overflow-hidden flex flex-col justify-between ${
                isGold
                  ? 'bg-gradient-to-br from-amber-500/10 via-amber-100/50 to-amber-50 border-amber-300 ring-2 ring-amber-400/20'
                  : isSilver
                  ? 'bg-gradient-to-br from-slate-200/50 via-slate-100 to-white border-slate-300'
                  : 'bg-gradient-to-br from-orange-100/40 via-amber-50/30 to-white border-amber-200'
              }`}
            >
              <div className="flex items-center justify-between mb-3">
                <span
                  className={`w-8 h-8 rounded-full flex items-center justify-center font-black text-sm text-white shadow-md ${
                    isGold
                      ? 'bg-amber-500'
                      : isSilver
                      ? 'bg-slate-500'
                      : 'bg-amber-700'
                  }`}
                >
                  #{idx + 1}
                </span>

                <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-white/80 text-slate-700 border border-slate-200">
                  {prod.category}
                </span>
              </div>

              <div>
                <h3 className="text-base font-extrabold text-slate-900 leading-tight">
                  {prod.name}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  SKU: {prod.sku} • {prod.unit}
                </p>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-200/60 flex items-center justify-between">
                <div>
                  <p className="text-[10px] text-slate-500 uppercase font-bold">
                    Faturamento Gerado
                  </p>
                  <p className="text-lg font-black text-rose-600">
                    {formatCurrency(prod.totalSalesValue)}
                  </p>
                </div>

                <div className="text-right">
                  <p className="text-[10px] text-slate-500 uppercase font-bold">
                    Saídas
                  </p>
                  <p className="text-sm font-black text-slate-900">
                    {prod.totalSalesQuantity} un
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Complete Ranking List with Progress Bars */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 space-y-4">
        <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider border-b border-slate-100 pb-2">
          Lista Completa de Desempenho
        </h3>

        <div className="space-y-4">
          {rankedProducts.map((p, idx) => {
            const currentVal = metric === 'faturamento' ? p.totalSalesValue : p.totalSalesQuantity;
            const pct = Math.max(2, Math.round((currentVal / (maxVal || 1)) * 100));

            return (
              <div key={p.id} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className="w-5 font-black text-slate-400 text-[11px]">
                      #{idx + 1}
                    </span>
                    <span className="font-bold text-slate-900">{p.name}</span>
                    <span className="text-[10px] text-slate-400 hidden sm:inline">
                      ({p.category})
                    </span>
                  </div>

                  <div className="flex items-center gap-3 font-mono">
                    <span className="text-slate-500 text-[11px]">
                      {p.totalSalesQuantity} un
                    </span>
                    <span className="font-bold text-rose-600 text-xs">
                      {formatCurrency(p.totalSalesValue)}
                    </span>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
                  <div
                    style={{ width: `${pct}%` }}
                    className="h-full bg-gradient-to-r from-rose-500 to-amber-500 rounded-full transition-all duration-500"
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

    </div>
  );
};
