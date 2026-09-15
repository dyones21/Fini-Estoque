import React, { useState, useMemo } from 'react';
import { Trophy, Boxes, Layers } from 'lucide-react';
import { useStock } from '../context/StockContext';
import { formatCurrency } from '../utils/inventoryUtils';
import { exportToExcel, exportToCSV } from '../utils/exportUtils';
import { ExportButton } from './ExportButton';

export const RankingView: React.FC = () => {
  const { products, movements } = useStock();
  const [metricMode, setMetricMode] = useState<'saida_baleiro' | 'capital_imobilizado'>('saida_baleiro');
  const [subMetric, setSubMetric] = useState<'valor' | 'quantidade'>('valor');

  // Compute metrics for each product based on real movements or physical stock
  const productsWithMetrics = useMemo(() => {
    // 1. Calculate output to baleiro (venda_loja) per product
    const outputUnitsByProduct: Record<string, number> = {};
    for (const m of movements) {
      const t = (m.type || '').toLowerCase();
      if (t === 'venda_loja' || t === 'venda' || t === 'saida_baleiro' || t === 'saida_loja') {
        outputUnitsByProduct[m.productId] = (outputUnitsByProduct[m.productId] || 0) + (Number(m.quantity) || 0);
      }
    }

    return products.map((p) => {
      const outputUnits = outputUnitsByProduct[p.id] || 0;
      const sellPrice = Number(p.sellPrice) || 0;
      const estimatedOutputValue = outputUnits * sellPrice;

      const depStock = Number(p.stockDeposito) || 0;
      const lojStock = Number(p.stockLoja) || 0;
      const totalStock = depStock + lojStock;
      const unitCost = Number(p.costPrice) > 0 ? Number(p.costPrice) : sellPrice;
      const stockValue = totalStock * unitCost;

      return {
        ...p,
        outputUnits,
        sellPrice,
        estimatedOutputValue,
        totalStock,
        depStock,
        lojStock,
        unitCost,
        stockValue,
      };
    });
  }, [products, movements]);

  const isSaidaBaleiro = metricMode === 'saida_baleiro';

  // Sorted product list for ranking
  const rankedProducts = useMemo(() => {
    const list = [...productsWithMetrics];
    if (isSaidaBaleiro) {
      if (subMetric === 'valor') {
        list.sort((a, b) => b.estimatedOutputValue - a.estimatedOutputValue || b.outputUnits - a.outputUnits);
      } else {
        list.sort((a, b) => b.outputUnits - a.outputUnits || b.estimatedOutputValue - a.estimatedOutputValue);
      }
    } else {
      if (subMetric === 'valor') {
        list.sort((a, b) => b.stockValue - a.stockValue || b.totalStock - a.totalStock);
      } else {
        list.sort((a, b) => b.totalStock - a.totalStock || b.stockValue - a.stockValue);
      }
    }
    return list;
  }, [productsWithMetrics, isSaidaBaleiro, subMetric]);

  const maxVal = useMemo(() => {
    if (rankedProducts.length === 0) return 1;
    const top = rankedProducts[0];
    if (isSaidaBaleiro) {
      return subMetric === 'valor' ? top.estimatedOutputValue : top.outputUnits;
    }
    return subMetric === 'valor' ? top.stockValue : top.totalStock;
  }, [rankedProducts, isSaidaBaleiro, subMetric]);

  const handleExportExcel = () => {
    const dateStr = new Date().toISOString().slice(0, 10);
    if (isSaidaBaleiro) {
      const data = rankedProducts.map((p, idx) => ({
        Posição: `${idx + 1}º`,
        SKU: p.sku,
        'Cód. Barras (EAN)': p.ean || p.codeEAN || '',
        Produto: p.name,
        Categoria: p.category,
        Unidade: p.unit,
        'Saída p/ Baleiro (un)': p.outputUnits,
        'Preço de Venda Base (R$)': Number(p.sellPrice.toFixed(2)),
        'Valor Estimado de Saída (R$)': Number(p.estimatedOutputValue.toFixed(2)),
        'Estoque Loja (un)': p.lojStock,
        'Estoque Depósito (un)': p.depStock,
      }));
      exportToExcel(data, `ranking_saida_baleiro_${subMetric}_${dateStr}`, 'Ranking Giro');
    } else {
      const data = rankedProducts.map((p, idx) => ({
        Posição: `${idx + 1}º`,
        SKU: p.sku,
        'Cód. Barras (EAN)': p.ean || p.codeEAN || '',
        Produto: p.name,
        Categoria: p.category,
        Unidade: p.unit,
        'Estoque Total (un)': p.totalStock,
        'Estoque Depósito (un)': p.depStock,
        'Estoque Loja (un)': p.lojStock,
        'Valor Unitário Base (R$)': Number(p.unitCost.toFixed(2)),
        'Capital Imobilizado (R$)': Number(p.stockValue.toFixed(2)),
      }));
      exportToExcel(data, `ranking_capital_imobilizado_${subMetric}_${dateStr}`, 'Ranking Estoque');
    }
  };

  const handleExportCSV = () => {
    const dateStr = new Date().toISOString().slice(0, 10);
    if (isSaidaBaleiro) {
      const headers = [
        'Posição',
        'SKU',
        'EAN',
        'Produto',
        'Categoria',
        'Unidade',
        'Saída p/ Baleiro (un)',
        'Preço de Venda Base (R$)',
        'Valor Estimado de Saída (R$)',
        'Estoque Loja (un)',
        'Estoque Depósito (un)',
      ];
      const rows = rankedProducts.map((p, idx) => [
        `${idx + 1}º`,
        p.sku,
        p.ean || p.codeEAN || '',
        p.name,
        p.category,
        p.unit,
        p.outputUnits,
        p.sellPrice.toFixed(2),
        p.estimatedOutputValue.toFixed(2),
        p.lojStock,
        p.depStock,
      ]);
      exportToCSV(headers, rows, `ranking_saida_baleiro_${subMetric}_${dateStr}`);
    } else {
      const headers = [
        'Posição',
        'SKU',
        'EAN',
        'Produto',
        'Categoria',
        'Unidade',
        'Estoque Total (un)',
        'Estoque Depósito (un)',
        'Estoque Loja (un)',
        'Valor Unitário Base (R$)',
        'Capital Imobilizado (R$)',
      ];
      const rows = rankedProducts.map((p, idx) => [
        `${idx + 1}º`,
        p.sku,
        p.ean || p.codeEAN || '',
        p.name,
        p.category,
        p.unit,
        p.totalStock,
        p.depStock,
        p.lojStock,
        p.unitCost.toFixed(2),
        p.stockValue.toFixed(2),
      ]);
      exportToCSV(headers, rows, `ranking_capital_imobilizado_${subMetric}_${dateStr}`);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      
      {/* Title & Metric Switcher & Export */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-2xl bg-amber-50 text-amber-600 border border-amber-200">
            <Trophy className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-black text-slate-900">
                {isSaidaBaleiro ? 'Ranking de Saída para o Baleiro (Giro)' : 'Ranking de Produtos em Estoque'}
              </h2>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${
                isSaidaBaleiro ? 'bg-rose-100 text-rose-800' : 'bg-slate-100 text-slate-800'
              }`}>
                {isSaidaBaleiro ? 'Giro Real de Saída' : 'Estoque Físico'}
              </span>
            </div>
            <p className="text-xs text-slate-500">
              {isSaidaBaleiro
                ? 'Classificação por movimentações reais de saída da caixa fechada para o baleiro de exposição na loja'
                : 'Acompanhe os produtos com maior capital imobilizado e volume físico em estoque'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Mode Switcher */}
          <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200">
            <button
              onClick={() => setMetricMode('saida_baleiro')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                isSaidaBaleiro
                  ? 'bg-white text-rose-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Boxes className="w-3.5 h-3.5" />
              Saída p/ Baleiro
            </button>
            <button
              onClick={() => setMetricMode('capital_imobilizado')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                !isSaidaBaleiro
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              Capital Imobilizado
            </button>
          </div>

          {/* Sub-Metric Toggle */}
          <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200">
            <button
              onClick={() => setSubMetric('valor')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                subMetric === 'valor'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {isSaidaBaleiro ? 'Por Valor Estimado (R$)' : 'Por Capital (R$)'}
            </button>
            <button
              onClick={() => setSubMetric('quantidade')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                subMetric === 'quantidade'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {isSaidaBaleiro ? 'Por Qtd Saída (un)' : 'Por Qtd Físico (un)'}
            </button>
          </div>

          {/* Export Button */}
          <ExportButton
            onExportExcel={handleExportExcel}
            onExportCSV={handleExportCSV}
            label="Exportar Ranking"
          />
        </div>
      </div>

      {/* Top 3 Medals Podia */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {rankedProducts.slice(0, 3).map((prod, idx) => {
          const isGold = idx === 0;
          const isSilver = idx === 1;

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
                    {isSaidaBaleiro ? 'Valor Estimado de Saída' : 'Capital Imobilizado'}
                  </p>
                  <p className={`text-lg font-black ${isSaidaBaleiro ? 'text-rose-700' : 'text-emerald-700'}`}>
                    {formatCurrency(isSaidaBaleiro ? prod.estimatedOutputValue : prod.stockValue)}
                  </p>
                </div>

                <div className="text-right">
                  <p className="text-[10px] text-slate-500 uppercase font-bold">
                    {isSaidaBaleiro ? 'Saída p/ Baleiro' : 'Estoque Total'}
                  </p>
                  <p className="text-sm font-black text-slate-900">
                    {isSaidaBaleiro ? `${prod.outputUnits} un` : `${prod.totalStock} un`}
                  </p>
                  <p className="text-[10px] text-slate-400 font-medium">
                    {isSaidaBaleiro
                      ? `Preço: ${formatCurrency(prod.sellPrice)}`
                      : `Dep: ${prod.depStock} | Loja: ${prod.lojStock}`}
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
          {isSaidaBaleiro
            ? `Lista Completa de Produtos por Giro de Saída para o Baleiro (${rankedProducts.length} itens)`
            : `Lista Completa de Produtos por Estoque Físico (${rankedProducts.length} itens)`}
        </h3>

        <div className="space-y-4">
          {rankedProducts.map((p, idx) => {
            let currentVal = 0;
            if (isSaidaBaleiro) {
              currentVal = subMetric === 'valor' ? p.estimatedOutputValue : p.outputUnits;
            } else {
              currentVal = subMetric === 'valor' ? p.stockValue : p.totalStock;
            }
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
                    {isSaidaBaleiro ? (
                      <>
                        <span className="text-slate-600 font-bold text-[11px]">
                          {p.outputUnits} un saídas
                        </span>
                        <span className="font-bold text-rose-700 text-xs">
                          {formatCurrency(p.estimatedOutputValue)}
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="text-slate-500 text-[11px]">
                          {p.totalStock} un (D:{p.depStock} / L:{p.lojStock})
                        </span>
                        <span className="font-bold text-emerald-700 text-xs">
                          {formatCurrency(p.stockValue)}
                        </span>
                      </>
                    )}
                  </div>
                </div>

                {/* Progress bar */}
                <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
                  <div
                    style={{ width: `${pct}%` }}
                    className={`h-full rounded-full transition-all duration-500 ${
                      isSaidaBaleiro
                        ? 'bg-gradient-to-r from-rose-500 to-amber-500'
                        : 'bg-gradient-to-r from-emerald-500 to-teal-500'
                    }`}
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
