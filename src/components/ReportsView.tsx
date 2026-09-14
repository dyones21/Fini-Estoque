import React, { useState, useMemo } from 'react';
import {
  FileText,
  Printer,
  Download,
  Filter,
  RefreshCw,
  Search,
  Calendar,
  Store,
  Warehouse,
  Boxes,
  FileSpreadsheet,
  AlertTriangle,
  Clock,
  CheckCircle2,
  TrendingUp,
  ArrowRightLeft,
  DollarSign,
  Tag,
  Eye,
  EyeOff,
  SlidersHorizontal,
  Layers,
  ChevronDown,
  Trash2,
  Loader2,
  AlertCircle,
  X,
} from 'lucide-react';
import { useStock } from '../context/StockContext';
import { Product, ProductCategory, StockMovement, NFEntry, StockTransfer } from '../types';
import { formatCurrency, formatDateTime, getDaysToExpiration, isLowStock } from '../utils/inventoryUtils';
import { exportToExcel, exportToCSV } from '../utils/exportUtils';
import { ExportButton } from './ExportButton';

export type ReportType =
  | 'posicao_estoque'
  | 'movimentacoes'
  | 'vencimentos'
  | 'notas_fiscais'
  | 'curva_abc';

export const ReportsView: React.FC = () => {
  const { products, movements, nfEntries, transfers, currentUser, deleteNFEntry, checkPermission } = useStock();
  const canDeleteNF = checkPermission ? checkPermission('canDeleteNFEntries') : false;

  // Selected Report Type
  const [reportType, setReportType] = useState<ReportType>('posicao_estoque');

  // NF Deletion Modal State
  const [nfToDelete, setNfToDelete] = useState<NFEntry | null>(null);
  const [isDeletingNF, setIsDeletingNF] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteSuccess, setDeleteSuccess] = useState<string | null>(null);

  const handleConfirmDeleteNF = async () => {
    if (!nfToDelete) return;
    setIsDeletingNF(true);
    setDeleteError(null);
    setDeleteSuccess(null);
    try {
      const res = await deleteNFEntry(nfToDelete.id);
      setDeleteSuccess(res.message || 'Nota Fiscal excluída e estoque revertido com sucesso.');
      setTimeout(() => {
        setDeleteSuccess(null);
        setNfToDelete(null);
      }, 1200);
    } catch (err: any) {
      setDeleteError(err.message || 'Falha ao excluir Nota Fiscal.');
    } finally {
      setIsDeletingNF(false);
    }
  };

  // Filters State
  const [locationFilter, setLocationFilter] = useState<'geral' | 'loja' | 'deposito'>('geral');
  const [categoryFilter, setCategoryFilter] = useState<string>('todos');
  const [statusFilter, setStatusFilter] = useState<string>('todos');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sortBy, setSortBy] = useState<string>('nome_asc');

  // Column Visibility Customization
  const [showCostPrices, setShowCostPrices] = useState<boolean>(true);
  const [showSellPrices, setShowSellPrices] = useState<boolean>(true);
  const [showSKU, setShowSKU] = useState<boolean>(true);
  const [showBatchAndExp, setShowBatchAndExp] = useState<boolean>(true);
  const [showFiltersPanel, setShowFiltersPanel] = useState<boolean>(true);

  // Extract Categories
  const categoriesList = useMemo(() => {
    const set = new Set<string>();
    products.forEach((p) => set.add(p.category));
    return Array.from(set).sort();
  }, [products]);

  // Reset Filters
  const handleResetFilters = () => {
    setLocationFilter('geral');
    setCategoryFilter('todos');
    setStatusFilter('todos');
    setStartDate('');
    setEndDate('');
    setSearchQuery('');
    setSortBy('nome_asc');
  };

  // ================= 1. FILTERED POSIÇÃO DE ESTOQUE =================
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      // Category
      if (categoryFilter !== 'todos' && p.category !== categoryFilter) return false;

      // Location / Non-zero stock filter
      const totalStock = p.stockLoja + p.stockDeposito;
      if (locationFilter === 'loja' && p.stockLoja <= 0 && statusFilter !== 'zerado') {
        // allow if specifically filtering status
      }

      // Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = p.name.toLowerCase().includes(q);
        const matchSKU = p.sku.toLowerCase().includes(q);
        const matchEAN = p.ean.toLowerCase().includes(q);
        const matchCategory = p.category.toLowerCase().includes(q);
        if (!matchName && !matchSKU && !matchEAN && !matchCategory) return false;
      }

      // Status
      const daysToExp = getDaysToExpiration(p.expirationDate);
      if (statusFilter === 'estoque_baixo') {
        if (!isLowStock(p, locationFilter)) return false;
      } else if (statusFilter === 'validade_proxima') {
        if (daysToExp < 0 || daysToExp > 30) return false;
      } else if (statusFilter === 'vencido') {
        if (daysToExp >= 0) return false;
      } else if (statusFilter === 'zerado') {
        if (totalStock > 0) return false;
      } else if (statusFilter === 'disponivel') {
        if (totalStock <= 0) return false;
      }

      return true;
    }).sort((a, b) => {
      if (sortBy === 'nome_asc') return a.name.localeCompare(b.name, 'pt-BR');
      if (sortBy === 'nome_desc') return b.name.localeCompare(a.name, 'pt-BR');
      if (sortBy === 'custo_maior') return (b.costPrice * (b.stockLoja + b.stockDeposito)) - (a.costPrice * (a.stockLoja + a.stockDeposito));
      if (sortBy === 'venda_maior') return (b.sellPrice * (b.stockLoja + b.stockDeposito)) - (a.sellPrice * (a.stockLoja + a.stockDeposito));
      if (sortBy === 'qtd_maior') return (b.stockLoja + b.stockDeposito) - (a.stockLoja + a.stockDeposito);
      if (sortBy === 'validade_mais_proxima') return new Date(a.expirationDate).getTime() - new Date(b.expirationDate).getTime();
      return 0;
    });
  }, [products, categoryFilter, locationFilter, statusFilter, searchQuery, sortBy]);

  // Summary Metrics for Stock
  const stockMetrics = useMemo(() => {
    let totalItemsCount = 0;
    let totalCostVal = 0;
    let totalSellVal = 0;
    let totalLojaItems = 0;
    let totalDepositoItems = 0;

    filteredProducts.forEach((p) => {
      const totalUnits = p.stockLoja + p.stockDeposito;
      totalItemsCount += totalUnits;
      totalLojaItems += p.stockLoja;
      totalDepositoItems += p.stockDeposito;
      totalCostVal += totalUnits * p.costPrice;
      totalSellVal += totalUnits * p.sellPrice;
    });

    return {
      skuCount: filteredProducts.length,
      totalItemsCount,
      totalLojaItems,
      totalDepositoItems,
      totalCostVal,
      totalSellVal,
      estimatedProfit: totalSellVal - totalCostVal,
    };
  }, [filteredProducts]);

  // ================= 2. FILTERED MOVIMENTAÇÕES =================
  const filteredMovements = useMemo(() => {
    return movements.filter((m) => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchProd = m.productName.toLowerCase().includes(q);
        const matchUser = m.userName.toLowerCase().includes(q);
        const matchReason = (m.reason || '').toLowerCase().includes(q);
        if (!matchProd && !matchUser && !matchReason) return false;
      }

      if (locationFilter === 'loja' && m.location === 'deposito') return false;
      if (locationFilter === 'deposito' && m.location === 'loja') return false;

      if (startDate) {
        if (new Date(m.date) < new Date(startDate + 'T00:00:00')) return false;
      }
      if (endDate) {
        if (new Date(m.date) > new Date(endDate + 'T23:59:59')) return false;
      }

      return true;
    }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [movements, searchQuery, locationFilter, startDate, endDate]);

  // ================= 3. FILTERED VENCIMENTOS =================
  const filteredVencimentos = useMemo(() => {
    return products.map((p) => {
      const days = getDaysToExpiration(p.expirationDate);
      return { product: p, days };
    }).filter(({ product, days }) => {
      if (categoryFilter !== 'todos' && product.category !== categoryFilter) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        if (!product.name.toLowerCase().includes(q) && !product.sku.toLowerCase().includes(q)) return false;
      }

      if (statusFilter === 'vencido') return days < 0;
      if (statusFilter === 'validade_proxima') return days >= 0 && days <= 30;

      // Default for Vencimentos tab: show items with expiration date set
      return true;
    }).sort((a, b) => a.days - b.days || a.product.name.localeCompare(b.product.name, 'pt-BR'));
  }, [products, categoryFilter, searchQuery, statusFilter]);

  // ================= 4. FILTERED NOTAS FISCAIS =================
  const filteredNFs = useMemo(() => {
    return nfEntries.filter((nf) => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchNum = nf.numberNF.toLowerCase().includes(q);
        const matchSup = nf.supplier.toLowerCase().includes(q);
        const matchKey = (nf.accessKey || '').toLowerCase().includes(q);
        if (!matchNum && !matchSup && !matchKey) return false;
      }

      if (startDate) {
        if (new Date(nf.receiveDate) < new Date(startDate + 'T00:00:00')) return false;
      }
      if (endDate) {
        if (new Date(nf.receiveDate) > new Date(endDate + 'T23:59:59')) return false;
      }

      return true;
    }).sort((a, b) => new Date(b.receiveDate).getTime() - new Date(a.receiveDate).getTime());
  }, [nfEntries, searchQuery, startDate, endDate]);

  // ================= 5. CURVA ABC =================
  const abcAnalysis = useMemo(() => {
    const sorted = [...products].map((product) => {
      const totalUnits = (Number(product.stockDeposito) || 0) + (Number(product.stockLoja) || 0);
      const unitCost = Number(product.costPrice) > 0 ? Number(product.costPrice) : (Number(product.sellPrice) || 0);
      const stockVal = totalUnits * unitCost;
      return {
        product,
        totalStockVal: stockVal,
        totalUnits,
      };
    }).sort((a, b) => b.totalStockVal - a.totalStockVal);

    const grandTotal = sorted.reduce((sum, p) => sum + p.totalStockVal, 0);

    let cumulative = 0;
    return sorted.map(({ product, totalStockVal, totalUnits }) => {
      const revPct = grandTotal > 0 ? (totalStockVal / grandTotal) * 100 : 0;
      cumulative += revPct;

      let classABC: 'A' | 'B' | 'C' = 'C';
      if (cumulative <= 80 || revPct >= 15) {
        classABC = 'A';
      } else if (cumulative <= 95) {
        classABC = 'B';
      }

      return {
        product,
        totalRevenue: totalStockVal,
        revenuePercentage: revPct,
        cumulativePercentage: cumulative,
        classABC,
      };
    });
  }, [products]);

  // Handler for Printing / PDF Export
  const handlePrintPDF = () => {
    window.print();
  };

  // Handler for Exporting Excel (.xlsx)
  const handleExportExcel = () => {
    const dateStr = new Date().toISOString().slice(0, 10);
    const fileName = `relatorio_${reportType}_${dateStr}`;

    if (reportType === 'posicao_estoque') {
      const data = filteredProducts.map((p) => {
        const total = p.stockLoja + p.stockDeposito;
        return {
          SKU: p.sku,
          'Cód. Barras (EAN)': p.ean || '',
          Produto: p.name,
          Categoria: p.category,
          Embalagem: p.unit,
          'Estoque Loja': p.stockLoja,
          'Estoque Depósito': p.stockDeposito,
          'Estoque Total': total,
          'Preço Custo (R$)': Number(p.costPrice.toFixed(2)),
          'Preço Venda (R$)': Number(p.sellPrice.toFixed(2)),
          'Valor Custo Total (R$)': Number((total * p.costPrice).toFixed(2)),
          'Valor Venda Total (R$)': Number((total * p.sellPrice).toFixed(2)),
          Lote: p.batchNumber,
          'Data Validade': p.expirationDate,
        };
      });
      exportToExcel(data, fileName, 'Posição de Estoque');
    } else if (reportType === 'movimentacoes') {
      const data = filteredMovements.map((m) => ({
        'Data/Hora': m.date,
        Produto: m.productName,
        'Tipo Movimento': m.type,
        Quantidade: m.quantity,
        Local: m.location,
        'Valor Unit. (R$)': Number((m.unitPrice || 0).toFixed(2)),
        'Valor Total (R$)': Number((m.totalValue || 0).toFixed(2)),
        'Usuário': m.userName,
        Motivo: m.reason || '',
      }));
      exportToExcel(data, fileName, 'Movimentações');
    } else if (reportType === 'notas_fiscais') {
      const data = filteredNFs.map((nf) => ({
        'Número NF': nf.numberNF,
        Fornecedor: nf.supplier,
        'CNPJ Fornecedor': nf.cnpjSupplier,
        'Data Emissão': nf.issueDate,
        'Data Recebimento': nf.receiveDate,
        'Qtd Total Itens': nf.items.reduce((acc, i) => acc + i.quantity, 0),
        'Valor Total (R$)': Number(nf.totalValue.toFixed(2)),
        'Chave Acesso': nf.accessKey || '',
        'Responsável': nf.createdBy,
      }));
      exportToExcel(data, fileName, 'Notas Fiscais');
    } else if (reportType === 'vencimentos') {
      const data = filteredVencimentos.map(({ product, days }) => ({
        SKU: product.sku,
        Produto: product.name,
        Categoria: product.category,
        'Estoque Total': product.stockLoja + product.stockDeposito,
        Lote: product.batchNumber,
        'Data Validade': product.expirationDate,
        'Dias p/ Vencer': days,
        Status: days < 0 ? 'VENCIDO' : days <= 30 ? 'CRÍTICO (<30d)' : 'OK',
      }));
      exportToExcel(data, fileName, 'Vencimentos');
    } else if (reportType === 'curva_abc') {
      const data = abcAnalysis.map((item) => ({
        'Classe ABC': item.classABC,
        SKU: item.product.sku,
        Produto: item.product.name,
        Categoria: item.product.category,
        'Estoque Total (un)': item.product.stockLoja + item.product.stockDeposito,
        'Valor em Estoque (R$)': Number(item.totalRevenue.toFixed(2)),
        '% Representatividade': `${item.revenuePercentage.toFixed(2)}%`,
        '% Acumulada': `${item.cumulativePercentage.toFixed(2)}%`,
      }));
      exportToExcel(data, fileName, 'Curva ABC Estoque');
    }
  };

  // Handler for Exporting CSV
  const handleExportCSV = () => {
    let csvRows: (string | number)[][] = [];
    let headers: string[] = [];
    let filename = `relatorio_${reportType}_${new Date().toISOString().slice(0, 10)}`;

    if (reportType === 'posicao_estoque') {
      headers = [
        'SKU',
        'EAN',
        'Produto',
        'Categoria',
        'Embalagem',
        'Estoque Loja',
        'Estoque Depósito',
        'Estoque Total',
        'Preço Custo (R$)',
        'Preço Venda (R$)',
        'Valor Custo Total (R$)',
        'Valor Venda Total (R$)',
        'Lote',
        'Data Validade',
      ];

      filteredProducts.forEach((p) => {
        const total = p.stockLoja + p.stockDeposito;
        csvRows.push([
          p.sku,
          p.ean,
          p.name,
          p.category,
          p.unit,
          p.stockLoja,
          p.stockDeposito,
          total,
          p.costPrice.toFixed(2),
          p.sellPrice.toFixed(2),
          (total * p.costPrice).toFixed(2),
          (total * p.sellPrice).toFixed(2),
          p.batchNumber,
          p.expirationDate,
        ]);
      });
    } else if (reportType === 'movimentacoes') {
      headers = ['Data/Hora', 'Produto', 'Tipo Movimento', 'Quantidade', 'Local', 'Valor Unit. (R$)', 'Valor Total (R$)', 'Usuário', 'Motivo'];

      filteredMovements.forEach((m) => {
        csvRows.push([
          m.date,
          m.productName,
          m.type,
          m.quantity,
          m.location,
          (m.unitPrice || 0).toFixed(2),
          (m.totalValue || 0).toFixed(2),
          m.userName,
          m.reason || '',
        ]);
      });
    } else if (reportType === 'notas_fiscais') {
      headers = ['Número NF', 'Fornecedor', 'CNPJ Fornecedor', 'Data Emissão', 'Data Recebimento', 'Qtd Itens', 'Valor Total (R$)', 'Chave Acesso', 'Responsável'];

      filteredNFs.forEach((nf) => {
        csvRows.push([
          nf.numberNF,
          nf.supplier,
          nf.cnpjSupplier,
          nf.issueDate,
          nf.receiveDate,
          nf.items.reduce((acc, i) => acc + i.quantity, 0),
          nf.totalValue.toFixed(2),
          nf.accessKey || '',
          nf.createdBy,
        ]);
      });
    } else if (reportType === 'vencimentos') {
      headers = ['SKU', 'Produto', 'Categoria', 'Estoque Total', 'Lote', 'Data Validade', 'Dias para Vencer', 'Status Validade'];

      filteredVencimentos.forEach(({ product, days }) => {
        let status = days < 0 ? 'VENCIDO' : days <= 30 ? 'CRÍTICO (<30d)' : 'OK';
        csvRows.push([
          product.sku,
          product.name,
          product.category,
          product.stockLoja + product.stockDeposito,
          product.batchNumber,
          product.expirationDate,
          days,
          status,
        ]);
      });
    } else if (reportType === 'curva_abc') {
      headers = ['Classe ABC', 'SKU', 'Produto', 'Categoria', 'Estoque Total (un)', 'Valor em Estoque (R$)', '% Representatividade', '% Acumulada'];

      abcAnalysis.forEach((item) => {
        csvRows.push([
          item.classABC,
          item.product.sku,
          item.product.name,
          item.product.category,
          item.product.stockLoja + item.product.stockDeposito,
          item.totalRevenue.toFixed(2),
          item.revenuePercentage.toFixed(2) + '%',
          item.cumulativePercentage.toFixed(2) + '%',
        ]);
      });
    }

    exportToCSV(headers, csvRows, filename);
  };

  return (
    <div className="space-y-6">
      
      {/* Dynamic CSS Print Stylesheet */}
      <style>{`
        @media print {
          body {
            background: white !important;
            color: black !important;
            font-size: 11px !important;
          }
          .no-print {
            display: none !important;
          }
          .print-only {
            display: block !important;
          }
          .print-container {
            width: 100% !important;
            max-width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            box-shadow: none !important;
            border: none !important;
          }
          table {
            width: 100% !important;
            border-collapse: collapse !important;
          }
          th, td {
            border: 1px solid #cbd5e1 !important;
            padding: 6px 8px !important;
            font-size: 10px !important;
          }
          th {
            background-color: #f1f5f9 !important;
            color: #0f172a !important;
            font-weight: bold !important;
          }
        }
        @media screen {
          .print-only {
            display: none !important;
          }
        }
      `}</style>

      {/* ================= PRINT HEADER (ONLY VISIBLE WHEN PRINTING) ================= */}
      <div className="print-only mb-6 pb-4 border-b-2 border-slate-900 text-left">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-black uppercase tracking-tight text-slate-900">
              GUMMYSTOCK — GESTÃO DE ESTOQUE
            </h1>
            <p className="text-xs font-bold text-slate-600">
              Relatório Gerencial de Estoque & Operações ERP
            </p>
          </div>
          <div className="text-right text-xs">
            <p className="font-bold">Emitido em: {new Date().toLocaleString('pt-BR')}</p>
            <p className="text-slate-500">Operador: {currentUser.name} ({currentUser.role})</p>
          </div>
        </div>

        <div className="mt-3 p-2 bg-slate-100 rounded border border-slate-300 text-xs flex flex-wrap gap-4">
          <span><strong>Tipo de Relatório:</strong> {reportType.toUpperCase().replace('_', ' ')}</span>
          <span><strong>Local:</strong> {locationFilter.toUpperCase()}</span>
          <span><strong>Categoria:</strong> {categoryFilter}</span>
          <span><strong>Filtro Status:</strong> {statusFilter}</span>
          {startDate && <span><strong>De:</strong> {startDate}</span>}
          {endDate && <span><strong>Até:</strong> {endDate}</span>}
        </div>
      </div>

      {/* ================= SCREEN TOP BAR / ACTIONS (NO-PRINT) ================= */}
      <div className="no-print bg-gradient-to-r from-slate-900 via-rose-950 to-slate-900 p-5 sm:p-6 rounded-3xl text-white shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 bg-rose-600/30 border border-rose-500/40 rounded-xl text-rose-300">
              <FileSpreadsheet className="w-6 h-6" />
            </span>
            <h2 className="text-xl font-black tracking-tight text-left">
              Central de Relatórios ERP & Impressão
            </h2>
          </div>
          <p className="text-xs text-rose-200/80 mt-1 text-left">
            Gere visões gerenciais personalizadas do estoque, movimentações, vencimentos e NFs com exportação para PDF e CSV.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            onClick={() => setShowFiltersPanel(!showFiltersPanel)}
            className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold border border-slate-700 transition-all"
            title="Alternar Painel de Filtros"
          >
            <SlidersHorizontal className="w-4 h-4 text-amber-400" />
            <span>Filtros {showFiltersPanel ? 'Visíveis' : 'Ocultos'}</span>
          </button>

          <ExportButton
            onExportExcel={handleExportExcel}
            onExportCSV={handleExportCSV}
            label="Exportar Relatório"
          />

          <button
            onClick={handlePrintPDF}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-black shadow-lg shadow-rose-950/40 transition-all hover:scale-[1.02]"
            title="Imprimir ou Salvar em Documento PDF via Impressora do Navegador"
          >
            <Printer className="w-4 h-4 text-amber-300" />
            <span>Imprimir / Salvar PDF</span>
          </button>
        </div>
      </div>

      {/* ================= REPORT TYPE SELECTOR TABS (NO-PRINT) ================= */}
      <div className="no-print grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
        <button
          onClick={() => setReportType('posicao_estoque')}
          className={`p-3.5 rounded-2xl border text-left transition-all ${
            reportType === 'posicao_estoque'
              ? 'bg-rose-600 text-white border-rose-500 shadow-lg shadow-rose-900/20 font-bold'
              : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
          }`}
        >
          <div className="flex items-center justify-between mb-1">
            <Boxes className={`w-5 h-5 ${reportType === 'posicao_estoque' ? 'text-amber-300' : 'text-rose-600'}`} />
            <span className="text-[10px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded bg-white/20">
              Geral
            </span>
          </div>
          <p className="text-xs font-extrabold leading-snug">Posição de Estoque</p>
          <p className={`text-[10px] mt-0.5 ${reportType === 'posicao_estoque' ? 'text-rose-100' : 'text-slate-400'}`}>
            SKUs, quantidades e valores
          </p>
        </button>

        <button
          onClick={() => setReportType('movimentacoes')}
          className={`p-3.5 rounded-2xl border text-left transition-all ${
            reportType === 'movimentacoes'
              ? 'bg-rose-600 text-white border-rose-500 shadow-lg shadow-rose-900/20 font-bold'
              : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
          }`}
        >
          <div className="flex items-center justify-between mb-1">
            <ArrowRightLeft className={`w-5 h-5 ${reportType === 'movimentacoes' ? 'text-amber-300' : 'text-sky-600'}`} />
            <span className="text-[10px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded bg-white/20">
              Histórico
            </span>
          </div>
          <p className="text-xs font-extrabold leading-snug">Movimentações</p>
          <p className={`text-[10px] mt-0.5 ${reportType === 'movimentacoes' ? 'text-rose-100' : 'text-slate-400'}`}>
            Entradas, saídas e transf.
          </p>
        </button>

        <button
          onClick={() => setReportType('vencimentos')}
          className={`p-3.5 rounded-2xl border text-left transition-all ${
            reportType === 'vencimentos'
              ? 'bg-rose-600 text-white border-rose-500 shadow-lg shadow-rose-900/20 font-bold'
              : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
          }`}
        >
          <div className="flex items-center justify-between mb-1">
            <Clock className={`w-5 h-5 ${reportType === 'vencimentos' ? 'text-amber-300' : 'text-amber-600'}`} />
            <span className="text-[10px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded bg-white/20">
              Lotes
            </span>
          </div>
          <p className="text-xs font-extrabold leading-snug">Vencimento & Lotes</p>
          <p className={`text-[10px] mt-0.5 ${reportType === 'vencimentos' ? 'text-rose-100' : 'text-slate-400'}`}>
            Validades e alertas
          </p>
        </button>

        <button
          onClick={() => setReportType('notas_fiscais')}
          className={`p-3.5 rounded-2xl border text-left transition-all ${
            reportType === 'notas_fiscais'
              ? 'bg-rose-600 text-white border-rose-500 shadow-lg shadow-rose-900/20 font-bold'
              : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
          }`}
        >
          <div className="flex items-center justify-between mb-1">
            <FileSpreadsheet className={`w-5 h-5 ${reportType === 'notas_fiscais' ? 'text-amber-300' : 'text-emerald-600'}`} />
            <span className="text-[10px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded bg-white/20">
              Entradas
            </span>
          </div>
          <p className="text-xs font-extrabold leading-snug">Notas Fiscais (NF-e)</p>
          <p className={`text-[10px] mt-0.5 ${reportType === 'notas_fiscais' ? 'text-rose-100' : 'text-slate-400'}`}>
            Compras e fornecedores
          </p>
        </button>

        <button
          onClick={() => setReportType('curva_abc')}
          className={`p-3.5 rounded-2xl border text-left transition-all ${
            reportType === 'curva_abc'
              ? 'bg-rose-600 text-white border-rose-500 shadow-lg shadow-rose-900/20 font-bold'
              : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
          }`}
        >
          <div className="flex items-center justify-between mb-1">
            <TrendingUp className={`w-5 h-5 ${reportType === 'curva_abc' ? 'text-amber-300' : 'text-purple-600'}`} />
            <span className="text-[10px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded bg-white/20">
              Pareto
            </span>
          </div>
          <p className="text-xs font-extrabold leading-snug">Curva ABC / Giro</p>
          <p className={`text-[10px] mt-0.5 ${reportType === 'curva_abc' ? 'text-rose-100' : 'text-slate-400'}`}>
            Ranking de relevância
          </p>
        </button>
      </div>

      {/* ================= CUSTOM FILTERS PANEL (NO-PRINT) ================= */}
      {showFiltersPanel && (
        <div className="no-print bg-white p-5 rounded-3xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-rose-600" />
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-800">
                Filtros Personalizados & Customização do Relatório
              </h3>
            </div>

            <button
              onClick={handleResetFilters}
              className="text-xs text-rose-600 hover:text-rose-800 font-bold flex items-center gap-1 transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Limpar Filtros</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Search Input */}
            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1 text-left">
                Busca Textual (Nome, SKU, Fornecedor)
              </label>
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Pesquisar termo..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full text-xs pl-9 pr-3 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-rose-500/20"
                />
              </div>
            </div>

            {/* Location Selector */}
            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1 text-left">
                Localização do Estoque
              </label>
              <select
                value={locationFilter}
                onChange={(e) => setLocationFilter(e.target.value as any)}
                className="w-full text-xs p-2 rounded-xl border border-slate-200 font-semibold bg-white"
              >
                <option value="geral">Todos os Locais (Unificado)</option>
                <option value="loja">Loja GummyStock</option>
                <option value="deposito">Depósito Central</option>
              </select>
            </div>

            {/* Category Selector */}
            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1 text-left">
                Categoria de Produtos
              </label>
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="w-full text-xs p-2 rounded-xl border border-slate-200 font-semibold bg-white"
              >
                <option value="todos">Todas as Categorias ({categoriesList.length})</option>
                {categoriesList.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            {/* Status Selector */}
            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1 text-left">
                Status / Nível de Estoque
              </label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full text-xs p-2 rounded-xl border border-slate-200 font-semibold bg-white"
              >
                <option value="todos">Todos os Status</option>
                <option value="disponivel">Disponível em Estoque</option>
                <option value="estoque_baixo">Estoque Baixo / Crítico</option>
                <option value="validade_proxima">Validade Próxima (&lt;30 dias)</option>
                <option value="vencido">Produtos VENCIDOS</option>
                <option value="zerado">Estoque ZERADO</option>
              </select>
            </div>

            {/* Date Range Start */}
            {(reportType === 'movimentacoes' || reportType === 'notas_fiscais') && (
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1 text-left">
                  Data Inicial (Período)
                </label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full text-xs p-2 rounded-xl border border-slate-200 font-semibold"
                />
              </div>
            )}

            {/* Date Range End */}
            {(reportType === 'movimentacoes' || reportType === 'notas_fiscais') && (
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1 text-left">
                  Data Final (Período)
                </label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full text-xs p-2 rounded-xl border border-slate-200 font-semibold"
                />
              </div>
            )}

            {/* Sorting */}
            {reportType === 'posicao_estoque' && (
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1 text-left">
                  Ordenar Registros Por
                </label>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  className="w-full text-xs p-2 rounded-xl border border-slate-200 font-semibold bg-white"
                >
                  <option value="nome_asc">Nome do Produto (A-Z)</option>
                  <option value="nome_desc">Nome do Produto (Z-A)</option>
                  <option value="custo_maior">Maior Patrimônio (Custo Total)</option>
                  <option value="venda_maior">Maior Potencial (Venda Total)</option>
                  <option value="qtd_maior">Maior Quantidade em Estoque</option>
                  <option value="validade_mais_proxima">Validade Mais Próxima</option>
                </select>
              </div>
            )}
          </div>

          {/* Column Display Toggles */}
          <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center gap-4 text-xs">
            <span className="font-extrabold text-slate-500 uppercase tracking-wider text-[10px]">
              Exibir Colunas:
            </span>

            <label className="flex items-center gap-1.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showCostPrices}
                onChange={(e) => setShowCostPrices(e.target.checked)}
                className="rounded border-slate-300 text-rose-600 focus:ring-rose-500"
              />
              <span className="font-medium text-slate-700">Preço de Custo</span>
            </label>

            <label className="flex items-center gap-1.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showSellPrices}
                onChange={(e) => setShowSellPrices(e.target.checked)}
                className="rounded border-slate-300 text-rose-600 focus:ring-rose-500"
              />
              <span className="font-medium text-slate-700">Preço de Venda</span>
            </label>

            <label className="flex items-center gap-1.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showSKU}
                onChange={(e) => setShowSKU(e.target.checked)}
                className="rounded border-slate-300 text-rose-600 focus:ring-rose-500"
              />
              <span className="font-medium text-slate-700">SKU / Código EAN</span>
            </label>

            <label className="flex items-center gap-1.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showBatchAndExp}
                onChange={(e) => setShowBatchAndExp(e.target.checked)}
                className="rounded border-slate-300 text-rose-600 focus:ring-rose-500"
              />
              <span className="font-medium text-slate-700">Lote e Data de Validade</span>
            </label>
          </div>
        </div>
      )}

      {/* ================= EXECUTIVE SUMMARY KPI CARDS ================= */}
      {reportType === 'posicao_estoque' && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
            <span className="text-[10px] font-extrabold text-slate-400 uppercase block">SKUs Filtrados</span>
            <span className="text-xl font-black text-slate-900 mt-0.5 block">{stockMetrics.skuCount}</span>
            <span className="text-[11px] text-slate-500 font-semibold">{stockMetrics.totalItemsCount.toLocaleString()} un totais</span>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
            <span className="text-[10px] font-extrabold text-slate-400 uppercase block">Patrimônio Custo</span>
            <span className="text-xl font-black text-rose-700 mt-0.5 block">{formatCurrency(stockMetrics.totalCostVal)}</span>
            <span className="text-[11px] text-slate-500 font-semibold">Custo de Aquisição</span>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
            <span className="text-[10px] font-extrabold text-slate-400 uppercase block">Potencial Venda</span>
            <span className="text-xl font-black text-emerald-700 mt-0.5 block">{formatCurrency(stockMetrics.totalSellVal)}</span>
            <span className="text-[11px] text-slate-500 font-semibold">Faturamento Bruto</span>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
            <span className="text-[10px] font-extrabold text-slate-400 uppercase block">Margem Bruta Estimada</span>
            <span className="text-xl font-black text-sky-700 mt-0.5 block">{formatCurrency(stockMetrics.estimatedProfit)}</span>
            <span className="text-[11px] text-slate-500 font-semibold">Lucro Potencial</span>
          </div>
        </div>
      )}

      {/* ================= REPORT DATA TABLE ================= */}
      <div className="print-container bg-white rounded-3xl border border-slate-200 shadow-md overflow-hidden">
        
        {/* Table Title Header */}
        <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-rose-600" />
            <h3 className="text-sm font-black text-slate-900 uppercase tracking-tight">
              {reportType === 'posicao_estoque' && 'Relatório de Posição do Estoque Fisico'}
              {reportType === 'movimentacoes' && 'Histórico de Movimentações, Entradas e Saídas'}
              {reportType === 'vencimentos' && 'Controle de Lotes e Prazos de Validade'}
              {reportType === 'notas_fiscais' && 'Registro de Entradas por Nota Fiscal (NF-e)'}
              {reportType === 'curva_abc' && 'Análise de Giro de Estoque e Curva ABC (Pareto)'}
            </h3>
          </div>

          <span className="text-xs text-slate-500 font-semibold no-print">
            {reportType === 'posicao_estoque' && `${filteredProducts.length} registros`}
            {reportType === 'movimentacoes' && `${filteredMovements.length} movimentações`}
            {reportType === 'vencimentos' && `${filteredVencimentos.length} lotes analisados`}
            {reportType === 'notas_fiscais' && `${filteredNFs.length} notas emitidas`}
            {reportType === 'curva_abc' && `${abcAnalysis.length} produtos analisados`}
          </span>
        </div>

        {/* 1. POSIÇÃO DE ESTOQUE TABLE */}
        {reportType === 'posicao_estoque' && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-100 text-slate-700 uppercase font-extrabold border-b border-slate-200">
                <tr>
                  <th className="py-3 px-4">Produto</th>
                  {showSKU && <th className="py-3 px-3">SKU / EAN</th>}
                  <th className="py-3 px-3">Categoria</th>
                  <th className="py-3 px-3 text-center">Loja</th>
                  <th className="py-3 px-3 text-center">Depósito</th>
                  <th className="py-3 px-3 text-center">Total</th>
                  {showCostPrices && <th className="py-3 px-3 text-right">P. Custo</th>}
                  {showSellPrices && <th className="py-3 px-3 text-right">P. Venda</th>}
                  {showCostPrices && <th className="py-3 px-3 text-right">Custo Total</th>}
                  {showBatchAndExp && <th className="py-3 px-3 text-center">Lote / Validade</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredProducts.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="py-8 text-center text-slate-400 font-semibold">
                      Nenhum produto encontrado para os filtros aplicados.
                    </td>
                  </tr>
                ) : (
                  filteredProducts.map((p) => {
                    const totalUnits = p.stockLoja + p.stockDeposito;
                    const daysToExp = getDaysToExpiration(p.expirationDate);

                    return (
                      <tr key={p.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-2.5 px-4 font-bold text-slate-900">
                          {p.name}
                          <span className="block text-[10px] text-slate-400 font-normal">{p.unit}</span>
                        </td>
                        {showSKU && (
                          <td className="py-2.5 px-3 font-mono text-[11px] text-slate-600">
                            {p.sku}
                          </td>
                        )}
                        <td className="py-2.5 px-3">
                          <span className="px-2 py-0.5 rounded bg-slate-100 font-semibold text-slate-700 text-[10px]">
                            {p.category}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-center font-bold text-slate-800">
                          {p.stockLoja}
                        </td>
                        <td className="py-2.5 px-3 text-center font-bold text-slate-800">
                          {p.stockDeposito}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <span className={`font-black ${totalUnits === 0 ? 'text-rose-600' : 'text-slate-900'}`}>
                            {totalUnits}
                          </span>
                        </td>
                        {showCostPrices && (
                          <td className="py-2.5 px-3 text-right font-medium text-slate-600">
                            {formatCurrency(p.costPrice)}
                          </td>
                        )}
                        {showSellPrices && (
                          <td className="py-2.5 px-3 text-right font-extrabold text-emerald-700">
                            {formatCurrency(p.sellPrice)}
                          </td>
                        )}
                        {showCostPrices && (
                          <td className="py-2.5 px-3 text-right font-extrabold text-rose-700">
                            {formatCurrency(totalUnits * p.costPrice)}
                          </td>
                        )}
                        {showBatchAndExp && (
                          <td className="py-2.5 px-3 text-center">
                            <span className="block font-mono text-[10px] text-slate-500">Lote: {p.batchNumber}</span>
                            <span
                              className={`text-[10px] font-bold ${
                                daysToExp < 0
                                  ? 'text-rose-600 font-black'
                                  : daysToExp <= 30
                                  ? 'text-amber-600'
                                  : 'text-slate-600'
                              }`}
                            >
                              Val: {p.expirationDate}
                            </span>
                          </td>
                        )}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* 2. HISTÓRICO DE MOVIMENTAÇÕES TABLE */}
        {reportType === 'movimentacoes' && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-100 text-slate-700 uppercase font-extrabold border-b border-slate-200">
                <tr>
                  <th className="py-3 px-4">Data / Hora</th>
                  <th className="py-3 px-3">Produto</th>
                  <th className="py-3 px-3">Tipo de Operação</th>
                  <th className="py-3 px-3 text-center">Qtd</th>
                  <th className="py-3 px-3">Local</th>
                  <th className="py-3 px-3 text-right">Valor Total</th>
                  <th className="py-3 px-3">Usuário</th>
                  <th className="py-3 px-3">Motivo / Detalhes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredMovements.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-slate-400 font-semibold">
                      Nenhuma movimentação encontrada para os filtros selecionados.
                    </td>
                  </tr>
                ) : (
                  filteredMovements.map((m) => (
                    <tr key={m.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-2.5 px-4 font-mono text-[11px] text-slate-600">
                        {formatDateTime(m.date)}
                      </td>
                      <td className="py-2.5 px-3 font-bold text-slate-900">
                        {m.productName}
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="px-2 py-0.5 rounded font-bold text-[10px] bg-slate-100 text-slate-800">
                          {m.type === 'entrada_nf' && 'Entrada NF'}
                          {m.type === 'transferencia_deposito_loja' && 'Transf. Depósito -> Loja'}
                          {m.type === 'venda_loja' && 'Baixa p/ Baleiro'}
                          {m.type === 'perda_avaria' && 'Perda / Avaria'}
                          {m.type === 'ajuste_inventario' && 'Ajuste Inventário'}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-center font-black text-slate-900">
                        {m.quantity}
                      </td>
                      <td className="py-2.5 px-3 capitalize font-semibold text-slate-700">
                        {m.location}
                      </td>
                      <td className="py-2.5 px-3 text-right font-bold text-emerald-700">
                        {m.totalValue ? formatCurrency(m.totalValue) : '—'}
                      </td>
                      <td className="py-2.5 px-3 font-medium text-slate-700">
                        {m.userName}
                      </td>
                      <td className="py-2.5 px-3 text-slate-500 italic">
                        {m.reason || '—'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* 3. VENCIMENTOS & LOTES TABLE */}
        {reportType === 'vencimentos' && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-100 text-slate-700 uppercase font-extrabold border-b border-slate-200">
                <tr>
                  <th className="py-3 px-4">Produto</th>
                  <th className="py-3 px-3">Categoria</th>
                  <th className="py-3 px-3 text-center">Estoque Total</th>
                  <th className="py-3 px-3">Lote</th>
                  <th className="py-3 px-3">Data de Validade</th>
                  <th className="py-3 px-3 text-center">Dias Restantes</th>
                  <th className="py-3 px-3 text-center">Status Criticidade</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredVencimentos.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-400 font-semibold">
                      Nenhum produto atende aos critérios de vencimento selecionados.
                    </td>
                  </tr>
                ) : (
                  filteredVencimentos.map(({ product, days }) => {
                    const isExpired = days < 0;
                    const isCritical = days >= 0 && days <= 30;

                    return (
                      <tr key={product.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-2.5 px-4 font-bold text-slate-900">
                          {product.name}
                          <span className="block text-[10px] text-slate-400 font-mono">SKU: {product.sku}</span>
                        </td>
                        <td className="py-2.5 px-3 font-semibold text-slate-600">
                          {product.category}
                        </td>
                        <td className="py-2.5 px-3 text-center font-bold text-slate-800">
                          {product.stockLoja + product.stockDeposito} un
                        </td>
                        <td className="py-2.5 px-3 font-mono text-slate-700">
                          {product.batchNumber}
                        </td>
                        <td className="py-2.5 px-3 font-bold text-slate-900">
                          {product.expirationDate}
                        </td>
                        <td className="py-2.5 px-3 text-center font-extrabold">
                          <span
                            className={
                              isExpired
                                ? 'text-rose-700'
                                : isCritical
                                ? 'text-amber-700'
                                : 'text-emerald-700'
                            }
                          >
                            {isExpired ? `${Math.abs(days)}d atrasado` : `${days} dias`}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          {isExpired ? (
                            <span className="px-2.5 py-1 rounded bg-rose-100 text-rose-800 font-black text-[10px] uppercase">
                              VENCIDO
                            </span>
                          ) : isCritical ? (
                            <span className="px-2.5 py-1 rounded bg-amber-100 text-amber-900 font-black text-[10px] uppercase">
                              CRÍTICO (&lt;30d)
                            </span>
                          ) : (
                            <span className="px-2.5 py-1 rounded bg-emerald-100 text-emerald-800 font-bold text-[10px] uppercase">
                              DENTRO DO PRAZO
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* 4. NOTAS FISCAIS TABLE */}
        {reportType === 'notas_fiscais' && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-100 text-slate-700 uppercase font-extrabold border-b border-slate-200">
                <tr>
                  <th className="py-3 px-4">Número NF</th>
                  <th className="py-3 px-3">Fornecedor</th>
                  <th className="py-3 px-3">CNPJ</th>
                  <th className="py-3 px-3">Emissão / Recebimento</th>
                  <th className="py-3 px-3 text-center">Qtd Itens</th>
                  <th className="py-3 px-3 text-right">Valor Total NF</th>
                  <th className="py-3 px-3">Responsável</th>
                  <th className="py-3 px-3 text-center">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredNFs.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-slate-400 font-semibold">
                      Nenhuma Nota Fiscal encontrada no período.
                    </td>
                  </tr>
                ) : (
                  filteredNFs.map((nf) => (
                    <tr key={nf.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-2.5 px-4 font-black text-rose-700">
                        {nf.numberNF}
                      </td>
                      <td className="py-2.5 px-3 font-bold text-slate-900">
                        {nf.supplier}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-slate-600">
                        {nf.cnpjSupplier}
                      </td>
                      <td className="py-2.5 px-3 text-slate-600 font-medium">
                        Emissão: {nf.issueDate} <br />
                        <span className="text-[10px] text-slate-400">Entrada: {formatDateTime(nf.receiveDate)}</span>
                      </td>
                      <td className="py-2.5 px-3 text-center font-extrabold text-slate-800">
                        {nf.items.reduce((sum, item) => sum + item.quantity, 0)} un
                      </td>
                      <td className="py-2.5 px-3 text-right font-black text-emerald-700">
                        {formatCurrency(nf.totalValue)}
                      </td>
                      <td className="py-2.5 px-3 text-slate-700 font-medium">
                        {nf.createdBy}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        {canDeleteNF ? (
                          <button
                            type="button"
                            onClick={() => {
                              setNfToDelete(nf);
                              setDeleteError(null);
                              setDeleteSuccess(null);
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 hover:text-rose-800 border border-rose-200 rounded-lg transition-colors cursor-pointer"
                            title="Excluir Nota Fiscal e reverter estoque"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Excluir</span>
                          </button>
                        ) : (
                          <span className="text-[11px] text-slate-400 font-medium">—</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* 5. CURVA ABC TABLE */}
        {reportType === 'curva_abc' && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-100 text-slate-700 uppercase font-extrabold border-b border-slate-200">
                <tr>
                  <th className="py-3 px-4 text-center">Classe ABC</th>
                  <th className="py-3 px-3">Produto</th>
                  <th className="py-3 px-3">Categoria</th>
                  <th className="py-3 px-3 text-center">Estoque Total</th>
                  <th className="py-3 px-3 text-right">Valor em Estoque</th>
                  <th className="py-3 px-3 text-right">% Representatividade</th>
                  <th className="py-3 px-3 text-right">% Acumulada</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {abcAnalysis.map((item) => (
                  <tr key={item.product.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-2.5 px-4 text-center">
                      <span
                        className={`inline-block px-3 py-1 rounded-full text-xs font-black uppercase ${
                          item.classABC === 'A'
                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                            : item.classABC === 'B'
                            ? 'bg-amber-100 text-amber-900 border border-amber-300'
                            : 'bg-slate-100 text-slate-600 border border-slate-200'
                        }`}
                      >
                        Classe {item.classABC}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 font-bold text-slate-900">
                      {item.product.name}
                      <span className="block text-[10px] text-slate-400 font-mono">SKU: {item.product.sku}</span>
                    </td>
                    <td className="py-2.5 px-3 font-semibold text-slate-600">
                      {item.product.category}
                    </td>
                    <td className="py-2.5 px-3 text-center font-bold text-slate-800">
                      {item.product.stockLoja + item.product.stockDeposito} un
                    </td>
                    <td className="py-2.5 px-3 text-right font-black text-emerald-700">
                      {formatCurrency(item.totalRevenue)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-bold text-slate-800">
                      {item.revenuePercentage.toFixed(2)}%
                    </td>
                    <td className="py-2.5 px-3 text-right font-bold text-slate-600">
                      {item.cumulativePercentage.toFixed(2)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

      </div>

      {/* ================= PRINT SIGNATURE FOOTER (ONLY VISIBLE WHEN PRINTING) ================= */}
      <div className="print-only mt-12 pt-8 border-t border-slate-300">
        <div className="grid grid-cols-2 gap-12 text-center text-xs">
          <div>
            <div className="border-b border-slate-800 mb-2 w-3/4 mx-auto"></div>
            <p className="font-bold">Responsável pelo Estoque / Operador</p>
            <p className="text-slate-500 text-[10px]">Data: ____/____/2026</p>
          </div>

          <div>
            <div className="border-b border-slate-800 mb-2 w-3/4 mx-auto"></div>
            <p className="font-bold">Gerente de Operações / Auditoria</p>
            <p className="text-slate-500 text-[10px]">Assinatura e Visto</p>
          </div>
        </div>
      </div>

      {/* ================= MODAL DE CONFIRMAÇÃO DE EXCLUSÃO DE NF ================= */}
      {nfToDelete && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-200">
            {/* Header */}
            <div className="px-6 py-4 bg-rose-50 border-b border-rose-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-rose-100 border border-rose-200 flex items-center justify-center text-rose-700">
                  <Trash2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-900">Excluir Nota Fiscal</h3>
                  <p className="text-xs text-rose-700 font-medium">Reversão de estoque no Depósito Central</p>
                </div>
              </div>
              {!isDeletingNF && (
                <button
                  onClick={() => {
                    setNfToDelete(null);
                    setDeleteError(null);
                    setDeleteSuccess(null);
                  }}
                  className="text-slate-400 hover:text-slate-600 rounded-lg p-1.5 hover:bg-white/60 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              )}
            </div>

            {/* Body */}
            <div className="p-6 space-y-4">
              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-2 text-xs">
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 font-semibold">Número da NF:</span>
                  <span className="font-extrabold text-rose-700 font-mono text-sm">{nfToDelete.numberNF}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 font-semibold">Fornecedor:</span>
                  <span className="font-bold text-slate-900">{nfToDelete.supplier}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 font-semibold">Valor Total:</span>
                  <span className="font-bold text-emerald-700">{formatCurrency(nfToDelete.totalValue)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 font-semibold">Total de Itens:</span>
                  <span className="font-bold text-slate-800">
                    {nfToDelete.items.length} produto(s) ({nfToDelete.items.reduce((s, i) => s + i.quantity, 0)} un)
                  </span>
                </div>
              </div>

              {/* Notice */}
              <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-bold text-amber-950">Atenção à reversão de estoque:</p>
                  <p className="text-amber-800 leading-relaxed">
                    Ao confirmar, a quantidade de cada produto desta nota será subtraída do estoque do <strong>Depósito Central</strong>.
                    Se algum produto já foi vendido ou transferido e o saldo atual for insuficiente, a exclusão será bloqueada para impedir saldo negativo.
                  </p>
                </div>
              </div>

              {/* Error Message if any */}
              {deleteError && (
                <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-900 flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold text-rose-950">Não foi possível excluir:</p>
                    <p className="text-rose-800 mt-0.5 leading-relaxed">{deleteError}</p>
                  </div>
                </div>
              )}

              {/* Success Message if any */}
              {deleteSuccess && (
                <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-900 flex items-center gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <p className="font-bold text-emerald-900">{deleteSuccess}</p>
                </div>
              )}
            </div>

            {/* Footer Buttons */}
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-3">
              <button
                type="button"
                disabled={isDeletingNF}
                onClick={() => {
                  setNfToDelete(null);
                  setDeleteError(null);
                  setDeleteSuccess(null);
                }}
                className="px-4 py-2 text-xs font-bold text-slate-700 bg-white border border-slate-300 rounded-xl hover:bg-slate-100 disabled:opacity-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isDeletingNF || Boolean(deleteSuccess)}
                onClick={handleConfirmDeleteNF}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 active:bg-rose-800 rounded-xl shadow-xs disabled:opacity-50 transition-colors"
              >
                {isDeletingNF ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Revertendo estoque...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Confirmar Exclusão</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
