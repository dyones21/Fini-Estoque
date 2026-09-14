import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  Search,
  Filter,
  Layers,
  ArrowRightLeft,
  MinusCircle,
  Edit,
  Trash2,
  Plus,
  AlertTriangle,
  Clock,
  Boxes,
  Store,
  Warehouse,
  FileSpreadsheet,
  ShoppingBag,
  History,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  MoreVertical,
  DollarSign,
  Tag,
  TrendingUp,
  Package,
} from 'lucide-react';
import { useStock } from '../context/StockContext';
import { Product, ProductCategory, LocationType } from '../types';
import {
  formatCurrency,
  formatDate,
  getProductStock,
  isLowStock,
  getDaysToExpiration,
  calculateCurvaABC,
} from '../utils/inventoryUtils';
import { exportToExcel, exportToCSV } from '../utils/exportUtils';
import { getFriendlyErrorMessage } from '../utils/errorHandler';
import { ExportButton } from './ExportButton';

interface StockTableProps {
  locationMode: LocationType;
  onOpenTransferModalForProduct: (p: Product) => void;
  onOpenMovementModalForProduct: (p: Product) => void;
  onOpenEditProductModal: (p: Product) => void;
  onOpenNewProductModal: () => void;
  onOpenSaleModalForProduct?: (p: Product) => void;
  onOpenHistoryModalForProduct?: (p: Product) => void;
  onOpenNFModal?: () => void;
  onOpenGeneralTransferModal?: () => void;
  initialSearchQuery?: string;
  initialCategory?: string;
  initialStatus?: string;
  initialIsFiltersOpen?: boolean;
}

