import React, { useState, useMemo } from 'react';
import {
  Boxes,
  Store,
  Warehouse,
  TrendingUp,
  AlertTriangle,
  Clock,
  PackageCheck,
  DollarSign,
  PieChart as PieChartIcon,
  Search,
  Filter,
  CheckCircle2,
  Layers,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  Cell,
  PieChart,
  Pie,
} from 'recharts';
import { useStock } from '../context/StockContext';
import { formatCurrency, getDaysToExpiration } from '../utils/inventoryUtils';
import { ActiveTab } from './Sidebar';

export interface StockFilterOptions {
  searchQuery?: string;
  category?: string;
  status?: string;
}

interface DashboardProps {
  setActiveTab: (tab: ActiveTab) => void;
  onNavigateToStock?: (filters: StockFilterOptions) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ setActiveTab, onNavigateToStock }) => {
  const { products, nfEntries } = useStock();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('todos');

  // Helper to trigger navigation
  const handleDrillDown = (filters: StockFilterOptions = {}) => {
    if (onNavigateToStock) {
      onNavigateToStock(filters);
    } else {
      setActiveTab('estoque_geral');
    }
  };

  // 1. Calculations & Metrics
  const totalSKUs = products.length;

  const totalStockQuantity = products.reduce(
    (acc, p) => acc + p.stockDeposito + p.stockLoja,
    0
  );
  const stockDepositoQty = products.reduce((acc, p) => acc + p.stockDeposito, 0);
  const stockLojaQty = products.reduce((acc, p) => acc + p.stockLoja, 0);

  // Valuation (Total Cost)
  const totalCostValuation = products.reduce(
    (acc, p) => acc + (p.stockDeposito + p.stockLoja) * p.costPrice,
    0
  );
  const depositoCostValuation = products.reduce(
    (acc, p) => acc + p.stockDeposito * p.costPrice,
    0
  );
  const lojaCostValuation = products.reduce(
    (acc, p) => acc + p.stockLoja * p.costPrice,
    0
  );

  // Valuation (Potential Sales Revenue)
  const totalSellValuation = products.reduce(
    (acc, p) => acc + (p.stockDeposito + p.stockLoja) * p.sellPrice,
    0
  );

  const potentialProfit = totalSellValuation - totalCostValuation;
  const overallProfitMargin = totalCostValuation > 0
    ? ((potentialProfit / totalCostValuation) * 100).toFixed(1)
    : '0.0';

  // Alerts
  const lowStockLojaCount = products.filter((p) => p.stockLoja <= p.minStockLoja).length;
  const lowStockDepositoCount = products.filter((p) => p.stockDeposito <= p.minStockDeposito).length;
  const lowStockCount = products.filter(
    (p) => p.stockDeposito <= p.minStockDeposito || p.stockLoja <= p.minStockLoja
  ).length;

  const expiringSoonCount = products.filter((p) => {
    const days = getDaysToExpiration(p.expirationDate);
    return days <= 30;
  }).length;

  // Categories list
  const categories = useMemo(() => {
    const cats = Array.from(new Set(products.map((p) => p.category)));
    return cats.sort();
  }, [products]);

  // Chart Data 1: Stock Value by Category
  const categoryData = useMemo(() => {
    const catMap: Record<string, { name: string; deposito: number; loja: number }> = {};
    products.forEach((p) => {
      const cat = p.category;
      if (!catMap[cat]) {
        catMap[cat] = { name: cat, deposito: 0, loja: 0 };
      }
      catMap[cat].deposito += p.stockDeposito * p.costPrice;
      catMap[cat].loja += p.stockLoja * p.costPrice;
    });
    return Object.values(catMap);
  }, [products]);

  // Chart Data 2: Pie Split Depósito vs Loja Valuation
  const pieData = [
    { name: 'Depósito Central', value: depositoCostValuation, color: '#0284c7' },
    { name: 'Estoque da Loja', value: lojaCostValuation, color: '#f59e0b' },
  ];

  // Filtered Products for the Overview Table
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const eanStr = p.ean || p.codeEAN || '';
      const matchesSearch =
        p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.sku.toLowerCase().includes(searchTerm.toLowerCase()) ||
        eanStr.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.category.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesCat =
        selectedCategory === 'todos' || p.category === selectedCategory;

      return matchesSearch && matchesCat;
    });
  }, [products, searchTerm, selectedCategory]);

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      
      {/* Top Header Section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-5 rounded-3xl border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-black text-slate-900 tracking-tight text-left">
              Panorama Geral do Estoque & Indicadores
            </h1>
            <span className="text-[10px] font-extrabold px-2.5 py-0.5 rounded-full bg-rose-100 text-rose-800 uppercase">
              Relatório Executivo
            </span>
          </div>
          <p className="text-xs text-slate-500 text-left mt-0.5">
            Métricas consolidadas de valores, quantidades e movimentações sem duplicidade de dados.
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs font-bold text-slate-600 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200 self-start sm:self-auto">
          <Boxes className="w-4 h-4 text-rose-600" />
          <span>{totalSKUs} SKUs Ativos</span>
          <span className="text-slate-300">|</span>
          <span>{totalStockQuantity} Itens Totais</span>
        </div>
      </div>

      {/* KPI Financial & Inventory Metrics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* Card 1: Patrimônio e Valor Investido */}
        <div
          onClick={() => handleDrillDown({})}
          title="Clique para ver o estoque completo"
          className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs hover:border-rose-300 hover:shadow-md transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400 group-hover:text-rose-600 transition-colors">
              Patrimônio em Custo
            </span>
            <div className="p-2 rounded-xl bg-rose-50 text-rose-600 group-hover:bg-rose-100 transition-colors">
              <DollarSign className="w-5 h-5" />
            </div>
          </div>
          <p className="text-2xl font-black text-slate-900">
            {formatCurrency(totalCostValuation)}
          </p>
          <div className="mt-2 text-xs text-slate-500 space-y-1 pt-2 border-t border-slate-100">
            <div className="flex justify-between">
              <span>Venda Projetada:</span>
              <span className="font-bold text-slate-800">{formatCurrency(totalSellValuation)}</span>
            </div>
            <div className="flex justify-between">
              <span>Lucro Potencial:</span>
              <span className="font-bold text-emerald-700">
                {formatCurrency(potentialProfit)} ({overallProfitMargin}%)
              </span>
            </div>
          </div>
        </div>

        {/* Card 2: Divisão por Localização */}
        <div
          onClick={() => handleDrillDown({})}
          title="Clique para ver o estoque por localização"
          className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs hover:border-sky-300 hover:shadow-md transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400 group-hover:text-sky-600 transition-colors">
              Divisão Por Localização
            </span>
            <div className="p-2 rounded-xl bg-sky-50 text-sky-600 group-hover:bg-sky-100 transition-colors">
              <Warehouse className="w-5 h-5" />
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex justify-between text-xs font-semibold">
              <span className="text-sky-700 flex items-center gap-1 font-bold">
                <Warehouse className="w-3.5 h-3.5" /> Depósito ({stockDepositoQty} un):
              </span>
              <span className="font-black text-slate-900">{formatCurrency(depositoCostValuation)}</span>
            </div>
            <div className="flex justify-between text-xs font-semibold">
              <span className="text-amber-700 flex items-center gap-1 font-bold">
                <Store className="w-3.5 h-3.5" /> Loja ({stockLojaQty} un):
              </span>
              <span className="font-black text-slate-900">{formatCurrency(lojaCostValuation)}</span>
            </div>

            {/* Visual Bar */}
            <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden flex mt-2">
              <div
                style={{
                  width: `${
                    totalCostValuation > 0
                      ? (depositoCostValuation / totalCostValuation) * 100
                      : 50
                  }%`,
                }}
                className="bg-sky-500 h-full"
                title="Depósito"
              />
              <div
                style={{
                  width: `${
                    totalCostValuation > 0
                      ? (lojaCostValuation / totalCostValuation) * 100
                      : 50
                  }%`,
                }}
                className="bg-amber-500 h-full"
                title="Loja"
              />
            </div>
          </div>
        </div>

        {/* Card 3: Volumes e SKUs */}
        <div
          onClick={() => handleDrillDown({})}
          title="Clique para ver lista de SKUs"
          className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs hover:border-emerald-300 hover:shadow-md transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400 group-hover:text-emerald-600 transition-colors">
              Volume Físico de Itens
            </span>
            <div className="p-2 rounded-xl bg-emerald-50 text-emerald-600 group-hover:bg-emerald-100 transition-colors">
              <PackageCheck className="w-5 h-5" />
            </div>
          </div>
          <p className="text-2xl font-black text-slate-900">
            {totalStockQuantity}{' '}
            <span className="text-xs font-bold text-slate-500">unidades</span>
          </p>
          <div className="mt-2 text-xs text-slate-500 space-y-1 pt-2 border-t border-slate-100">
            <div className="flex justify-between">
              <span>SKUs Cadastrados:</span>
              <span className="font-bold text-slate-800">{totalSKUs} produtos</span>
            </div>
            <div className="flex justify-between">
              <span>Média un / SKU:</span>
              <span className="font-bold text-slate-800">
                {totalSKUs > 0 ? (totalStockQuantity / totalSKUs).toFixed(1) : 0}
              </span>
            </div>
          </div>
        </div>

        {/* Card 4: Alertas de Atenção */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">
              Situação do Estoque
            </span>
            <div className="p-2 rounded-xl bg-amber-50 text-amber-600">
              <AlertTriangle className="w-5 h-5" />
            </div>
          </div>

          <div className="space-y-1.5">
            {/* Clickable Estoque Baixo na Loja Button */}
            <div
              onClick={() => handleDrillDown({ status: 'estoque_baixo_loja' })}
              title="Filtrar produtos com Estoque Baixo na Loja"
              className="flex items-center justify-between text-xs p-1.5 px-2 rounded-xl bg-amber-50/80 hover:bg-amber-100 border border-amber-200 transition-all cursor-pointer group"
            >
              <span className="text-amber-800 font-extrabold flex items-center gap-1">
                <Store className="w-3.5 h-3.5 text-amber-600" /> Baixo na Loja:
              </span>
              <span className="font-black px-2 py-0.5 rounded bg-amber-600 text-white text-[11px] shadow-2xs group-hover:scale-105 transition-transform">
                {lowStockLojaCount} SKUs ➔
              </span>
            </div>

            {/* Clickable Estoque Baixo no Depósito Button */}
            <div
              onClick={() => handleDrillDown({ status: 'estoque_baixo_deposito' })}
              title="Filtrar produtos com Estoque Baixo no Depósito Central"
              className="flex items-center justify-between text-xs p-1.5 px-2 rounded-xl bg-sky-50/80 hover:bg-sky-100 border border-sky-200 transition-all cursor-pointer group"
            >
              <span className="text-sky-800 font-extrabold flex items-center gap-1">
                <Warehouse className="w-3.5 h-3.5 text-sky-600" /> Baixo no Depósito:
              </span>
              <span className="font-black px-2 py-0.5 rounded bg-sky-600 text-white text-[11px] shadow-2xs group-hover:scale-105 transition-transform">
                {lowStockDepositoCount} SKUs ➔
              </span>
            </div>

            {/* Clickable Estoque Crítico Geral Button */}
            <div
              onClick={() => handleDrillDown({ status: 'estoque_baixo' })}
              title="Filtrar todos os produtos com Estoque Baixo em qualquer local"
              className="flex items-center justify-between text-xs p-1.5 px-2 rounded-xl bg-rose-50/60 hover:bg-rose-100/80 border border-rose-200/80 transition-all cursor-pointer group"
            >
              <span className="text-rose-700 font-extrabold flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5" /> Baixo Total:
              </span>
              <span className="font-black px-2 py-0.5 rounded bg-rose-600 text-white text-[11px] shadow-2xs group-hover:scale-105 transition-transform">
                {lowStockCount} itens ➔
              </span>
            </div>

            {/* Clickable Vencimento Próximo Button */}
            <div
              onClick={() => handleDrillDown({ status: 'validade_proxima' })}
              title="Clique para filtrar produtos com vencimento em menos de 30 dias"
              className="flex items-center justify-between text-xs p-1.5 px-2 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 transition-all cursor-pointer group"
            >
              <span className="text-slate-700 font-extrabold flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-amber-500" /> Vencimento &lt;30d:
              </span>
              <span className="font-extrabold px-2 py-0.5 rounded bg-slate-800 text-white text-[11px] group-hover:scale-105 transition-transform">
                {expiringSoonCount} itens ➔
              </span>
            </div>
          </div>
        </div>

      </div>

      {/* Visual Analytics Graphs Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Category Value Bar Chart */}
        <div className="lg:col-span-2 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider text-left">
                Investimento Por Categoria (R$)
              </h3>
              <p className="text-[11px] text-slate-500 text-left">
                Distribuição financeira entre Depósito Central e Estoque da Loja
              </p>
            </div>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={categoryData}
                margin={{ top: 10, right: 10, left: 0, bottom: 20 }}
                onClick={(e: any) => {
                  if (e && e.activeLabel) {
                    handleDrillDown({ category: e.activeLabel });
                  }
                }}
                className="cursor-pointer"
              >
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 10 }}
                  interval={0}
                  angle={-15}
                  textAnchor="end"
                />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip
                  formatter={(val: number) => [formatCurrency(val), 'Valor em Custo']}
                  contentStyle={{ borderRadius: '12px', fontSize: '12px', borderColor: '#e2e8f0' }}
                />
                <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                <Bar dataKey="deposito" name="Depósito" fill="#0284c7" radius={[4, 4, 0, 0]} />
                <Bar dataKey="loja" name="Loja" fill="#f59e0b" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Location Split Pie Chart */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between">
          <div>
            <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider mb-1 text-left">
              Participação Patrimonial
            </h3>
            <p className="text-[11px] text-slate-500 mb-4 text-left">
              Proporção alocada por local de armazenamento
            </p>

            <div
              onClick={() => handleDrillDown({})}
              title="Clique para abrir o estoque completo"
              className="h-48 w-full flex items-center justify-center cursor-pointer"
            >
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={4}
                    dataKey="value"
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(val: number) => formatCurrency(val)} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="space-y-2 pt-2 border-t border-slate-100">
            {pieData.map((item) => (
              <div
                key={item.name}
                onClick={() => handleDrillDown({})}
                className="flex items-center justify-between text-xs cursor-pointer hover:bg-slate-50 p-1 rounded-lg transition-colors"
              >
                <div className="flex items-center gap-2">
                  <span
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: item.color }}
                  />
                  <span className="font-semibold text-slate-700">{item.name}</span>
                </div>
                <span className="font-black text-slate-900">
                  {formatCurrency(item.value)}
                </span>
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* Comprehensive Product Inventory List (Clean, Complete, Without Duplication) */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-xs p-5 space-y-4">
        
        {/* List Header & Filters */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div>
            <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider text-left flex items-center gap-2">
              <Layers className="w-4 h-4 text-rose-600" />
              <span>Dados Consolidados do Inventário ({filteredProducts.length} Produtos)</span>
            </h3>
            <p className="text-xs text-slate-500 text-left">
              Visão completa de quantidades, custos, preços e alertas sem duplicidade de registros.
            </p>
          </div>

          {/* Search & Category Select Controls */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[200px]">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Buscar produto, EAN ou SKU..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full text-xs pl-8 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-rose-500 font-semibold"
              />
            </div>

            <div className="relative">
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="text-xs py-2 px-3 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-rose-500 font-semibold text-slate-700"
              >
                <option value="todos">Todas Categorias ({categories.length})</option>
                {categories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Scrollable Data Table */}
        <div className="border border-slate-200 rounded-2xl overflow-x-auto shadow-xs">
          <table className="w-full min-w-[950px] text-left text-xs">
            <thead className="bg-slate-50 text-slate-500 font-extrabold uppercase text-[10px] border-b border-slate-200">
              <tr>
                <th className="py-3 px-4">Produto & Cód. EAN</th>
                <th className="py-3 px-3">Categoria</th>
                <th className="py-3 px-3 text-center bg-sky-50/60 text-sky-900 border-x border-sky-100">Depósito</th>
                <th className="py-3 px-3 text-center bg-amber-50/60 text-amber-900 border-r border-amber-100">Loja</th>
                <th className="py-3 px-3 text-center bg-emerald-50/60 text-emerald-900 border-r border-emerald-100">Estoque Total</th>
                <th className="py-3 px-3 text-right">Custo Unit.</th>
                <th className="py-3 px-3 text-right">Venda Unit.</th>
                <th className="py-3 px-3 text-right">Patrimônio (Custo Total)</th>
                <th className="py-3 px-3 text-center">Status / Validade</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredProducts.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-slate-400 font-semibold">
                    Nenhum produto encontrado para os filtros selecionados.
                  </td>
                </tr>
              ) : (
                filteredProducts.map((p) => {
                  const totalQty = p.stockDeposito + p.stockLoja;
                  const totalValuation = totalQty * p.costPrice;
                  const isLowStock = p.stockDeposito <= p.minStockDeposito || p.stockLoja <= p.minStockLoja;
                  const daysToExp = getDaysToExpiration(p.expirationDate);

                  return (
                    <tr
                      key={p.id}
                      onClick={() => handleDrillDown({ searchQuery: p.name })}
                      title="Clique para ir à ficha completa deste produto no Estoque"
                      className="hover:bg-rose-50/40 transition-colors cursor-pointer group"
                    >
                      <td className="py-3 px-4">
                        <span className="block font-extrabold text-slate-900 leading-tight group-hover:text-rose-700 transition-colors">
                          {p.name} ➔
                        </span>
                        <div className="flex items-center gap-2 text-[10px] text-slate-400 mt-0.5">
                          <span>SKU: {p.sku}</span>
                          <span>•</span>
                          <span>EAN: {p.ean || p.codeEAN || '—'}</span>
                          <span>•</span>
                          <span>Lote: {p.batchNumber}</span>
                        </div>
                      </td>

                      <td className="py-3 px-3">
                        <span
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDrillDown({ category: p.category });
                          }}
                          className="inline-block px-2 py-0.5 rounded-md bg-slate-100 hover:bg-rose-100 text-slate-700 hover:text-rose-800 font-bold text-[10px] transition-colors"
                          title={`Filtrar apenas categoria "${p.category}"`}
                        >
                          {p.category}
                        </span>
                      </td>

                      <td className="py-3 px-3 text-center font-bold text-sky-800 bg-sky-50/30 border-x border-sky-100/60">
                        {p.stockDeposito} {p.unit}
                      </td>

                      <td className="py-3 px-3 text-center font-bold text-amber-800 bg-amber-50/30 border-r border-amber-100/60">
                        {p.stockLoja} {p.unit}
                      </td>

                      <td className="py-3 px-3 text-center font-black text-emerald-800 bg-emerald-50/30 border-r border-emerald-100/60">
                        {totalQty} {p.unit}
                      </td>

                      <td className="py-3 px-3 text-right font-medium text-slate-600">
                        {formatCurrency(p.costPrice)}
                      </td>

                      <td className="py-3 px-3 text-right font-bold text-slate-900">
                        {formatCurrency(p.sellPrice)}
                      </td>

                      <td className="py-3 px-3 text-right font-black text-slate-900">
                        {formatCurrency(totalValuation)}
                      </td>

                      <td className="py-3 px-3 text-center">
                        <div className="flex flex-col items-center gap-1">
                          {isLowStock ? (
                            <span
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDrillDown({ status: 'estoque_baixo' });
                              }}
                              className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-rose-100 hover:bg-rose-200 text-rose-800 transition-colors"
                              title="Ver todos com Estoque Baixo"
                            >
                              Estoque Baixo ➔
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-emerald-100 text-emerald-800">
                              Estoque OK
                            </span>
                          )}

                          <span
                            onClick={(e) => {
                              if (daysToExp <= 30) {
                                e.stopPropagation();
                                handleDrillDown({ status: 'validade_proxima' });
                              }
                            }}
                            className={`text-[9px] font-semibold ${
                              daysToExp < 0
                                ? 'text-rose-700 font-black underline'
                                : daysToExp <= 30
                                ? 'text-amber-700 font-bold underline'
                                : 'text-slate-400'
                            }`}
                            title={daysToExp <= 30 ? 'Ver produtos com vencimento próximo' : ''}
                          >
                            Val: {p.expirationDate}
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
};
