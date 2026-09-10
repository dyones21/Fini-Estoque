import React, { useState, useMemo } from 'react';
import {
  ShoppingCart,
  TrendingDown,
  AlertTriangle,
  Package,
  Calendar,
  DollarSign,
  Download,
  Copy,
  Check,
  Search,
  Filter,
  SlidersHorizontal,
  Info,
  ArrowUpDown,
  Sparkles,
  Store,
  Warehouse,
  CheckCircle2,
  Clock,
  ExternalLink,
  ChevronRight,
  RefreshCw,
} from 'lucide-react';
import { useStock } from '../context/StockContext';
import { Product, StockMovement } from '../types';
import { formatCurrency } from '../utils/inventoryUtils';
import { exportToExcel, exportToCSV } from '../utils/exportUtils';
import { ExportButton } from './ExportButton';

export interface PurchaseItemAnalysis {
  product: Product;
  currentStockDeposito: number;
  currentStockLoja: number;
  totalCurrentStock: number;
  totalOut30Days: number;
  dailyConsumption: number; // Média diária (saída 30 dias / 30)
  daysOfStockRemaining: number | null; // dias restantes ou null se sem saída
  isSuggested: boolean;
  isExhausted: boolean;
  isCritical: boolean; // < 7 dias
  suggestedPurchaseQty: number; // Qtd para cobrir targetDays
  estimatedCost: number;
  minStockTotal: number;
}