export const StockTable: React.FC<StockTableProps> = ({
  locationMode,
  onOpenTransferModalForProduct,
  onOpenMovementModalForProduct,
  onOpenEditProductModal,
  onOpenNewProductModal,
  onOpenSaleModalForProduct,
  onOpenHistoryModalForProduct,
  onOpenNFModal,
  onOpenGeneralTransferModal,
  initialSearchQuery = '',
  initialCategory = 'todos',
  initialStatus = 'todos',
  initialIsFiltersOpen = false,
}) => {
  const { products, categories, deleteProduct, currentUser, checkPermission } = useStock();

  const [searchQuery, setSearchQuery] = useState(initialSearchQuery);
  const [selectedCategory, setSelectedCategory] = useState<string>(initialCategory);
  const [selectedStatus, setSelectedStatus] = useState<string>(initialStatus);
  const [groupBy, setGroupBy] = useState<'nenhum' | 'categoria' | 'curva_abc'>('nenhum');
  const [expandedProductId, setExpandedProductId] = useState<string | null>(null);
  const [activeMenuProductId, setActiveMenuProductId] = useState<string | null>(null);
  const activeMenuRef = useRef<HTMLDivElement | null>(null);

  // Click outside listener for the action dropdown menu
  useEffect(() => {
    if (!activeMenuProductId) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (
        activeMenuRef.current &&
        !activeMenuRef.current.contains(event.target as Node)
      ) {
        setActiveMenuProductId(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [activeMenuProductId]);
  const [isFiltersOpen, setIsFiltersOpen] = useState(
    initialIsFiltersOpen ||
      !!initialSearchQuery ||
      (initialCategory !== 'todos' && !!initialCategory) ||
      (initialStatus !== 'todos' && !!initialStatus)
  );

  // React to initial filter changes from Dashboard drill-downs
  React.useEffect(() => {
    if (initialSearchQuery !== undefined) setSearchQuery(initialSearchQuery);
    if (initialCategory !== undefined) setSelectedCategory(initialCategory);
    if (initialStatus !== undefined) setSelectedStatus(initialStatus);

    if (
      initialSearchQuery ||
      (initialCategory && initialCategory !== 'todos') ||
      (initialStatus && initialStatus !== 'todos') ||
      initialIsFiltersOpen
    ) {
      setIsFiltersOpen(true);
    }
  }, [initialSearchQuery, initialCategory, initialStatus, initialIsFiltersOpen]);

  const isFilterActive =
    searchQuery !== '' ||
    selectedCategory !== 'todos' ||
    selectedStatus !== 'todos' ||
    groupBy !== 'nenhum';

  // Compute Curva ABC map
  const abcMap = useMemo(() => {
    const list = calculateCurvaABC(products);
    const map = new Map<string, 'A' | 'B' | 'C'>();
    list.forEach((item) => map.set(item.product.id, item.classABC));
    return map;
  }, [products]);

  // Filtered Products
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      // 1. Search Query
      const query = searchQuery.toLowerCase().trim();
      const safeEan = (p.ean || p.codeEAN || '').toLowerCase();
      const matchesSearch =
        !query ||
        p.name.toLowerCase().includes(query) ||
        p.sku.toLowerCase().includes(query) ||
        safeEan.includes(query) ||
        p.batchNumber.toLowerCase().includes(query);

      // 2. Category
      const matchesCategory =
        selectedCategory === 'todos' || p.category === selectedCategory;

      // 3. Status
      let matchesStatus = true;
      if (selectedStatus === 'estoque_baixo') {
        matchesStatus = isLowStock(p, locationMode);
      } else if (selectedStatus === 'estoque_baixo_loja') {
        matchesStatus = p.stockLoja <= p.minStockLoja;
      } else if (selectedStatus === 'estoque_baixo_deposito') {
        matchesStatus = p.stockDeposito <= p.minStockDeposito;
      } else if (selectedStatus === 'esgotado') {
        const stock = getProductStock(p, locationMode);
        matchesStatus = stock === 0;
      } else if (selectedStatus === 'validade_proxima') {
        const days = getDaysToExpiration(p.expirationDate);
        matchesStatus = days <= 30;
      }

      return matchesSearch && matchesCategory && matchesStatus;
    }).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  }, [products, searchQuery, selectedCategory, selectedStatus, locationMode]);

  // Grouped Products Map
  const groupedProducts = useMemo<Record<string, Product[]>>(() => {
    if (groupBy === 'nenhum') {
      return { 'Todos os Produtos': filteredProducts };
    }

    const map: Record<string, Product[]> = {};

    filteredProducts.forEach((p) => {
      let key = 'Outros';
      if (groupBy === 'categoria') {
        key = p.category;
      } else if (groupBy === 'curva_abc') {
        const abc = abcMap.get(p.id) || 'C';
        key = `Classe ${abc} (Curva ABC)`;
      }

      if (!map[key]) map[key] = [];
      map[key].push(p);
    });

    return map;
  }, [filteredProducts, groupBy, abcMap]);

  // Helper titles
  const getLocationTitle = () => {
    return { title: 'Gestão de Estoque & Depósitos', badge: 'Informações Unificadas' };
  };

  const locInfo = getLocationTitle();

  const handleExportExcel = () => {
    const data = filteredProducts.map((p) => {
      const totalStock = p.stockLoja + p.stockDeposito;
      const daysToExp = getDaysToExpiration(p.expirationDate);
      let statusValidade = 'Em dia';
      if (daysToExp < 0) statusValidade = 'Vencido';
      else if (daysToExp <= 30) statusValidade = `Próximo (<${daysToExp}d)`;

      return {
        SKU: p.sku,
        Produto: p.name,
        Categoria: p.category,
        Unidade: p.unit,
        'Cód. Barras (EAN)': p.ean || p.codeEAN || '',
        Lote: p.batchNumber,
        'Data Validade': p.expirationDate,
        'Status Validade': statusValidade,
        'Estoque Loja': p.stockLoja,
        'Estoque Mínimo Loja': p.minStockLoja,
        'Estoque Depósito': p.stockDeposito,
        'Estoque Mínimo Depósito': p.minStockDeposito,
        'Estoque Total': totalStock,
        'Custo Unitário (R$)': Number(p.costPrice.toFixed(2)),
        'Preço Venda (R$)': Number(p.sellPrice.toFixed(2)),
        'Valor Total Custo (R$)': Number((p.costPrice * totalStock).toFixed(2)),
        'Valor Total Venda (R$)': Number((p.sellPrice * totalStock).toFixed(2)),
      };
    });

    const dateStr = new Date().toISOString().slice(0, 10);
    const locSuffix = locationMode === 'loja' ? 'loja' : locationMode === 'deposito' ? 'deposito' : 'unificado';
    exportToExcel(data, `estoque_gummystock_${locSuffix}_${dateStr}`, 'Estoque');
  };

  const handleExportCSV = () => {
    const headers = [
      'SKU',
      'Produto',
      'Categoria',
      'Unidade',
      'EAN',
      'Lote',
      'Data Validade',
      'Estoque Loja',
      'Estoque Depósito',
      'Estoque Total',
      'Custo Unitário (R$)',
      'Preço Venda (R$)',
      'Valor Total Custo (R$)',
      'Valor Total Venda (R$)',
    ];

    const rows = filteredProducts.map((p) => {
      const totalStock = p.stockLoja + p.stockDeposito;
      return [
        p.sku,
        p.name,
        p.category,
        p.unit,
        p.ean || p.codeEAN || '',
        p.batchNumber,
        p.expirationDate,
        p.stockLoja,
        p.stockDeposito,
        totalStock,
        p.costPrice.toFixed(2),
        p.sellPrice.toFixed(2),
        (p.costPrice * totalStock).toFixed(2),
        (p.sellPrice * totalStock).toFixed(2),
      ];
    });

    const dateStr = new Date().toISOString().slice(0, 10);
    const locSuffix = locationMode === 'loja' ? 'loja' : locationMode === 'deposito' ? 'deposito' : 'unificado';
    exportToCSV(headers, rows, `estoque_gummystock_${locSuffix}_${dateStr}`);
  };

  return (
    <div className="space-y-4 animate-in fade-in duration-200">
      
      {/* Location Header Title & Add Button */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-3xl border border-slate-200 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-2xl bg-rose-50 text-rose-600 shrink-0">
            <Boxes className="w-6 h-6" />
          </div>
          <div className="text-left">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-black text-slate-900 text-left">{locInfo.title}</h2>
              <span className="text-[10px] font-extrabold px-2.5 py-0.5 rounded-full bg-rose-100 text-rose-800 uppercase text-left">
                {locInfo.badge}
              </span>
            </div>
            <p className="text-xs text-slate-500 text-left mt-0.5">
              Exibindo todos os {filteredProducts.length} produtos cadastrados sem duplicidade.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto">
          {/* Botão de Exportação de Dados Filtrados */}
          <ExportButton
            onExportExcel={handleExportExcel}
            onExportCSV={handleExportCSV}
            label="Exportar Estoque"
          />

          {onOpenGeneralTransferModal && checkPermission('canTransferStock') && (
            <button
              onClick={onOpenGeneralTransferModal}
              className="flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold px-4 py-2.5 h-10 rounded-xl text-xs shadow-xs transition-all shrink-0 flex-1 sm:flex-none"
              title="Transferir itens do Depósito Central para a Loja"
            >
              <ArrowRightLeft className="w-4 h-4 shrink-0" />
              <span>Transferir Estoque</span>
            </button>
          )}

          {onOpenNFModal && checkPermission('canAddNFEntries') && (
            <button
              onClick={onOpenNFModal}
              className="flex items-center justify-center gap-2 bg-rose-600 hover:bg-rose-700 text-white font-bold px-4 py-2.5 h-10 rounded-xl text-xs shadow-xs transition-all shrink-0 flex-1 sm:flex-none"
              title="Dar entrada em lote de produtos via Nota Fiscal"
            >
              <FileSpreadsheet className="w-4 h-4 text-rose-200 shrink-0" />
              <span>Dar Entrada com Nota Fiscal</span>
            </button>
          )}

          {checkPermission('canManageProducts') && (
            <button
              onClick={onOpenNewProductModal}
              className="flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-800 text-white font-bold px-4 py-2.5 h-10 rounded-xl text-xs shadow-xs transition-all shrink-0 flex-1 sm:flex-none"
              title="Cadastrar um novo produto manualmente"
            >
              <Plus className="w-4 h-4 text-rose-400 shrink-0" />
              <span>Cadastrar Novo Produto</span>
            </button>
          )}
        </div>
      </div>

      {/* Clean Info Banner explaining Baleiro / Open Package Rule */}
      <div className="bg-emerald-50/80 border border-emerald-200/80 rounded-2xl p-3.5 px-5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-emerald-950 font-semibold shadow-2xs">
        <div className="flex items-center gap-2.5">
          <ShoppingBag className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>
            <strong>Regra do Baleiro / Pacotes Abertos:</strong> Ao retirar pacotes para o baleiro, é feita a baixa do estoque fechado. <u>Pacotes abertos não são contabilizados no saldo do estoque.</u>
          </span>
        </div>
      </div>

      {/* Filter & Search Bar - Collapsible / Closed by Default */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div
          role="button"
          tabIndex={0}
          onClick={() => setIsFiltersOpen((prev) => !prev)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setIsFiltersOpen((prev) => !prev);
            }
          }}
          className="w-full flex items-center justify-between p-3.5 px-4 text-left font-bold text-xs text-slate-800 hover:bg-slate-50 transition-colors cursor-pointer select-none"
        >
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-slate-100 text-slate-600">
              <Filter className="w-4 h-4" />
            </div>
            <div>
              <span className="font-extrabold text-slate-900">Filtros & Pesquisa de Produtos</span>
              <span className="text-slate-400 font-normal ml-2 text-[11px]">
                (Clique para {isFiltersOpen ? 'recolher' : 'abrir e filtrar'})
              </span>
            </div>

            {isFilterActive && (
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-rose-100 text-rose-800 uppercase ml-2">
                Filtros Ativos
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 text-slate-400">
            {isFilterActive && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setSearchQuery('');
                  setSelectedCategory('todos');
                  setSelectedStatus('todos');
                  setGroupBy('nenhum');
                }}
                className="text-[11px] font-bold text-rose-600 hover:underline mr-2"
              >
                Limpar Filtros
              </button>
            )}
            {isFiltersOpen ? (
              <ChevronUp className="w-4 h-4 text-slate-500" />
            ) : (
              <ChevronDown className="w-4 h-4 text-slate-500" />
            )}
          </div>
        </div>

        {isFiltersOpen && (
          <div className="p-4 pt-2 border-t border-slate-100 space-y-3 bg-slate-50/40">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              
              {/* Search Input */}
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Buscar por Nome, SKU, EAN ou Lote..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 bg-white"
                />
              </div>

              {/* Category Filter */}
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-slate-400 shrink-0" />
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="w-full py-2 px-3 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 bg-white"
                >
                  <option value="todos">Todas as Categorias</option>
                  {categories.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              {/* Status Filter */}
              <div>
                <select
                  value={selectedStatus}
                  onChange={(e) => setSelectedStatus(e.target.value)}
                  className="w-full py-2 px-3 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 bg-white"
                >
                  <option value="todos">Todos os Status</option>
                  <option value="estoque_baixo">⚠️ Estoque Baixo (Geral)</option>
                  <option value="estoque_baixo_loja">🏪 Estoque Baixo na Loja</option>
                  <option value="estoque_baixo_deposito">🏭 Estoque Baixo no Depósito</option>
                  <option value="esgotado">🚫 Esgotado (Zero)</option>
                  <option value="validade_proxima">⏰ Validade Próxima (&lt;30d)</option>
                </select>
              </div>

              {/* Grouping Selector */}
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-slate-400 shrink-0" />
                <select
                  value={groupBy}
                  onChange={(e) =>
                    setGroupBy(e.target.value as 'nenhum' | 'categoria' | 'curva_abc')
                  }
                  className="w-full py-2 px-3 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 bg-white font-semibold text-rose-700"
                >
                  <option value="nenhum">Sem Agrupamento</option>
                  <option value="categoria">Agrupar por Categoria</option>
                  <option value="curva_abc">Agrupar por Curva ABC (Pareto)</option>
                </select>
              </div>

            </div>
          </div>
        )}
      </div>

      {/* Main Table rendering with Groups */}
      <div className="space-y-6">
        {(Object.entries(groupedProducts) as [string, Product[]][]).map(([groupTitle, itemsList]) => (
          <div
            key={groupTitle}
            className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden"
          >
            {groupBy !== 'nenhum' && (
              <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex items-center justify-between">
                <h3 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-rose-500" />
                  {groupTitle}
                </h3>
                <span className="text-[11px] font-bold text-slate-500 bg-slate-200/80 px-2 py-0.5 rounded-full">
                  {itemsList.length} itens
                </span>
              </div>
            )}

            {/* DESKTOP TABLE VIEW (hidden on mobile, visible on md and up) */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-600">
                <thead className="bg-slate-50/80 text-slate-500 font-bold uppercase tracking-wider border-b border-slate-200 text-[10px]">
                  <tr>
                    <th className="py-3 px-3 w-10 text-center" title="Expandir detalhes"></th>
                    <th className="py-3 px-4">SKU / EAN</th>
                    <th className="py-3 px-4">Produto & Categoria</th>
                    <th className="py-3 px-4 text-center text-sky-700 bg-sky-50/50">
                      Saldo Depósito
                    </th>
                    <th className="py-3 px-4 text-center text-amber-700 bg-amber-50/50">
                      Saldo Loja
                    </th>
                    <th className="py-3 px-4 text-center font-extrabold text-slate-900 bg-slate-100/60">
                      Soma Geral
                    </th>
                    <th className="py-3 px-3 w-14 text-center">Ações</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100">
                  {itemsList.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-slate-400 text-xs">
                        Nenhum produto encontrado com os filtros selecionados.
                      </td>
                    </tr>
                  ) : (
                    itemsList.map((product) => {
                      const totalStock = product.stockDeposito + product.stockLoja;
                      const isDepLow = product.stockDeposito <= product.minStockDeposito;
                      const isLojLow = product.stockLoja <= product.minStockLoja;
                      const daysExp = getDaysToExpiration(product.expirationDate);
                      const abcClass = abcMap.get(product.id) || 'C';
                      const isExpanded = expandedProductId === product.id;
                      const isMenuOpen = activeMenuProductId === product.id;

                      const marginPercent =
                        product.sellPrice > 0
                          ? (((product.sellPrice - product.costPrice) / product.sellPrice) * 100).toFixed(1)
                          : '0.0';

                      const isDirectlySearched =
                        searchQuery.trim().length > 0 &&
                        (product.name.toLowerCase().includes(searchQuery.toLowerCase().trim()) ||
                          product.sku.toLowerCase().includes(searchQuery.toLowerCase().trim()));

                      return (
                        <React.Fragment key={product.id}>
                          {/* Main Row */}
                          <tr
                            onClick={() => setExpandedProductId(isExpanded ? null : product.id)}
                            className={`cursor-pointer transition-colors ${
                              isDirectlySearched
                                ? 'bg-rose-50/80 hover:bg-rose-100/80 ring-2 ring-rose-400/60'
                                : isExpanded
                                ? 'bg-slate-50/90 font-medium'
                                : 'hover:bg-slate-50/80'
                            }`}
                          >
                            {/* Expand / Collapse Chevron */}
                            <td className="py-3 px-3 text-center">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setExpandedProductId(isExpanded ? null : product.id);
                                }}
                                className="p-1 rounded hover:bg-slate-200/70 text-slate-400 hover:text-slate-700 transition-all inline-flex items-center justify-center"
                                title={isExpanded ? 'Recolher detalhes' : 'Ver detalhes (Lote, Preços, Valor Total, Curva ABC)'}
                                aria-label="Expandir ou recolher detalhes"
                              >
                                <ChevronRight
                                  className={`w-4 h-4 transition-transform duration-200 ${
                                    isExpanded ? 'rotate-90 text-rose-600 font-bold' : 'text-slate-400'
                                  }`}
                                />
                              </button>
                            </td>

                            {/* SKU & EAN */}
                            <td className="py-3 px-4 font-mono text-[11px] text-slate-500">
                              <p className="font-bold text-slate-800">{product.sku}</p>
                              <p className="text-[10px] text-slate-400">{product.ean || product.codeEAN || '—'}</p>
                            </td>

                            {/* Name & Category */}
                            <td className="py-3 px-4">
                              <div className="flex items-center gap-1.5">
                                <p className="font-bold text-slate-900 text-xs">{product.name}</p>
                                {isDirectlySearched && (
                                  <span className="px-1.5 py-0.2 rounded text-[9px] font-black bg-rose-600 text-white uppercase tracking-wider">
                                    Localizado
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-1.5 mt-0.5">
                                <span className="text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.2 rounded">
                                  {product.category}
                                </span>
                                <span className="text-[10px] text-slate-400">• {product.unit}</span>
                              </div>
                            </td>

                            {/* Depósito Stock */}
                            <td
                              className={`py-3 px-4 text-center font-bold text-sky-800 bg-sky-50/20 ${
                                isDepLow ? 'bg-rose-50 text-rose-700' : ''
                              }`}
                            >
                              <span className="text-sm">{product.stockDeposito}</span>
                              {isDepLow && (
                                <span className="block text-[9px] font-extrabold text-rose-600 uppercase">
                                  Baixo (Min: {product.minStockDeposito})
                                </span>
                              )}
                            </td>

                            {/* Loja Stock */}
                            <td
                              className={`py-3 px-4 text-center font-bold text-amber-800 bg-amber-50/20 ${
                                isLojLow ? 'bg-rose-50 text-rose-700' : ''
                              }`}
                            >
                              <span className="text-sm">{product.stockLoja}</span>
                              {isLojLow && (
                                <span className="block text-[9px] font-extrabold text-rose-600 uppercase">
                                  Repor (Min: {product.minStockLoja})
                                </span>
                              )}
                            </td>

                            {/* Soma Geral */}
                            <td className="py-3 px-4 text-center font-extrabold text-slate-900 bg-slate-50 text-sm">
                              {totalStock}
                            </td>

                            {/* Single Action Menu (⋮) */}
                            <td className="py-3 px-3 text-center">
                              <div
                                className="relative inline-block text-left"
                                ref={isMenuOpen ? activeMenuRef : null}
                              >
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setActiveMenuProductId((prev) => (prev === product.id ? null : product.id));
                                  }}
                                  className={`p-1.5 rounded-lg border transition-colors ${
                                    isMenuOpen
                                      ? 'bg-rose-100 text-rose-800 border-rose-300'
                                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200 border-slate-200'
                                  }`}
                                  title="Opções do Produto"
                                  aria-label="Abrir menu de ações"
                                >
                                  <MoreVertical className="w-4 h-4" />
                                </button>

                                {isMenuOpen && (
                                  <div
                                    onClick={(e) => e.stopPropagation()}
                                    className="absolute right-0 top-full mt-1.5 z-50 min-w-[210px] bg-white border border-slate-200 rounded-xl shadow-xl py-1 text-xs font-semibold text-slate-700 divide-y divide-slate-100 animate-in fade-in zoom-in-95 duration-100 text-left"
                                  >
                                    <div className="py-1">
                                      {/* Histórico */}
                                      {onOpenHistoryModalForProduct && (
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setActiveMenuProductId(null);
                                            onOpenHistoryModalForProduct(product);
                                          }}
                                          className="w-full px-3 py-2 text-left flex items-center gap-2.5 hover:bg-slate-50 transition-colors text-slate-700"
                                        >
                                          <History className="w-4 h-4 text-slate-500 shrink-0" />
                                          <span>Histórico de Movimentações</span>
                                        </button>
                                      )}

                                      {/* Baixa para Baleiro (Loja) */}
                                      {onOpenSaleModalForProduct && checkPermission('canRegisterMovements') && (
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setActiveMenuProductId(null);
                                            onOpenSaleModalForProduct(product);
                                          }}
                                          className="w-full px-3 py-2 text-left flex items-center gap-2.5 hover:bg-emerald-50 text-emerald-800 transition-colors"
                                        >
                                          <ShoppingBag className="w-4 h-4 text-emerald-600 shrink-0" />
                                          <span>Baixa para Baleiro (Loja)</span>
                                        </button>
                                      )}

                                      {/* Transferir do Depósito para a Loja */}
                                      {checkPermission('canTransferStock') && (
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setActiveMenuProductId(null);
                                            onOpenTransferModalForProduct(product);
                                          }}
                                          className="w-full px-3 py-2 text-left flex items-center gap-2.5 hover:bg-sky-50 text-sky-700 transition-colors"
                                        >
                                          <ArrowRightLeft className="w-4 h-4 text-sky-600 shrink-0" />
                                          <span>Transferir Depósito ➔ Loja</span>
                                        </button>
                                      )}

                                      {/* Ajuste / Perda / Outras Baixas */}
                                      {checkPermission('canRegisterMovements') && (
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setActiveMenuProductId(null);
                                            onOpenMovementModalForProduct(product);
                                          }}
                                          className="w-full px-3 py-2 text-left flex items-center gap-2.5 hover:bg-amber-50 text-amber-800 transition-colors"
                                        >
                                          <MinusCircle className="w-4 h-4 text-amber-600 shrink-0" />
                                          <span>Ajuste / Perda / Saída</span>
                                        </button>
                                      )}
                                    </div>

                                    {/* Gerenciamento (Editar / Excluir) */}
                                    {checkPermission('canManageProducts') && (
                                      <div className="py-1">
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setActiveMenuProductId(null);
                                            onOpenEditProductModal(product);
                                          }}
                                          className="w-full px-3 py-2 text-left flex items-center gap-2.5 hover:bg-slate-50 text-slate-700 transition-colors"
                                        >
                                          <Edit className="w-4 h-4 text-slate-500 shrink-0" />
                                          <span>Editar Produto</span>
                                        </button>

                                        <button
                                          type="button"
                                          onClick={async (e) => {
                                            e.stopPropagation();
                                            setActiveMenuProductId(null);
                                            if (
                                              confirm(
                                                `Tem certeza que deseja excluir "${product.name}" do sistema?`
                                              )
                                            ) {
                                              try {
                                                await deleteProduct(product.id);
                                                alert(`Produto "${product.name}" excluído com sucesso!`);
                                              } catch (err: any) {
                                                alert(getFriendlyErrorMessage(err, 'Falha ao excluir produto no servidor.'));
                                              }
                                            }
                                          }}
                                          className="w-full px-3 py-2 text-left flex items-center gap-2.5 hover:bg-rose-50 text-rose-600 transition-colors"
                                        >
                                          <Trash2 className="w-4 h-4 text-rose-500 shrink-0" />
                                          <span>Excluir Produto</span>
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>

                          {/* Expandable Details Row */}
                          {isExpanded && (
                            <tr className="bg-slate-50/90 border-b border-slate-200/80">
                              <td colSpan={7} className="p-3.5 sm:p-4 bg-slate-50/70">
                                <div className="grid grid-cols-1 md:grid-cols-4 gap-3 bg-white p-3.5 rounded-xl border border-slate-200/80 shadow-2xs">
                                  {/* Card 1: Lote & Validade */}
                                  <div className="p-3 bg-slate-50/80 rounded-lg border border-slate-100 space-y-1">
                                    <div className="flex items-center gap-1.5 text-slate-500 font-bold text-[11px] uppercase tracking-wider">
                                      <Clock className="w-3.5 h-3.5 text-slate-400" />
                                      <span>Lote & Validade</span>
                                    </div>
                                    <div className="pt-1">
                                      <p className="text-xs text-slate-800 font-semibold">
                                        Validade: <strong className={daysExp < 0 ? 'text-rose-600' : daysExp <= 30 ? 'text-amber-600' : 'text-slate-900'}>{formatDate(product.expirationDate)}</strong>
                                      </p>
                                      <p className="text-[11px] text-slate-500 font-mono mt-0.5">
                                        Lote: <strong className="text-slate-700">{product.batchNumber || 'N/A'}</strong>
                                      </p>
                                      <span
                                        className={`inline-block mt-1.5 px-2 py-0.5 rounded text-[10px] font-bold ${
                                          daysExp < 0
                                            ? 'bg-rose-100 text-rose-700'
                                            : daysExp <= 30
                                            ? 'bg-amber-100 text-amber-800'
                                            : 'bg-emerald-100 text-emerald-800'
                                        }`}
                                      >
                                        {daysExp < 0 ? '⚠️ Vencido' : daysExp <= 30 ? `⏰ Vence em ${daysExp} dias` : `✓ Em dia (${daysExp} dias)`}
                                      </span>
                                    </div>
                                  </div>

                                  {/* Card 2: Custo, Venda & Margem */}
                                  <div className="p-3 bg-slate-50/80 rounded-lg border border-slate-100 space-y-1">
                                    <div className="flex items-center gap-1.5 text-slate-500 font-bold text-[11px] uppercase tracking-wider">
                                      <Tag className="w-3.5 h-3.5 text-slate-400" />
                                      <span>Custo & Venda</span>
                                    </div>
                                    <div className="pt-1 space-y-0.5">
                                      <div className="flex justify-between items-center text-xs">
                                        <span className="text-slate-500">Custo Unitário:</span>
                                        <span className="font-bold text-slate-800">{formatCurrency(product.costPrice)}</span>
                                      </div>
                                      <div className="flex justify-between items-center text-xs">
                                        <span className="text-slate-500">Preço de Venda:</span>
                                        <span className="font-extrabold text-rose-600">{formatCurrency(product.sellPrice)}</span>
                                      </div>
                                      <div className="flex justify-between items-center text-[11px] pt-1 border-t border-slate-200/60">
                                        <span className="text-slate-500">Margem Bruta:</span>
                                        <span className="font-bold text-emerald-700">{marginPercent}%</span>
                                      </div>
                                    </div>
                                  </div>

                                  {/* Card 3: Valor Total em Estoque */}
                                  <div className="p-3 bg-slate-50/80 rounded-lg border border-slate-100 space-y-1">
                                    <div className="flex items-center gap-1.5 text-slate-500 font-bold text-[11px] uppercase tracking-wider">
                                      <TrendingUp className="w-3.5 h-3.5 text-slate-400" />
                                      <span>Valor em Estoque</span>
                                    </div>
                                    <div className="pt-1 space-y-0.5">
                                      <div className="flex justify-between items-center text-xs">
                                        <span className="text-slate-500">Total em Custo:</span>
                                        <span className="font-black text-slate-900">{formatCurrency(totalStock * product.costPrice)}</span>
                                      </div>
                                      <div className="flex justify-between items-center text-[10px] text-slate-500">
                                        <span>Depósito: {formatCurrency(product.stockDeposito * product.costPrice)}</span>
                                        <span>Loja: {formatCurrency(product.stockLoja * product.costPrice)}</span>
                                      </div>
                                      <div className="flex justify-between items-center text-[11px] pt-1 border-t border-slate-200/60">
                                        <span className="text-slate-500">Potencial de Venda:</span>
                                        <span className="font-bold text-slate-700">{formatCurrency(totalStock * product.sellPrice)}</span>
                                      </div>
                                    </div>
                                  </div>

                                  {/* Card 4: Curva ABC & Parâmetros */}
                                  <div className="p-3 bg-slate-50/80 rounded-lg border border-slate-100 space-y-1">
                                    <div className="flex items-center gap-1.5 text-slate-500 font-bold text-[11px] uppercase tracking-wider">
                                      <Layers className="w-3.5 h-3.5 text-slate-400" />
                                      <span>Curva ABC & Mínimos</span>
                                    </div>
                                    <div className="pt-1 space-y-1">
                                      <div className="flex items-center gap-2">
                                        <span
                                          className={`inline-block px-2 py-0.5 rounded font-black text-xs ${
                                            abcClass === 'A'
                                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                                              : abcClass === 'B'
                                              ? 'bg-amber-100 text-amber-800 border border-amber-300'
                                              : 'bg-slate-100 text-slate-600 border border-slate-300'
                                          }`}
                                        >
                                          Classe {abcClass}
                                        </span>
                                        <span className="text-[10px] text-slate-500">
                                          {abcClass === 'A' ? 'Alto impacto' : abcClass === 'B' ? 'Médio impacto' : 'Baixo impacto'}
                                        </span>
                                      </div>
                                      <div className="text-[10px] text-slate-500 space-y-0.5 pt-0.5">
                                        <p>Mín. Depósito: <strong className="text-slate-700">{product.minStockDeposito} {product.unit}</strong></p>
                                        <p>Mín. Loja: <strong className="text-slate-700">{product.minStockLoja} {product.unit}</strong></p>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* MOBILE CARDS VIEW (visible on small screens, hidden on md and up) */}
            <div className="block md:hidden p-3 space-y-3 bg-slate-50/50">
              {itemsList.length === 0 ? (
                <p className="py-6 text-center text-slate-400 text-xs">
                  Nenhum produto encontrado.
                </p>
              ) : (
                itemsList.map((product) => {
                  const totalStock = product.stockDeposito + product.stockLoja;
                  const isDepLow = product.stockDeposito <= product.minStockDeposito;
                  const isLojLow = product.stockLoja <= product.minStockLoja;
                  const daysExp = getDaysToExpiration(product.expirationDate);
                  const abcClass = abcMap.get(product.id) || 'C';

                  const isDirectlySearched =
                    searchQuery.trim().length > 0 &&
                    (product.name.toLowerCase().includes(searchQuery.toLowerCase().trim()) ||
                      product.sku.toLowerCase().includes(searchQuery.toLowerCase().trim()));

                  return (
                    <div
                      key={product.id}
                      className={`rounded-xl border p-3.5 shadow-2xs space-y-3 text-left transition-all ${
                        isDirectlySearched
                          ? 'bg-rose-50/90 border-rose-300 ring-2 ring-rose-400/60'
                          : 'bg-white border-slate-200'
                      }`}
                    >
                      {/* Top Header: SKU/EAN + Name + Badges */}
                      <div>
                        <div className="flex items-start justify-between gap-2">
                          <span className="font-extrabold text-slate-900 text-sm leading-tight text-left">
                            {product.name}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded font-black text-[10px] shrink-0 ${
                              abcClass === 'A'
                                ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                                : abcClass === 'B'
                                ? 'bg-amber-100 text-amber-800 border border-amber-300'
                                : 'bg-slate-100 text-slate-600 border border-slate-300'
                            }`}
                          >
                            ABC: {abcClass}
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5 mt-1">
                          <span className="font-mono text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded font-bold">
                            SKU: {product.sku}
                          </span>
                          <span className="text-[10px] text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded font-medium">
                            {product.category}
                          </span>
                          <span className="text-[10px] text-slate-400 font-mono">
                            Lote: {product.batchNumber}
                          </span>
                        </div>
                      </div>

                      {/* Expiration Warning if close */}
                      <div className="flex items-center justify-between text-[11px] pt-1 border-t border-slate-100">
                        <span className="text-slate-500 flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5 text-slate-400" />
                          Validade:
                        </span>
                        <span
                          className={`font-bold ${
                            daysExp < 0
                              ? 'text-rose-600'
                              : daysExp <= 30
                              ? 'text-amber-600'
                              : 'text-slate-700'
                          }`}
                        >
                          {formatDate(product.expirationDate)}{' '}
                          {daysExp <= 30 && `(${daysExp < 0 ? 'Vencido!' : `${daysExp}d`})`}
                        </span>
                      </div>

                      {/* Stock Balances Row (Depósito & Loja) */}
                      <div className="grid grid-cols-3 gap-2 py-1">
                        <div className={`p-2 rounded-lg text-center ${isDepLow ? 'bg-rose-50 border border-rose-200' : 'bg-sky-50/80 border border-sky-100'}`}>
                          <span className="text-[10px] font-bold text-sky-800 uppercase block">Depósito</span>
                          <span className="text-sm font-extrabold text-sky-900">{product.stockDeposito}</span>
                          {isDepLow && <span className="block text-[8px] font-bold text-rose-600 uppercase">Baixo</span>}
                        </div>

                        <div className={`p-2 rounded-lg text-center ${isLojLow ? 'bg-rose-50 border border-rose-200' : 'bg-amber-50/80 border border-amber-100'}`}>
                          <span className="text-[10px] font-bold text-amber-800 uppercase block">Loja</span>
                          <span className="text-sm font-extrabold text-amber-900">{product.stockLoja}</span>
                          {isLojLow && <span className="block text-[8px] font-bold text-rose-600 uppercase">Repor</span>}
                        </div>

                        <div className="p-2 rounded-lg text-center bg-slate-100 border border-slate-200">
                          <span className="text-[10px] font-bold text-slate-600 uppercase block">Total</span>
                          <span className="text-sm font-black text-slate-900">{totalStock}</span>
                        </div>
                      </div>

                      {/* Prices Row */}
                      <div className="flex items-center justify-between text-xs font-semibold bg-slate-50 p-2 rounded-lg">
                        <div>
                          <span className="text-[10px] text-slate-400 block">Custo:</span>
                          <span className="text-slate-700 font-bold">{formatCurrency(product.costPrice)}</span>
                        </div>
                        <div className="text-right">
                          <span className="text-[10px] text-rose-500 block">Venda:</span>
                          <span className="text-rose-700 font-extrabold">{formatCurrency(product.sellPrice)}</span>
                        </div>
                      </div>

                      {/* Touch Friendly Action Buttons Grid */}
                      <div className="grid grid-cols-2 xs:grid-cols-3 gap-1.5 pt-1">
                        {onOpenHistoryModalForProduct && (
                          <button
                            onClick={() => onOpenHistoryModalForProduct(product)}
                            className="py-2 px-2 rounded-lg bg-slate-800 text-white font-bold text-[11px] flex items-center justify-center gap-1 shadow-2xs text-left"
                            title="Ver Histórico de Movimentações"
                          >
                            <History className="w-3.5 h-3.5 shrink-0 text-rose-400" />
                            <span>Histórico</span>
                          </button>
                        )}

                        {onOpenSaleModalForProduct && checkPermission('canRegisterMovements') && (
                          <button
                            onClick={() => onOpenSaleModalForProduct(product)}
                            className="py-2 px-2 rounded-lg bg-emerald-600 text-white font-bold text-[11px] flex items-center justify-center gap-1 shadow-2xs text-left"
                          >
                            <ShoppingBag className="w-3.5 h-3.5 shrink-0" />
                            <span>Baixa Loja</span>
                          </button>
                        )}

                        {checkPermission('canTransferStock') && (
                          <button
                            onClick={() => onOpenTransferModalForProduct(product)}
                            className="py-2 px-2 rounded-lg bg-sky-600 text-white font-bold text-[11px] flex items-center justify-center gap-1 shadow-2xs text-left"
                          >
                            <ArrowRightLeft className="w-3.5 h-3.5 shrink-0" />
                            <span>Transferir</span>
                          </button>
                        )}

                        {checkPermission('canRegisterMovements') && (
                          <button
                            onClick={() => onOpenMovementModalForProduct(product)}
                            className="py-2 px-2 rounded-lg bg-amber-500 text-white font-bold text-[11px] flex items-center justify-center gap-1 shadow-2xs text-left"
                          >
                            <MinusCircle className="w-3.5 h-3.5 shrink-0" />
                            <span>Ajuste</span>
                          </button>
                        )}

                        {checkPermission('canManageProducts') && (
                          <>
                            <button
                              onClick={() => onOpenEditProductModal(product)}
                              className="py-2 px-2 rounded-lg bg-slate-200 text-slate-800 font-bold text-[11px] flex items-center justify-center gap-1 text-left"
                            >
                              <Edit className="w-3.5 h-3.5 shrink-0" />
                              <span>Editar</span>
                            </button>

                            <button
                              onClick={async () => {
                                if (
                                  confirm(
                                    `Tem certeza que deseja excluir "${product.name}"?`
                                  )
                                ) {
                                  try {
                                    await deleteProduct(product.id);
                                    alert(`Produto "${product.name}" excluído com sucesso!`);
                                  } catch (err: any) {
                                    alert(getFriendlyErrorMessage(err, 'Falha ao excluir produto no servidor.'));
                                  }
                                }
                              }}
                              className="py-2 px-2 rounded-lg bg-rose-100 text-rose-700 font-bold text-[11px] flex items-center justify-center gap-1 text-left"
                            >
                              <Trash2 className="w-3.5 h-3.5 shrink-0" />
                              <span>Excluir</span>
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        ))}
      </div>

    </div>
  );
};
