import React, { useState, useMemo } from 'react';
import {
  TrendingUp,
  BarChart3,
  Award,
  AlertCircle,
  HelpCircle,
  Filter,
  Boxes,
  Layers,
} from 'lucide-react';
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from 'recharts';
import { useStock } from '../context/StockContext';
import { calculateCurvaABC, formatCurrency } from '../utils/inventoryUtils';
import { exportToExcel, exportToCSV } from '../utils/exportUtils';
import { ExportButton } from './ExportButton';

export const CurvaABCView: React.FC = () => {
  const { products, movements } = useStock();
  const [metricMode, setMetricMode] = useState<'saida_baleiro' | 'capital_imobilizado'>('saida_baleiro');
  const [selectedClass, setSelectedClass] = useState<'todos' | 'A' | 'B' | 'C'>('todos');

  // Compute ABC according to selected mode
  const abcList = useMemo(
    () => calculateCurvaABC(products, movements, metricMode),
    [products, movements, metricMode]
  );

  // Totals & counts
  const totalRevenueAll = abcList.reduce((acc, i) => acc + i.totalRevenue, 0);
  const totalUnitsAll = abcList.reduce((acc, i) => acc + (i.totalOutputUnits || 0), 0);

  const countA = abcList.filter((i) => i.classABC === 'A').length;
  const countB = abcList.filter((i) => i.classABC === 'B').length;
  const countC = abcList.filter((i) => i.classABC === 'C').length;

  const revA = abcList
    .filter((i) => i.classABC === 'A')
    .reduce((acc, i) => acc + i.totalRevenue, 0);
  const revB = abcList
    .filter((i) => i.classABC === 'B')
    .reduce((acc, i) => acc + i.totalRevenue, 0);
  const revC = abcList
    .filter((i) => i.classABC === 'C')
    .reduce((acc, i) => acc + i.totalRevenue, 0);

  const unitsA = abcList
    .filter((i) => i.classABC === 'A')
    .reduce((acc, i) => acc + (i.totalOutputUnits || 0), 0);
  const unitsB = abcList
    .filter((i) => i.classABC === 'B')
    .reduce((acc, i) => acc + (i.totalOutputUnits || 0), 0);
  const unitsC = abcList
    .filter((i) => i.classABC === 'C')
    .reduce((acc, i) => acc + (i.totalOutputUnits || 0), 0);

  // Chart Data
  const chartData = useMemo(() => {
    return abcList.map((item) => ({
      name: item.product.name.split(' ')[1]
        ? `${item.product.name.split(' ')[0]} ${item.product.name.split(' ')[1]}`
        : item.product.name,
      valorMetrica: item.totalRevenue,
      acumuladoPct: item.cumulativePercentage,
      classe: item.classABC,
    }));
  }, [abcList]);

  const filteredList = useMemo(() => {
    if (selectedClass === 'todos') return abcList;
    return abcList.filter((i) => i.classABC === selectedClass);
  }, [abcList, selectedClass]);

  const isSaidaBaleiro = metricMode === 'saida_baleiro';
  const metricLabel = isSaidaBaleiro ? 'Valor Estimado de Saída' : 'Capital Imobilizado';

  const handleExportExcel = () => {
    const data = filteredList.map((item) => {
      const baseRow: Record<string, any> = {
        Classe: item.classABC,
        SKU: item.product.sku,
        'Cód. Barras (EAN)': item.product.ean || item.product.codeEAN || '',
        Produto: item.product.name,
        Categoria: item.product.category,
        Unidade: item.product.unit,
      };

      if (isSaidaBaleiro) {
        baseRow['Saída p/ Baleiro (un)'] = item.totalOutputUnits || 0;
        baseRow['Preço de Venda Base (R$)'] = Number((Number(item.product.sellPrice) || 0).toFixed(2));
        baseRow['Valor Estimado de Saída (R$)'] = Number(item.totalRevenue.toFixed(2));
      } else {
        baseRow['Estoque Total (un)'] = item.product.stockLoja + item.product.stockDeposito;
        baseRow['Custo Base (R$)'] = Number((Number(item.product.costPrice) || 0).toFixed(2));
        baseRow['Capital Imobilizado (R$)'] = Number(item.totalRevenue.toFixed(2));
      }

      baseRow['% do Total'] = `${item.revenuePercentage.toFixed(2)}%`;
      baseRow['% Acumulada'] = `${item.cumulativePercentage.toFixed(2)}%`;
      baseRow['Estoque Loja'] = item.product.stockLoja;
      baseRow['Estoque Depósito'] = item.product.stockDeposito;

      return baseRow;
    });

    const dateStr = new Date().toISOString().slice(0, 10);
    const prefix = isSaidaBaleiro ? 'curva_abc_saida_baleiro' : 'curva_abc_capital_imobilizado';
    exportToExcel(data, `${prefix}_classe_${selectedClass}_${dateStr}`, 'Curva ABC');
  };

  const handleExportCSV = () => {
    const headers = isSaidaBaleiro
      ? [
          'Classe',
          'SKU',
          'EAN',
          'Produto',
          'Categoria',
          'Unidade',
          'Saída p/ Baleiro (un)',
          'Preço Venda (R$)',
          'Valor Estimado de Saída (R$)',
          '% do Total',
          '% Acumulada',
          'Estoque Loja',
          'Estoque Depósito',
        ]
      : [
          'Classe',
          'SKU',
          'EAN',
          'Produto',
          'Categoria',
          'Unidade',
          'Estoque Total (un)',
          'Capital Imobilizado (R$)',
          '% do Total',
          '% Acumulada',
          'Estoque Loja',
          'Estoque Depósito',
        ];

    const rows = filteredList.map((item) => {
      if (isSaidaBaleiro) {
        return [
          item.classABC,
          item.product.sku,
          item.product.ean || item.product.codeEAN || '',
          item.product.name,
          item.product.category,
          item.product.unit,
          item.totalOutputUnits || 0,
          (Number(item.product.sellPrice) || 0).toFixed(2),
          item.totalRevenue.toFixed(2),
          `${item.revenuePercentage.toFixed(2)}%`,
          `${item.cumulativePercentage.toFixed(2)}%`,
          item.product.stockLoja,
          item.product.stockDeposito,
        ];
      }
      return [
        item.classABC,
        item.product.sku,
        item.product.ean || item.product.codeEAN || '',
        item.product.name,
        item.product.category,
        item.product.unit,
        item.product.stockLoja + item.product.stockDeposito,
        item.totalRevenue.toFixed(2),
        `${item.revenuePercentage.toFixed(2)}%`,
        `${item.cumulativePercentage.toFixed(2)}%`,
        item.product.stockLoja,
        item.product.stockDeposito,
      ];
    });

    const dateStr = new Date().toISOString().slice(0, 10);
    const prefix = isSaidaBaleiro ? 'curva_abc_saida_baleiro' : 'curva_abc_capital_imobilizado';
    exportToCSV(headers, rows, `${prefix}_classe_${selectedClass}_${dateStr}`);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      
      {/* Title & Info Banner & Mode Switcher */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-2xl bg-rose-50 text-rose-600 border border-rose-200">
            <TrendingUp className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-black text-slate-900">
                {isSaidaBaleiro ? 'Curva ABC — Giro de Saída para o Baleiro' : 'Curva ABC — Capital Imobilizado em Estoque'}
              </h2>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${
                isSaidaBaleiro ? 'bg-rose-100 text-rose-800' : 'bg-slate-100 text-slate-800'
              }`}>
                {isSaidaBaleiro ? 'Giro Real p/ Exposição' : 'Estoque Físico'}
              </span>
            </div>
            <p className="text-xs text-slate-500">
              {isSaidaBaleiro
                ? 'Classificação estratégica de produtos por volume de saída para o baleiro e valor estimado de saída (Preço Venda × Qtd)'
                : 'Classificação estratégica dos produtos por relevância de capital imobilizado em estoque (Depósito + Loja)'}
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
              Saída para Baleiro (Giro)
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

          <ExportButton
            onExportExcel={handleExportExcel}
            onExportCSV={handleExportCSV}
            label="Exportar Curva ABC"
          />
        </div>
      </div>

      {/* Class A, B, C Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        
        {/* Class A Card */}
        <div
          onClick={() => setSelectedClass(selectedClass === 'A' ? 'todos' : 'A')}
          className={`p-5 rounded-2xl border cursor-pointer transition-all ${
            selectedClass === 'A'
              ? 'bg-emerald-50/80 border-emerald-400 ring-2 ring-emerald-500/20 shadow-md'
              : 'bg-white border-slate-200 hover:border-emerald-300'
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-black text-emerald-800 uppercase tracking-wider flex items-center gap-1.5">
              <Award className="w-4 h-4 text-emerald-600" /> CLASSE A ({isSaidaBaleiro ? 'Alto Giro' : 'Alto Impacto'})
            </span>
            <span className="text-xs font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">
              {countA} SKUs
            </span>
          </div>
          <p className="text-2xl font-black text-slate-900">
            {formatCurrency(revA)}
          </p>
          <p className="text-xs text-emerald-700 font-semibold mt-1">
            Representa ~80% do {metricLabel}
          </p>
          {isSaidaBaleiro && (
            <p className="text-xs font-bold text-slate-700 mt-1">
              {unitsA} un saídas p/ baleiro
            </p>
          )}
          <p className="text-[11px] text-slate-500 mt-2 leading-relaxed">
            {isSaidaBaleiro
              ? 'Maior saída para o baleiro. Itens de altíssimo giro que exigem reposição constante na loja.'
              : 'Maior capital imobilizado. Itens de alto valor financeiro que exigem máximo rigor de controle.'}
          </p>
        </div>

        {/* Class B Card */}
        <div
          onClick={() => setSelectedClass(selectedClass === 'B' ? 'todos' : 'B')}
          className={`p-5 rounded-2xl border cursor-pointer transition-all ${
            selectedClass === 'B'
              ? 'bg-amber-50/80 border-amber-400 ring-2 ring-amber-500/20 shadow-md'
              : 'bg-white border-slate-200 hover:border-amber-300'
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-black text-amber-800 uppercase tracking-wider flex items-center gap-1.5">
              <BarChart3 className="w-4 h-4 text-amber-600" /> CLASSE B ({isSaidaBaleiro ? 'Médio Giro' : 'Médio Impacto'})
            </span>
            <span className="text-xs font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-800">
              {countB} SKUs
            </span>
          </div>
          <p className="text-2xl font-black text-slate-900">
            {formatCurrency(revB)}
          </p>
          <p className="text-xs text-amber-700 font-semibold mt-1">
            Representa ~15% do {metricLabel}
          </p>
          {isSaidaBaleiro && (
            <p className="text-xs font-bold text-slate-700 mt-1">
              {unitsB} un saídas p/ baleiro
            </p>
          )}
          <p className="text-[11px] text-slate-500 mt-2 leading-relaxed">
            {isSaidaBaleiro
              ? 'Produtos com giro intermediário para o baleiro. Manter reposição programada.'
              : 'Impacto financeiro intermediário. Manter monitoramento contínuo entre Depósito e Loja.'}
          </p>
        </div>

        {/* Class C Card */}
        <div
          onClick={() => setSelectedClass(selectedClass === 'C' ? 'todos' : 'C')}
          className={`p-5 rounded-2xl border cursor-pointer transition-all ${
            selectedClass === 'C'
              ? 'bg-slate-100 border-slate-400 ring-2 ring-slate-500/20 shadow-md'
              : 'bg-white border-slate-200 hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-black text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
              <Filter className="w-4 h-4 text-slate-500" /> CLASSE C ({isSaidaBaleiro ? 'Baixo Giro' : 'Baixo Impacto'})
            </span>
            <span className="text-xs font-bold px-2 py-0.5 rounded bg-slate-200 text-slate-800">
              {countC} SKUs
            </span>
          </div>
          <p className="text-2xl font-black text-slate-900">
            {formatCurrency(revC)}
          </p>
          <p className="text-xs text-slate-600 font-semibold mt-1">
            Representa ~5% do {metricLabel}
          </p>
          {isSaidaBaleiro && (
            <p className="text-xs font-bold text-slate-700 mt-1">
              {unitsC} un saídas p/ baleiro
            </p>
          )}
          <p className="text-[11px] text-slate-500 mt-2 leading-relaxed">
            {isSaidaBaleiro
              ? 'Menor saída para o baleiro. Atenção redobrada a lotes e prazos de validade devido à baixa rotatividade.'
              : 'Menor peso financeiro. Manter controle ágil e atenção a lotes e prazos de validade.'}
          </p>
        </div>

      </div>

      {/* Interactive Pareto Chart */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        <div className="mb-4">
          <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
            Gráfico de Curva de Pareto ({metricLabel} vs Acumulado %)
          </h3>
          <p className="text-xs text-slate-500">
            {isSaidaBaleiro
              ? 'Barras representam o valor estimado de saída para o baleiro por produto e a linha representa o % acumulado de Pareto'
              : 'Barras representam o capital imobilizado por produto e a linha representa o % acumulado'}
          </p>
        </div>

        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 10, right: 20, left: 10, bottom: 25 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-20} textAnchor="end" />
              <YAxis yAxisId="left" tick={{ fontSize: 10 }} />
              <YAxis yAxisId="right" orientation="right" domain={[0, 100]} unit="%" tick={{ fontSize: 10 }} />
              <Tooltip
                formatter={(value: any, name: string) => {
                  if (name === metricLabel) return [formatCurrency(Number(value)), metricLabel];
                  return [`${value}%`, 'Acumulado %'];
                }}
                contentStyle={{ borderRadius: '12px', fontSize: '12px' }}
              />
              <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
              <Bar
                yAxisId="left"
                dataKey="valorMetrica"
                name={metricLabel}
                fill={isSaidaBaleiro ? '#e11d48' : '#059669'}
                radius={[4, 4, 0, 0]}
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="acumuladoPct"
                name="Acumulado %"
                stroke="#6366f1"
                strokeWidth={3}
                dot={{ r: 4 }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Filtered Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <h3 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider">
            Tabela Detalhada do Ranking ABC ({filteredList.length} itens)
          </h3>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-500">Filtrar Classe:</span>
            <select
              value={selectedClass}
              onChange={(e) => setSelectedClass(e.target.value as any)}
              className="text-xs font-bold py-1 px-2.5 rounded-lg border border-slate-200 bg-white"
            >
              <option value="todos">Todas (A, B, C)</option>
              <option value="A">Classe A</option>
              <option value="B">Classe B</option>
              <option value="C">Classe C</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50/80 text-slate-500 font-bold uppercase text-[10px] border-b border-slate-200">
              <tr>
                <th className="py-3 px-4">Classe</th>
                <th className="py-3 px-4">Produto</th>
                {isSaidaBaleiro && (
                  <th className="py-3 px-4 text-center">Saída p/ Baleiro (un)</th>
                )}
                <th className="py-3 px-4 text-center">{metricLabel}</th>
                <th className="py-3 px-4 text-center">% do Total</th>
                <th className="py-3 px-4 text-center">% Acumulada</th>
                <th className="py-3 px-4 text-center">Estoque Atual (Dep + Loja)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredList.map((item) => (
                <tr key={item.product.id} className="hover:bg-slate-50">
                  <td className="py-3 px-4">
                    <span
                      className={`inline-block px-2.5 py-0.5 rounded font-black text-xs ${
                        item.classABC === 'A'
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                          : item.classABC === 'B'
                          ? 'bg-amber-100 text-amber-800 border border-amber-300'
                          : 'bg-slate-100 text-slate-700 border border-slate-300'
                      }`}
                    >
                      Classe {item.classABC}
                    </span>
                  </td>
                  <td className="py-3 px-4 font-bold text-slate-900">
                    {item.product.name}
                    <span className="block text-[10px] font-normal text-slate-400">
                      SKU: {item.product.sku} • {item.product.category}
                      {isSaidaBaleiro && item.product.sellPrice ? ` • Preço Venda: ${formatCurrency(item.product.sellPrice)}` : ''}
                    </span>
                  </td>
                  {isSaidaBaleiro && (
                    <td className="py-3 px-4 text-center font-black text-rose-700">
                      {item.totalOutputUnits || 0} un
                    </td>
                  )}
                  <td className="py-3 px-4 text-center font-bold text-slate-900">
                    {formatCurrency(item.totalRevenue)}
                  </td>
                  <td className="py-3 px-4 text-center font-semibold text-slate-700">
                    {item.revenuePercentage}%
                  </td>
                  <td className="py-3 px-4 text-center font-extrabold text-rose-600">
                    {item.cumulativePercentage}%
                  </td>
                  <td className="py-3 px-4 text-center">
                    <span className="font-bold text-sky-800">
                      Dep: {item.product.stockDeposito}
                    </span>{' '}
                    +{' '}
                    <span className="font-bold text-amber-800">
                      Loja: {item.product.stockLoja}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Metodologia e Limitação Documentada */}
      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex items-start gap-3 text-slate-600">
        <HelpCircle className="w-5 h-5 text-slate-400 shrink-0 mt-0.5" />
        <div className="text-xs space-y-1">
          <p className="font-bold text-slate-800">
            {isSaidaBaleiro
              ? 'Metodologia Curva ABC (Giro / Saída para o Baleiro)'
              : 'Metodologia Curva ABC de Estoque (Capital Imobilizado)'}
          </p>
          <p className="leading-relaxed text-slate-600">
            {isSaidaBaleiro
              ? 'Este sistema não opera como PDV de venda final ao consumidor. O giro é calculado estritamente a partir das movimentações de saída para o Baleiro (produtos retirados das caixas fechadas para abastecer a exposição na loja). O "Valor Estimado de Saída" multiplica essa quantidade pelo Preço de Venda cadastrado do produto, servindo como indicador gerencial de giro e demanda estimada.'
              : 'Esta visão de Pareto é calculada sobre o Capital Imobilizado (Saldo Físico em Depósito + Loja multiplicado pelo Preço de Custo cadastrado, ou Preço de Venda quando custo zerado). Indica a concentração de valor financeiro parado nas prateleiras e no depósito central.'}
          </p>
        </div>
      </div>

    </div>
  );
};