export const PurchaseSuggestionView: React.FC = () => {
  const { products, movements, categories } = useStock();

  // Configurable Parameters (Default: 15 dias de alerta, 30 dias de cobertura)
  const [thresholdDays, setThresholdDays] = useState<number>(15);
  const [targetCoverageDays, setTargetCoverageDays] = useState<number>(30);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('todos');
  const [statusFilter, setStatusFilter] = useState<'sugestoes' | 'criticos' | 'esgotados' | 'todos'>('sugestoes');

  // Copy to clipboard notification
  const [copiedList, setCopiedList] = useState(false);

  // Calculate Outgoing Movements from the last 30 days
  const analysisData: PurchaseItemAnalysis[] = useMemo(() => {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Group outgoing movements by productId
    const outputMap = new Map<string, number>();

    movements.forEach((m) => {
      if (!m.date) return;
      const movDate = new Date(m.date);
      if (movDate < thirtyDaysAgo) return;

      const isExit =
        m.type === 'venda_loja' ||
        (m.type as any) === 'Venda Loja' ||
        (m.type as any) === 'Venda Directa Loja' ||
        m.type === 'perda_avaria' ||
        (m.type as any) === 'Saída de Estoque' ||
        (m.type as any) === 'Baixa Manual' ||
        (m.type as any) === 'Ajuste / Perda';

      if (isExit && m.productId) {
        const currentTotal = outputMap.get(m.productId) || 0;
        outputMap.set(m.productId, currentTotal + (Number(m.quantity) || 0));
      }
    });

    return products.map((prod) => {
      const depStock = Number(prod.stockDeposito) || 0;
      const lojStock = Number(prod.stockLoja) || 0;
      const totalStock = depStock + lojStock;
      const minTotal = (Number(prod.minStockDeposito) || 0) + (Number(prod.minStockLoja) || 0);

      // Quantidade total saída nos últimos 30 dias
      const totalOut = outputMap.get(prod.id) || 0;

      // Velocidade de saída: Média diária = totalOut / 30
      const dailyConsumption = totalOut / 30;

      // Dias de estoque restante: totalStock / dailyConsumption
      const daysOfStock = dailyConsumption > 0 ? totalStock / dailyConsumption : null;

      const isExhausted = totalStock <= 0;
      const isCritical = daysOfStock !== null && daysOfStock < 7;
      
      // Sugerido se durar menos que thresholdDays ou se estiver zerado com consumo histórico
      const isSuggested =
        (daysOfStock !== null && daysOfStock < thresholdDays) ||
        (isExhausted && (dailyConsumption > 0 || minTotal > 0));

      // Quantidade sugerida para cobrir targetCoverageDays
      let suggestedQty = 0;
      if (dailyConsumption > 0) {
        const targetStockNeeded = Math.ceil(dailyConsumption * targetCoverageDays);
        suggestedQty = Math.max(0, targetStockNeeded - totalStock);
      } else if (isExhausted && minTotal > 0) {
        suggestedQty = minTotal;
      }

      const costPrice = Number(prod.costPrice) || 0;
      const estimatedCost = suggestedQty * costPrice;

      return {
        product: prod,
        currentStockDeposito: depStock,
        currentStockLoja: lojStock,
        totalCurrentStock: totalStock,
        totalOut30Days: totalOut,
        dailyConsumption,
        daysOfStockRemaining: daysOfStock,
        isSuggested,
        isExhausted,
        isCritical,
        suggestedPurchaseQty: suggestedQty,
        estimatedCost,
        minStockTotal: minTotal,
      };
    });
  }, [products, movements, thresholdDays, targetCoverageDays]);

  // Filtered and Sorted Items (Most urgent first)
  const filteredItems = useMemo(() => {
    return analysisData
      .filter((item) => {
        // Status Filter
        if (statusFilter === 'sugestoes' && !item.isSuggested) return false;
        if (statusFilter === 'criticos' && (!item.isCritical && !item.isExhausted)) return false;
        if (statusFilter === 'esgotados' && !item.isExhausted) return false;

        // Category Filter
        if (selectedCategory !== 'todos' && item.product.category !== selectedCategory) return false;

        // Search Filter
        if (searchQuery) {
          const q = searchQuery.toLowerCase().trim();
          const nameMatch = item.product.name.toLowerCase().includes(q);
          const skuMatch = item.product.sku?.toLowerCase().includes(q);
          const eanMatch = item.product.ean?.toLowerCase().includes(q);
          return nameMatch || skuMatch || eanMatch;
        }

        return true;
      })
      .sort((a, b) => {
        // Order: Esgotados primeiro, depois menos dias de estoque restantes, depois sem saída
        if (a.isExhausted && !b.isExhausted) return -1;
        if (!a.isExhausted && b.isExhausted) return 1;

        if (a.daysOfStockRemaining !== null && b.daysOfStockRemaining !== null) {
          return a.daysOfStockRemaining - b.daysOfStockRemaining;
        }
        if (a.daysOfStockRemaining !== null && b.daysOfStockRemaining === null) return -1;
        if (a.daysOfStockRemaining === null && b.daysOfStockRemaining !== null) return 1;

        const outDiff = b.totalOut30Days - a.totalOut30Days;
        if (outDiff !== 0) return outDiff;

        return a.product.name.localeCompare(b.product.name, 'pt-BR');
      });
  }, [analysisData, statusFilter, selectedCategory, searchQuery]);

  // Summary Metrics
  const metrics = useMemo(() => {
    const suggestedList = analysisData.filter((i) => i.isSuggested);
    const criticalList = analysisData.filter((i) => i.isCritical || i.isExhausted);
    const totalCostEstimated = suggestedList.reduce((acc, i) => acc + i.estimatedCost, 0);
    const totalUnitsToBuy = suggestedList.reduce((acc, i) => acc + i.suggestedPurchaseQty, 0);

    return {
      totalSuggested: suggestedList.length,
      totalCritical: criticalList.length,
      totalCostEstimated,
      totalUnitsToBuy,
    };
  }, [analysisData]);

  // Copy Order List to Clipboard
  const handleCopyOrderList = () => {
    const listToCopy = analysisData.filter((i) => i.isSuggested && i.suggestedPurchaseQty > 0);
    if (listToCopy.length === 0) return;

    let text = `📦 *PEDIDO DE COMPRA / REPOSIÇÃO DE ESTOQUE - GUMMYSTOCK*\n`;
    text += `📅 Data: ${new Date().toLocaleDateString('pt-BR')}\n`;
    text += `🎯 Meta de Cobertura: ${targetCoverageDays} dias | Alerta: ${thresholdDays} dias\n`;
    text += `--------------------------------------------------\n\n`;

    listToCopy.forEach((item, idx) => {
      text += `${idx + 1}. *${item.product.name}* (SKU: ${item.product.sku || 'N/A'})\n`;
      text += `   - Estoque Atual: ${item.totalCurrentStock} un (Depósito: ${item.currentStockDeposito} | Loja: ${item.currentStockLoja})\n`;
      text += `   - Média de Saída: ${item.dailyConsumption.toFixed(1)} un/dia (${item.totalOut30Days} un nos últimos 30d)\n`;
      text += `   - Cobertura Restante: ${item.daysOfStockRemaining !== null ? `${Math.round(item.daysOfStockRemaining)} dias` : 'Esgotado'}\n`;
      text += `   - *Qtd Sugerida para Compra:* 👉 *${item.suggestedPurchaseQty} un*\n`;
      if (item.product.costPrice > 0) {
        text += `   - Preço Custo Est.: ${formatCurrency(item.product.costPrice)} | Subtotal: ${formatCurrency(item.estimatedCost)}\n`;
      }
      text += `\n`;
    });

    text += `--------------------------------------------------\n`;
    text += `*Total de Volumes Sugeridos:* ${metrics.totalUnitsToBuy} unidades\n`;
    text += `*Investimento Estimado:* ${formatCurrency(metrics.totalCostEstimated)}\n`;

    navigator.clipboard.writeText(text);
    setCopiedList(true);
    setTimeout(() => setCopiedList(false), 2500);
  };

  // Export Data Builder
  const handleExport = (format: 'excel' | 'csv') => {
    const exportRows = filteredItems.map((item) => ({
      Produto: item.product.name,
      Categoria: item.product.category,
      SKU: item.product.sku || '',
      EAN: item.product.ean || '',
      'Estoque Depósito': item.currentStockDeposito,
      'Estoque Loja': item.currentStockLoja,
      'Estoque Total': item.totalCurrentStock,
      'Saídas (30d)': item.totalOut30Days,
      'Consumo Médio Diário': Number(item.dailyConsumption.toFixed(2)),
      'Dias Restantes': item.daysOfStockRemaining !== null ? Math.round(item.daysOfStockRemaining) : 'Sem saída',
      'Status de Reposição': item.isExhausted ? 'Esgotado' : item.isCritical ? 'Crítico (<7d)' : item.isSuggested ? 'Sugerir Compra' : 'Estoque Seguro',
      'Qtd Sugerida (30d)': item.suggestedPurchaseQty,
      'Preço Custo Unitário': item.product.costPrice || 0,
      'Custo Total Estimado': item.estimatedCost || 0,
    }));

    const filename = `sugestao_compras_${new Date().toISOString().split('T')[0]}`;
    if (format === 'excel') {
      exportToExcel(exportRows, filename, 'Sugestões de Compra');
    } else {
      const headers = [
        'Produto',
        'Categoria',
        'SKU',
        'EAN',
        'Estoque Depósito',
        'Estoque Loja',
        'Estoque Total',
        'Saídas (30d)',
        'Consumo Médio Diário',
        'Dias Restantes',
        'Status de Reposição',
        'Qtd Sugerida (30d)',
        'Preço Custo Unitário',
        'Custo Total Estimado',
      ];
      const rows = exportRows.map((r) => [
        r.Produto,
        r.Categoria,
        r.SKU,
        r.EAN,
        r['Estoque Depósito'],
        r['Estoque Loja'],
        r['Estoque Total'],
        r['Saídas (30d)'],
        r['Consumo Médio Diário'],
        r['Dias Restantes'],
        r['Status de Reposição'],
        r['Qtd Sugerida (30d)'],
        r['Preço Custo Unitário'],
        r['Custo Total Estimado'],
      ]);
      exportToCSV(headers, rows, filename);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-sm relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-600 shadow-xs shrink-0">
              <ShoppingCart className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                  Sugestão Inteligente de Compra
                </h1>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200">
                  Giro 30 Dias
                </span>
              </div>
              <p className="text-xs sm:text-sm text-slate-500 font-medium">
                Cálculo de reposição baseado no ritmo de consumo real e histórico de saídas recentes.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleCopyOrderList}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs shadow-sm transition-all active:scale-95"
              title="Copiar lista de compras para WhatsApp / E-mail"
            >
              {copiedList ? (
                <>
                  <Check className="w-4 h-4 text-emerald-400" />
                  <span className="text-emerald-400">Lista Copiada!</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4 text-slate-400" />
                  <span>Copiar Pedido</span>
                </>
              )}
            </button>

            <ExportButton
              onExportExcel={() => handleExport('excel')}
              onExportCSV={() => handleExport('csv')}
            />
          </div>
        </div>

        {/* Disclaimer / Transparency Card */}
        <div className="mt-5 p-3.5 bg-amber-50/80 rounded-2xl border border-amber-200/80 flex items-start gap-3 text-xs text-amber-900">
          <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <p className="leading-relaxed font-medium">
            <strong>Como funciona o cálculo:</strong> A velocidade de saída é calculada somando todas as <strong>vendas na loja</strong> e <strong>perdas/avarias</strong> dos últimos 30 dias e dividindo por 30 (consumo médio diário). <em>Transferências internas entre depósito e loja não contam como saída</em>, pois a mercadoria permanece no estoque da empresa. Produtos com estoque restante inferior a <strong>{thresholdDays} dias</strong> são sugeridos para compra com meta de <strong>{targetCoverageDays} dias de cobertura</strong>.
          </p>
        </div>

        {/* Metrics Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mt-6 pt-6 border-t border-slate-100">
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-amber-100/70 text-amber-700 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                Itens p/ Repor
              </span>
              <span className="text-lg font-black text-amber-600">
                {metrics.totalSuggested} {metrics.totalSuggested === 1 ? 'Produto' : 'Produtos'}
              </span>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-rose-100/70 text-rose-700 flex items-center justify-center shrink-0">
              <TrendingDown className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                Críticos / Esgotados
              </span>
              <span className="text-lg font-black text-rose-600">
                {metrics.totalCritical} itens (&lt;7d)
              </span>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-blue-100/70 text-blue-700 flex items-center justify-center shrink-0">
              <Package className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                Volumes Sugeridos
              </span>
              <span className="text-lg font-black text-slate-800">
                {metrics.totalUnitsToBuy.toLocaleString('pt-BR')} un
              </span>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-emerald-100/70 text-emerald-700 flex items-center justify-center shrink-0">
              <DollarSign className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                Investimento Est.
              </span>
              <span className="text-lg font-black text-emerald-600">
                {formatCurrency(metrics.totalCostEstimated)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Control and Configuration Bar */}
      <div className="bg-white rounded-3xl p-4 sm:p-5 border border-slate-200 shadow-sm space-y-4">
        <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between">
          {/* Search */}
          <div className="relative w-full lg:w-72">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Buscar por produto, SKU ou EAN..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 placeholder-slate-400 focus:outline-none focus:border-amber-500"
            />
          </div>

          {/* Category Selector */}
          <div className="flex items-center gap-2 w-full lg:w-auto">
            <span className="text-xs font-bold text-slate-500 shrink-0">Categoria:</span>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="py-2 px-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-none focus:border-amber-500 cursor-pointer w-full sm:w-auto"
            >
              <option value="todos">Todas as Categorias</option>
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          {/* Status Tabs */}
          <div className="flex flex-wrap gap-1 p-1 bg-slate-100 rounded-2xl w-full lg:w-auto">
            <button
              onClick={() => setStatusFilter('sugestoes')}
              className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all ${
                statusFilter === 'sugestoes'
                  ? 'bg-white text-amber-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Sugeridos ({metrics.totalSuggested})
            </button>
            <button
              onClick={() => setStatusFilter('criticos')}
              className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all ${
                statusFilter === 'criticos'
                  ? 'bg-white text-rose-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Críticos &lt;7d ({metrics.totalCritical})
            </button>
            <button
              onClick={() => setStatusFilter('esgotados')}
              className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all ${
                statusFilter === 'esgotados'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Esgotados ({analysisData.filter((i) => i.isExhausted).length})
            </button>
            <button
              onClick={() => setStatusFilter('todos')}
              className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all ${
                statusFilter === 'todos'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Todos ({analysisData.length})
            </button>
          </div>
        </div>

        {/* Dynamic Parameter Sliders */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-3 border-t border-slate-100 text-xs">
          <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100 flex items-center justify-between gap-4">
            <div>
              <span className="font-bold text-slate-700 block">Ponto de Alerta de Estoque:</span>
              <span className="text-[11px] text-slate-500">Sugerir quando o estoque durar menos de:</span>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={thresholdDays}
                onChange={(e) => setThresholdDays(Number(e.target.value))}
                className="py-1 px-2.5 bg-white border border-slate-200 rounded-lg font-extrabold text-amber-700"
              >
                <option value={7}>7 dias (Crítico)</option>
                <option value={15}>15 dias (Padrão)</option>
                <option value={20}>20 dias</option>
                <option value={30}>30 dias</option>
                <option value={45}>45 dias</option>
              </select>
            </div>
          </div>

          <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100 flex items-center justify-between gap-4">
            <div>
              <span className="font-bold text-slate-700 block">Meta de Cobertura Desejada:</span>
              <span className="text-[11px] text-slate-500">Comprar quantidade suficiente para:</span>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={targetCoverageDays}
                onChange={(e) => setTargetCoverageDays(Number(e.target.value))}
                className="py-1 px-2.5 bg-white border border-slate-200 rounded-lg font-extrabold text-emerald-700"
              >
                <option value={15}>15 dias de estoque</option>
                <option value={30}>30 dias (Padrão 1 Mês)</option>
                <option value={45}>45 dias</option>
                <option value={60}>60 dias (2 Meses)</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Suggestion Table */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        {filteredItems.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <div className="w-14 h-14 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center justify-center mx-auto text-emerald-600">
              <CheckCircle2 className="w-7 h-7" />
            </div>
            <h3 className="text-base font-bold text-slate-800">
              Nenhum produto necessita de reposição neste filtro!
            </h3>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              Todos os produtos avaliados possuem estoque suficiente para atender a média diária de saída calculada.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-extrabold uppercase tracking-wider text-slate-500">
                  <th className="py-3.5 px-4 sm:px-6">Produto / Categoria</th>
                  <th className="py-3.5 px-4 text-center">Estoque Atual</th>
                  <th className="py-3.5 px-4 text-center">Giro 30d (Diário)</th>
                  <th className="py-3.5 px-4 text-center">Dias Restantes</th>
                  <th className="py-3.5 px-4 text-center">Status</th>
                  <th className="py-3.5 px-4 text-right">Qtd Sugerida</th>
                  <th className="py-3.5 px-4 sm:px-6 text-right">Custo Est.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {filteredItems.map((item) => {
                  const days = item.daysOfStockRemaining;
                  const isZero = item.totalCurrentStock <= 0;

                  return (
                    <tr
                      key={item.product.id}
                      className={`hover:bg-slate-50/80 transition-colors ${
                        item.isExhausted
                          ? 'bg-rose-50/30'
                          : item.isCritical
                          ? 'bg-amber-50/20'
                          : ''
                      }`}
                    >
                      {/* Produto */}
                      <td className="py-4 px-4 sm:px-6">
                        <div className="max-w-[240px]">
                          <span className="font-extrabold text-slate-900 block text-xs sm:text-sm truncate" title={item.product.name}>
                            {item.product.name}
                          </span>
                          <div className="flex items-center gap-2 text-[11px] text-slate-400 mt-0.5">
                            <span className="truncate">{item.product.category}</span>
                            {item.product.sku && (
                              <span className="font-mono bg-slate-100 px-1.5 py-0.2 rounded text-[10px] text-slate-600">
                                {item.product.sku}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Estoque Atual */}
                      <td className="py-4 px-4 text-center">
                        <div className="space-y-0.5">
                          <span className={`font-black text-xs ${isZero ? 'text-rose-600' : 'text-slate-900'}`}>
                            {item.totalCurrentStock} un
                          </span>
                          <div className="text-[10px] text-slate-400 flex items-center justify-center gap-1.5">
                            <span title="Depósito">D: {item.currentStockDeposito}</span>
                            <span>•</span>
                            <span title="Loja">L: {item.currentStockLoja}</span>
                          </div>
                        </div>
                      </td>

                      {/* Saídas 30d e Média Diária */}
                      <td className="py-4 px-4 text-center">
                        <div className="space-y-0.5">
                          <span className="font-bold text-slate-800 text-xs">
                            {item.dailyConsumption > 0 ? `${item.dailyConsumption.toFixed(1)} un/dia` : 'Sem saída'}
                          </span>
                          <span className="text-[10px] text-slate-400 block">
                            {item.totalOut30Days} un / 30d
                          </span>
                        </div>
                      </td>

                      {/* Dias de Estoque Restante */}
                      <td className="py-4 px-4 text-center">
                        {days !== null ? (
                          <div className="inline-flex flex-col items-center">
                            <span
                              className={`font-black text-xs px-2 py-0.5 rounded-lg ${
                                days <= 0
                                  ? 'bg-rose-100 text-rose-700'
                                  : days < 7
                                  ? 'bg-rose-50 text-rose-600 border border-rose-200'
                                  : days < thresholdDays
                                  ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                  : 'bg-emerald-50 text-emerald-700'
                              }`}
                            >
                              {Math.round(days)} {Math.round(days) === 1 ? 'dia' : 'dias'}
                            </span>
                          </div>
                        ) : (
                          <span className="text-[11px] text-slate-400 font-medium">
                            Sem saída recente
                          </span>
                        )}
                      </td>

                      {/* Status Badge */}
                      <td className="py-4 px-4 text-center">
                        {item.isExhausted ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-600 text-white uppercase tracking-wider">
                            Esgotado
                          </span>
                        ) : item.isCritical ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-100 text-rose-700 border border-rose-200 uppercase">
                            Crítico (&lt;7d)
                          </span>
                        ) : item.isSuggested ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                            Reposição
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700">
                            Adequado
                          </span>
                        )}
                      </td>

                      {/* Quantidade Sugerida */}
                      <td className="py-4 px-4 text-right">
                        <span
                          className={`font-black text-sm ${
                            item.suggestedPurchaseQty > 0
                              ? 'text-amber-600 bg-amber-50/80 px-2 py-0.5 rounded-lg border border-amber-200/80'
                              : 'text-slate-400'
                          }`}
                        >
                          {item.suggestedPurchaseQty > 0 ? `+${item.suggestedPurchaseQty} un` : '0'}
                        </span>
                      </td>

                      {/* Custo Estimado */}
                      <td className="py-4 px-4 sm:px-6 text-right">
                        <span className="font-extrabold text-slate-900 text-xs">
                          {item.estimatedCost > 0 ? formatCurrency(item.estimatedCost) : '-'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
