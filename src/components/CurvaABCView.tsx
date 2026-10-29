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
  Search,
  X,
} from 'lucide-react';
import { useStock } from '../context/StockContext';
import { calculateCurvaABC, formatCurrency } from '../utils/inventoryUtils';
import { exportToExcel, exportToCSV } from '../utils/exportUtils';
import { ExportButton } from './ExportButton';
import { PaginationControls } from './PaginationControls';
import { FilterCollapseBar } from './FilterCollapseBar';
import { DismissibleInfoCard } from './DismissibleInfoCard';

interface ParetoItemData {
  name: string;
  fullName: string;
  valorMetrica: number;
  acumuladoPct: number;
  revenuePct: number;
  classe: 'A' | 'B' | 'C';
}

interface ParetoChartProps {
  data: ParetoItemData[];
  metricLabel: string;
  isSaidaBaleiro: boolean;
}

const ParetoChart: React.FC<ParetoChartProps> = ({ data, metricLabel, isSaidaBaleiro }) => {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  // Consider top 15 items for the visual curve to avoid overcrowding
  const items = useMemo(() => data.slice(0, 15), [data]);

  if (items.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-xs text-slate-400 font-semibold bg-slate-50 rounded-2xl border border-dashed border-slate-200">
        Nenhum dado cadastrado para exibir no gráfico de Pareto.
      </div>
    );
  }

  const width = 900;
  const height = 280;
  const padding = { top: 25, right: 60, bottom: 65, left: 85 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;

  const maxVal = Math.max(...items.map((d) => d.valorMetrica), 1);
  const slotWidth = plotWidth / items.length;
  const barWidth = Math.min(Math.max(slotWidth * 0.55, 12), 48);

  // Line points
  const points = items.map((d, i) => {
    const x = padding.left + i * slotWidth + slotWidth / 2;
    const y = padding.top + plotHeight * (1 - Math.min(d.acumuladoPct, 100) / 100);
    return { x, y, ...d, i };
  });

  const pathD = points.reduce((acc, p, i) => {
    return i === 0 ? `M ${p.x} ${p.y}` : `${acc} L ${p.x} ${p.y}`;
  }, '');

  // 80% line
  const y80 = padding.top + plotHeight * (1 - 0.8);

  const hoveredItem = hoveredIdx !== null ? items[hoveredIdx] : null;

  return (
    <div className="relative w-full overflow-hidden select-none">
      {/* Tooltip Card Overlay */}
      {hoveredItem && (
        <div
          className="absolute z-20 pointer-events-none bg-slate-900/95 text-white px-3.5 py-2.5 rounded-xl shadow-xl border border-slate-700 text-xs backdrop-blur-xs transition-all duration-75 animate-in fade-in"
          style={{
            left: Math.min(
              Math.max(padding.left + (hoveredIdx ?? 0) * slotWidth - 40, 10),
              width - 240
            ),
            top: 10,
          }}
        >
          <div className="flex items-center gap-2 mb-1">
            <span
              className={`px-1.5 py-0.5 rounded text-[10px] font-black uppercase ${
                hoveredItem.classe === 'A'
                  ? 'bg-emerald-500 text-white'
                  : hoveredItem.classe === 'B'
                  ? 'bg-indigo-500 text-white'
                  : 'bg-amber-500 text-white'
              }`}
            >
              Classe {hoveredItem.classe}
            </span>
            <span className="font-bold truncate max-w-[180px]">{hoveredItem.fullName}</span>
          </div>
          <div className="text-[11px] text-slate-300 space-y-0.5 font-mono">
            <div>
              {metricLabel}: <strong className="text-white">{formatCurrency(hoveredItem.valorMetrica)}</strong>
            </div>
            <div>
              Acumulado Pareto: <strong className="text-rose-400">{hoveredItem.acumuladoPct.toFixed(1)}%</strong>
            </div>
          </div>
        </div>
      )}

      {/* SVG Canvas */}
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-72 overflow-visible"
        preserveAspectRatio="xMidYMid meet"
      >
        {/* Horizontal grid lines and left Y axis */}
        {[0, 0.25, 0.5, 0.75, 1].map((pct) => {
          const y = padding.top + plotHeight * (1 - pct);
          const val = maxVal * pct;
          return (
            <g key={pct}>
              <line
                x1={padding.left}
                y1={y}
                x2={width - padding.right}
                y2={y}
                stroke="#f1f5f9"
                strokeDasharray={pct === 0 ? undefined : '4 4'}
                strokeWidth={pct === 0 ? '1.5' : '1'}
              />
              <text
                x={padding.left - 10}
                y={y + 4}
                textAnchor="end"
                className="text-[10px] fill-slate-400 font-mono font-medium"
              >
                {formatCurrency(val)}
              </text>
              <text
                x={width - padding.right + 10}
                y={y + 4}
                textAnchor="start"
                className="text-[10px] fill-slate-400 font-mono font-medium"
              >
                {Math.round(pct * 100)}%
              </text>
            </g>
          );
        })}

        {/* 80% Pareto Reference Line */}
        <line
          x1={padding.left}
          y1={y80}
          x2={width - padding.right}
          y2={y80}
          stroke="#f43f5e"
          strokeDasharray="4 4"
          strokeWidth="1.5"
          opacity="0.85"
        />
        <text
          x={width - padding.right - 8}
          y={y80 - 6}
          textAnchor="end"
          className="text-[10px] font-bold fill-rose-500 tracking-wider"
        >
          Linha 80% (Corte Classe A)
        </text>

        {/* Bars */}
        {items.map((d, i) => {
          const barHeight = (d.valorMetrica / maxVal) * plotHeight;
          const x = padding.left + i * slotWidth + (slotWidth - barWidth) / 2;
          const y = padding.top + plotHeight - barHeight;
          const isHovered = hoveredIdx === i;

          const color =
            d.classe === 'A'
              ? isHovered ? '#059669' : '#10b981'
              : d.classe === 'B'
              ? isHovered ? '#4338ca' : '#6366f1'
              : isHovered ? '#d97706' : '#f59e0b';

          return (
            <g
              key={i}
              className="cursor-pointer transition-all"
              onMouseEnter={() => setHoveredIdx(i)}
              onMouseLeave={() => setHoveredIdx(null)}
            >
              <rect
                x={x}
                y={y}
                width={barWidth}
                height={Math.max(barHeight, 2)}
                fill={color}
                rx="4"
                className="transition-all duration-150"
              />
              {/* Product Label under X axis */}
              <text
                x={x + barWidth / 2}
                y={padding.top + plotHeight + 16}
                textAnchor="end"
                transform={`rotate(-25, ${x + barWidth / 2}, ${padding.top + plotHeight + 16})`}
                className={`text-[9.5px] font-semibold transition-colors ${
                  isHovered ? 'fill-slate-900 font-bold' : 'fill-slate-500'
                }`}
              >
                {d.name}
              </text>
            </g>
          );
        })}

        {/* Pareto Cumulative Curve Line */}
        <path
          d={pathD}
          fill="none"
          stroke="#e11d48"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Pareto Curve Dots */}
        {points.map((p) => {
          const isHovered = hoveredIdx === p.i;
          return (
            <circle
              key={p.i}
              cx={p.x}
              cy={p.y}
              r={isHovered ? 6 : 4}
              fill="#ffffff"
              stroke="#e11d48"
              strokeWidth={isHovered ? 3 : 2}
              className="cursor-pointer transition-all duration-150"
              onMouseEnter={() => setHoveredIdx(p.i)}
              onMouseLeave={() => setHoveredIdx(null)}
            />
          );
        })}
      </svg>

      {/* Legend & Summary Info */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100 text-xs">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-emerald-500 inline-block shrink-0" />
            <span className="text-slate-600 font-semibold text-[11px]">Classe A (Até 80% do valor)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-indigo-500 inline-block shrink-0" />
            <span className="text-slate-600 font-semibold text-[11px]">Classe B (Próximos 15%)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-amber-500 inline-block shrink-0" />
            <span className="text-slate-600 font-semibold text-[11px]">Classe C (Últimos 5%)</span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className="w-5 h-0.5 bg-rose-600 inline-block shrink-0" />
            <span className="text-slate-600 font-semibold text-[11px]">% Acumulado Pareto</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-5 border-t border-dashed border-rose-500 inline-block shrink-0" />
            <span className="text-rose-600 font-semibold text-[11px]">Corte 80%</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export const CurvaABCView: React.FC = () => {
  const { products, movements } = useStock();
  const [metricMode, setMetricMode] = useState<'saida_baleiro' | 'capital_imobilizado'>('saida_baleiro');
  const [selectedClass, setSelectedClass] = useState<'todos' | 'A' | 'B' | 'C'>('todos');
  const [searchQuery, setSearchQuery] = useState('');
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);

  // Pagination State (Default 50 items per page with selector)
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(50);

  // Reset page when mode or class filter or search changes
  React.useEffect(() => {
    setCurrentPage(1);
  }, [metricMode, selectedClass, searchQuery]);

  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (selectedClass !== 'todos') count++;
    if (searchQuery.trim()) count++;
    return count;
  }, [selectedClass, searchQuery]);

  const handleClearFilters = () => {
    setSelectedClass('todos');
    setSearchQuery('');
  };

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
      fullName: item.product.name,
      valorMetrica: item.totalRevenue,
      acumuladoPct: item.cumulativePercentage,
      revenuePct: item.revenuePercentage,
      classe: item.classABC,
    }));
  }, [abcList]);

  const filteredList = useMemo(() => {
    let list = abcList;
    if (selectedClass !== 'todos') {
      list = list.filter((i) => i.classABC === selectedClass);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (i) =>
          i.product.name.toLowerCase().includes(q) ||
          (i.product.sku && i.product.sku.toLowerCase().includes(q)) ||
          (i.product.category && i.product.category.toLowerCase().includes(q)) ||
          ((i.product.ean || i.product.codeEAN) &&
            (i.product.ean || i.product.codeEAN || '').toLowerCase().includes(q))
      );
    }
    return list;
  }, [abcList, selectedClass, searchQuery]);

  const paginatedList = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredList.slice(start, start + pageSize);
  }, [filteredList, currentPage, pageSize]);

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
    <div className="space-y-6 animate-in fade-in duration-200 w-full max-w-full min-w-0 overflow-hidden">
      
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

        <div className="w-full">
          <ParetoChart
            data={chartData}
            metricLabel={metricLabel}
            isSaidaBaleiro={isSaidaBaleiro}
          />
        </div>
      </div>

      {/* Filter Bar (Collapsible by default) */}
      <FilterCollapseBar
        isOpen={isFiltersOpen}
        onToggle={() => setIsFiltersOpen(!isFiltersOpen)}
        activeCount={activeFiltersCount}
        onClear={handleClearFilters}
        label="Opções de Busca e Filtros da Curva ABC"
      >
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Buscar por produto, SKU, código de barras ou categoria..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-9 py-2 rounded-xl border border-slate-200 text-xs font-medium focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 bg-white"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs font-bold text-slate-700">Classe:</span>
            <select
              value={selectedClass}
              onChange={(e) => setSelectedClass(e.target.value as any)}
              className="py-2 px-3 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none focus:border-indigo-500 cursor-pointer"
            >
              <option value="todos">Todas as Classes (A, B, C)</option>
              <option value="A">Apenas Classe A</option>
              <option value="B">Apenas Classe B</option>
              <option value="C">Apenas Classe C</option>
            </select>
          </div>
        </div>
      </FilterCollapseBar>

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

        {/* Desktop Table View */}
        <div className="hidden md:block overflow-x-auto">
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
              {paginatedList.map((item) => (
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

        {/* Mobile Cards View */}
        <div className="block md:hidden p-3 space-y-3 bg-slate-50/50">
          {paginatedList.map((item) => (
            <div
              key={item.product.id}
              className="p-3.5 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-2.5"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <span className="font-bold text-slate-900 text-sm block truncate">
                    {item.product.name}
                  </span>
                  <span className="text-[11px] text-slate-500 block mt-0.5">
                    {item.product.category} {item.product.sku ? `• SKU: ${item.product.sku}` : ''}
                  </span>
                </div>
                <span
                  className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-black uppercase shrink-0 ${
                    item.classABC === 'A'
                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                      : item.classABC === 'B'
                      ? 'bg-amber-100 text-amber-800 border border-amber-300'
                      : 'bg-slate-100 text-slate-700 border border-slate-300'
                  }`}
                >
                  Classe {item.classABC}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs pt-1 border-t border-slate-100">
                <div className="p-2 rounded-xl bg-slate-50">
                  <span className="text-[10px] font-bold text-slate-400 block uppercase">
                    {isSaidaBaleiro ? 'Saída Baleiro' : 'Estoque Físico'}
                  </span>
                  <span className="font-black text-rose-700 block">
                    {isSaidaBaleiro ? `${item.totalOutputUnits || 0} un` : `${item.product.stockLoja + item.product.stockDeposito} un`}
                  </span>
                  <span className="text-[10px] text-slate-500 block">
                    Dep: {item.product.stockDeposito} | Loja: {item.product.stockLoja}
                  </span>
                </div>
                <div className="p-2 rounded-xl bg-slate-50">
                  <span className="text-[10px] font-bold text-slate-400 block uppercase">{metricLabel}</span>
                  <span className="font-black text-slate-900 block">{formatCurrency(item.totalRevenue)}</span>
                  <span className="text-[10px] text-slate-500 block">{item.revenuePercentage}% do total</span>
                </div>
              </div>

              <div className="flex items-center justify-between text-xs px-2.5 py-1.5 rounded-xl bg-slate-50 border border-slate-100">
                <span className="text-[11px] font-bold text-slate-500">Pareto Acumulado:</span>
                <span className="font-extrabold text-slate-800">{item.cumulativePercentage}%</span>
              </div>
            </div>
          ))}
        </div>

        {/* Pagination Controls */}
        <div className="p-3 border-t border-slate-200 bg-white">
          <PaginationControls
            currentPage={currentPage}
            totalItems={filteredList.length}
            pageSize={pageSize}
            onPageChange={setCurrentPage}
            onPageSizeChange={setPageSize}
            itemName="itens no ranking"
          />
        </div>
      </div>

      {/* Metodologia e Limitação Documentada (Dismissible on first access) */}
      <DismissibleInfoCard
        storageKey="dismissed_info_curva_abc_methodology"
        className="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex items-start gap-3 text-slate-600"
      >
        <div className="flex items-start gap-3">
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
      </DismissibleInfoCard>

    </div>
  );
};
