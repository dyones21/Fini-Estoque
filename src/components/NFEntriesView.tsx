import React, { useState, useMemo } from 'react';
import {
  Receipt,
  Search,
  Calendar,
  Building,
  Package,
  DollarSign,
  Plus,
  Eye,
  Trash2,
  X,
  Copy,
  Check,
  AlertCircle,
  AlertTriangle,
  Loader2,
  FileSpreadsheet,
  ArrowUpDown,
  Tag,
  Hash,
  User,
  Clock,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Minus,
  Info,
  Truck,
  ShieldCheck,
} from 'lucide-react';
import { useStock } from '../context/StockContext';
import { NFEntry } from '../types';
import { formatCurrency, formatDate, formatDateTime } from '../utils/inventoryUtils';

interface NFEntriesViewProps {
  onOpenNFModal: () => void;
}

export const NFEntriesView: React.FC<NFEntriesViewProps> = ({ onOpenNFModal }) => {
  const { nfEntries, deleteNFEntry, checkPermission, currentUser } = useStock();

  const canAddNF = checkPermission('canAddNFEntries');
  const canDeleteNF = checkPermission('canDeleteNFEntries');

  // Search & Filter
  const [searchTerm, setSearchTerm] = useState('');
  const [sortOrder, setSortOrder] = useState<'date_desc' | 'date_asc' | 'val_desc' | 'val_asc'>('date_desc');

  // Selected NF for Detail Modal
  const [selectedNF, setSelectedNF] = useState<NFEntry | null>(null);
  const [expandedItems, setExpandedItems] = useState<Record<number, boolean>>({});

  const toggleItemExpansion = (idx: number) => {
    setExpandedItems((prev) => ({
      ...prev,
      [idx]: !prev[idx],
    }));
  };

  // Copy Access Key State
  const [copiedKey, setCopiedKey] = useState(false);

  // Deletion Modal State
  const [nfToDelete, setNfToDelete] = useState<NFEntry | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteSuccess, setDeleteSuccess] = useState<string | null>(null);

  const handleCopyAccessKey = (key?: string) => {
    if (!key) return;
    navigator.clipboard.writeText(key);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2000);
  };

  // Calculate Consolidated Taxes and Expenses Breakdown for Selected NF
  const nfTotals = useMemo(() => {
    if (!selectedNF?.items || selectedNF.items.length === 0) return null;

    let totalFreight = 0;
    let totalInsurance = 0;
    let totalOther = 0;
    let totalDiscount = 0;
    let totalIcmsSt = 0;
    let totalIpi = 0;
    let totalIi = 0;
    let totalDifal = 0;
    let totalRecoverableTaxes = 0;
    let totalBaseProducts = 0;
    let totalCalculatedCost = 0;

    selectedNF.items.forEach((item) => {
      const freight = item.freightAllocated || 0;
      const insurance = item.insuranceAllocated || 0;
      const other = item.otherExpensesAllocated || 0;
      const discount = item.discountAllocated || 0;
      const icmsSt = item.icmsStAllocated || 0;
      const ipi = item.ipiAllocated || 0;
      const ii = item.iiAllocated || 0;
      const difal = item.difalAllocated || 0;
      const recTaxes = item.recoverableTaxesAllocated || 0;

      const itemTotalCost = item.totalCost || (item.quantity * item.costPrice) || 0;
      const netAlloc = freight + insurance + other + icmsSt + ipi + ii + difal - discount - recTaxes;
      const baseProdVal = item.itemProdValue !== undefined && item.itemProdValue > 0
        ? item.itemProdValue
        : Math.max(0, itemTotalCost - netAlloc);

      totalFreight += freight;
      totalInsurance += insurance;
      totalOther += other;
      totalDiscount += discount;
      totalIcmsSt += icmsSt;
      totalIpi += ipi;
      totalIi += ii;
      totalDifal += difal;
      totalRecoverableTaxes += recTaxes;
      totalBaseProducts += baseProdVal;
      totalCalculatedCost += itemTotalCost;
    });

    const totalTaxes = totalIcmsSt + totalIpi + totalIi + totalDifal;
    const totalDeductions = totalDiscount + totalRecoverableTaxes;
    const totalAdditionalExpenses = totalFreight + totalInsurance + totalOther;

    // Verificar se existe algum encargo/imposto rateado na nota (se todos forem 0, é nota manual sem rateio)
    const hasAllocations =
      totalFreight > 0 ||
      totalInsurance > 0 ||
      totalOther > 0 ||
      totalDiscount > 0 ||
      totalTaxes > 0 ||
      totalRecoverableTaxes > 0;

    return {
      totalFreight,
      totalInsurance,
      totalOther,
      totalDiscount,
      totalIcmsSt,
      totalIpi,
      totalIi,
      totalDifal,
      totalRecoverableTaxes,
      totalBaseProducts,
      totalTaxes,
      totalDeductions,
      totalAdditionalExpenses,
      totalCalculatedCost,
      hasAllocations,
    };
  }, [selectedNF]);

  const handleConfirmDeleteNF = async () => {
    if (!nfToDelete) return;
    setIsDeleting(true);
    setDeleteError(null);
    setDeleteSuccess(null);
    try {
      const res = await deleteNFEntry(nfToDelete.id);
      setDeleteSuccess(res.message || 'Nota Fiscal excluída e estoque revertido com sucesso.');
      setTimeout(() => {
        setDeleteSuccess(null);
        setNfToDelete(null);
        if (selectedNF?.id === nfToDelete.id) {
          setSelectedNF(null);
        }
      }, 1200);
    } catch (err: any) {
      setDeleteError(err.message || 'Falha ao excluir Nota Fiscal.');
    } finally {
      setIsDeleting(false);
    }
  };

  // Filtered and Sorted NF Entries
  const filteredNFs = useMemo(() => {
    return nfEntries
      .filter((nf) => {
        if (!searchTerm) return true;
        const q = searchTerm.toLowerCase().trim();
        const numMatch = nf.numberNF?.toLowerCase().includes(q);
        const suppMatch = nf.supplier?.toLowerCase().includes(q);
        const cnpjMatch = nf.cnpjSupplier?.replace(/\D/g, '').includes(q.replace(/\D/g, ''));
        const keyMatch = nf.accessKey?.toLowerCase().includes(q);
        const itemMatch = nf.items?.some((item) => item.productName?.toLowerCase().includes(q));
        return numMatch || suppMatch || cnpjMatch || keyMatch || itemMatch;
      })
      .sort((a, b) => {
        if (sortOrder === 'date_desc') {
          return new Date(b.receiveDate || b.issueDate).getTime() - new Date(a.receiveDate || a.issueDate).getTime();
        }
        if (sortOrder === 'date_asc') {
          return new Date(a.receiveDate || a.issueDate).getTime() - new Date(b.receiveDate || b.issueDate).getTime();
        }
        if (sortOrder === 'val_desc') {
          return (b.totalValue || 0) - (a.totalValue || 0);
        }
        if (sortOrder === 'val_asc') {
          return (a.totalValue || 0) - (b.totalValue || 0);
        }
        return 0;
      });
  }, [nfEntries, searchTerm, sortOrder]);

  // Overall Totals
  const totalVolume = useMemo(() => {
    return nfEntries.reduce((acc, nf) => {
      const itemCount = nf.items?.reduce((itemAcc, it) => itemAcc + (it.quantity || 0), 0) || 0;
      return acc + itemCount;
    }, 0);
  }, [nfEntries]);

  const totalValueNFs = useMemo(() => {
    return nfEntries.reduce((acc, nf) => acc + (nf.totalValue || 0), 0);
  }, [nfEntries]);

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-sm relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-rose-50 border border-rose-100 flex items-center justify-center text-rose-600 shadow-xs shrink-0">
              <Receipt className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                Notas Fiscais Lançadas
              </h1>
              <p className="text-xs sm:text-sm text-slate-500 font-medium">
                Histórico completo de entradas por XML ou digitação manual com detalhamento de itens.
              </p>
            </div>
          </div>

          {canAddNF && (
            <button
              onClick={onOpenNFModal}
              className="flex items-center justify-center gap-2 px-5 py-3 rounded-2xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs sm:text-sm shadow-md shadow-rose-600/20 transition-all active:scale-95 shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span>Nova Entrada de NF</span>
            </button>
          )}
        </div>

        {/* Quick Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 mt-6 pt-6 border-t border-slate-100">
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-rose-100/70 text-rose-700 flex items-center justify-center shrink-0">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                Total de Notas
              </span>
              <span className="text-lg font-black text-slate-800">
                {nfEntries.length} {nfEntries.length === 1 ? 'Nota' : 'Notas'}
              </span>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-emerald-100/70 text-emerald-700 flex items-center justify-center shrink-0">
              <DollarSign className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                Total Comprado (NF)
              </span>
              <span className="text-lg font-black text-emerald-600">
                {formatCurrency(totalValueNFs)}
              </span>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-blue-100/70 text-blue-700 flex items-center justify-center shrink-0">
              <Package className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                Volume Total Entrada
              </span>
              <span className="text-lg font-black text-slate-800">
                {totalVolume.toLocaleString('pt-BR')} itens
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white rounded-3xl p-4 sm:p-5 border border-slate-200 shadow-sm flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="relative w-full sm:w-80 md:w-96">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Buscar por número da NF, fornecedor ou CNPJ..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 placeholder-slate-400 focus:outline-none focus:border-rose-500 focus:bg-white transition-all"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
          <span className="text-xs font-bold text-slate-500 flex items-center gap-1.5 shrink-0">
            <ArrowUpDown className="w-3.5 h-3.5" />
            Ordenar:
          </span>
          <select
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value as any)}
            className="py-2 px-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-none focus:border-rose-500 cursor-pointer"
          >
            <option value="date_desc">Mais recentes primeiro</option>
            <option value="date_asc">Mais antigas primeiro</option>
            <option value="val_desc">Maior valor total</option>
            <option value="val_asc">Menor valor total</option>
          </select>
        </div>
      </div>

      {/* Main NF List Table */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        {filteredNFs.length === 0 ? (
          <div className="p-12 text-center space-y-4">
            <div className="w-16 h-16 rounded-3xl bg-slate-50 border border-slate-100 flex items-center justify-center mx-auto text-slate-400">
              <Receipt className="w-8 h-8 opacity-60" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-800">
                {searchTerm ? 'Nenhuma nota fiscal encontrada' : 'Nenhuma nota fiscal lançada ainda'}
              </h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
                {searchTerm
                  ? 'Tente ajustar os termos da busca para encontrar a nota fiscal desejada.'
                  : 'Lance uma nota fiscal via XML da NF-e ou digitação manual para registrar entradas no estoque.'}
              </p>
            </div>
            {canAddNF && !searchTerm && (
              <button
                onClick={onOpenNFModal}
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs rounded-xl border border-rose-200 transition-all"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Lançar Primeira Nota</span>
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-extrabold uppercase tracking-wider text-slate-500">
                  <th className="py-3.5 px-4 sm:px-6">Número da NF</th>
                  <th className="py-3.5 px-4">Fornecedor</th>
                  <th className="py-3.5 px-4">Recebimento</th>
                  <th className="py-3.5 px-4 text-center">Itens / Qtd</th>
                  <th className="py-3.5 px-4 text-right">Valor Total</th>
                  <th className="py-3.5 px-4 sm:px-6 text-center">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {filteredNFs.map((nf) => {
                  const totalItemsQty = nf.items?.reduce((acc, it) => acc + (it.quantity || 0), 0) || 0;
                  const totalSKUs = nf.items?.length || 0;

                  return (
                    <tr
                      key={nf.id}
                      className="hover:bg-slate-50/80 transition-colors group cursor-pointer"
                      onClick={() => setSelectedNF(nf)}
                    >
                      {/* Número da NF */}
                      <td className="py-4 px-4 sm:px-6 font-bold text-slate-900">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center font-black text-xs shrink-0 border border-rose-100 group-hover:bg-rose-600 group-hover:text-white transition-colors">
                            <Receipt className="w-4 h-4" />
                          </div>
                          <div>
                            <span className="font-extrabold text-slate-900 block text-xs sm:text-sm">
                              NF #{nf.numberNF}
                            </span>
                            {nf.accessKey && (
                              <span className="text-[10px] text-slate-400 font-mono block truncate max-w-[140px]" title={nf.accessKey}>
                                {nf.accessKey.slice(0, 16)}...
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Fornecedor */}
                      <td className="py-4 px-4">
                        <div className="max-w-[220px]">
                          <span className="font-bold text-slate-800 block truncate" title={nf.supplier}>
                            {nf.supplier || 'Fornecedor não identificado'}
                          </span>
                          {nf.cnpjSupplier && (
                            <span className="text-[11px] text-slate-400 font-mono">
                              CNPJ: {nf.cnpjSupplier}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Data de Recebimento */}
                      <td className="py-4 px-4">
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-1.5 text-slate-700 font-semibold text-xs">
                            <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span>{formatDate(nf.receiveDate || nf.issueDate)}</span>
                          </div>
                          {nf.issueDate && nf.issueDate !== nf.receiveDate && (
                            <span className="text-[10px] text-slate-400 block">
                              Emissão: {formatDate(nf.issueDate)}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Itens e Qtd */}
                      <td className="py-4 px-4 text-center">
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-slate-100 text-slate-700 font-bold text-xs">
                          <Package className="w-3.5 h-3.5 text-slate-500" />
                          <span>{totalItemsQty} un</span>
                          <span className="text-[10px] text-slate-400 font-normal">({totalSKUs} {totalSKUs === 1 ? 'item' : 'itens'})</span>
                        </span>
                      </td>

                      {/* Valor Total */}
                      <td className="py-4 px-4 text-right">
                        <span className="font-extrabold text-emerald-600 text-sm">
                          {formatCurrency(nf.totalValue || 0)}
                        </span>
                      </td>

                      {/* Ações */}
                      <td className="py-4 px-4 sm:px-6 text-center" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => setSelectedNF(nf)}
                            title="Ver Detalhes da Nota Fiscal"
                            className="p-2 rounded-xl bg-slate-100 hover:bg-rose-50 text-slate-600 hover:text-rose-600 transition-colors border border-slate-200/60"
                          >
                            <Eye className="w-4 h-4" />
                          </button>

                          {canDeleteNF && (
                            <button
                              onClick={() => setNfToDelete(nf)}
                              title="Excluir Nota Fiscal (Reverter Estoque)"
                              className="p-2 rounded-xl bg-slate-100 hover:bg-rose-50 text-slate-400 hover:text-rose-600 transition-colors border border-slate-200/60"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ================= MODAL DE DETALHES DA NOTA FISCAL ================= */}
      {selectedNF && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white w-full max-w-4xl rounded-3xl border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="p-6 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-rose-600/30 border border-rose-500/40 text-rose-400 flex items-center justify-center font-black text-sm">
                  <Receipt className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-black text-white">
                      Nota Fiscal #{selectedNF.numberNF}
                    </h3>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30">
                      Entrada Lançada
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 font-medium">
                    Fornecedor: {selectedNF.supplier} {selectedNF.cnpjSupplier ? `• CNPJ: ${selectedNF.cnpjSupplier}` : ''}
                  </p>
                </div>
              </div>

              <button
                onClick={() => setSelectedNF(null)}
                className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
                title="Fechar Detalhes"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Scrollable Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
              {/* Header Info Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 bg-slate-50 p-4 rounded-2xl border border-slate-200/80 text-xs">
                <div>
                  <span className="text-[10px] font-bold uppercase text-slate-400 block">Número da NF</span>
                  <span className="font-extrabold text-slate-800 text-sm">#{selectedNF.numberNF}</span>
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase text-slate-400 block">Data de Entrada</span>
                  <span className="font-bold text-slate-800">{formatDate(selectedNF.receiveDate || selectedNF.issueDate)}</span>
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase text-slate-400 block">Data de Emissão</span>
                  <span className="font-bold text-slate-800">{formatDate(selectedNF.issueDate || selectedNF.receiveDate)}</span>
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase text-slate-400 block">Lançado por</span>
                  <span className="font-bold text-slate-800">{selectedNF.createdBy || 'Sistema GummyStock'}</span>
                </div>
              </div>

              {/* Chave de Acesso (se houver) */}
              {selectedNF.accessKey && (
                <div className="bg-slate-900 text-slate-200 p-4 rounded-2xl border border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div className="min-w-0">
                    <span className="text-[10px] font-bold uppercase text-slate-400 block">Chave de Acesso da NF-e (44 dígitos)</span>
                    <span className="font-mono text-xs text-rose-300 font-semibold break-all">
                      {selectedNF.accessKey}
                    </span>
                  </div>
                  <button
                    onClick={() => handleCopyAccessKey(selectedNF.accessKey)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-colors shrink-0"
                  >
                    {copiedKey ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="text-emerald-400 font-bold">Copiado!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5 text-slate-400" />
                        <span>Copiar Chave</span>
                      </>
                    )}
                  </button>
                </div>
              )}

              {/* Observações da NF (se houver) */}
              {selectedNF.notes && (
                <div className="p-3 bg-amber-50 rounded-2xl border border-amber-200/80 text-xs text-amber-800">
                  <span className="font-bold uppercase text-[10px] text-amber-600 block mb-0.5">Observações:</span>
                  <p>{selectedNF.notes}</p>
                </div>
              )}

              {/* RESUMO CONSOLIDADO DE IMPOSTOS E DESPESAS DA NF-E (Apenas se houver valores calculados) */}
              {nfTotals && nfTotals.hasAllocations && (
                <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white p-4 sm:p-5 rounded-2xl border border-slate-700 space-y-3.5 shadow-lg animate-in fade-in">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-700/80 pb-3 gap-2">
                    <div className="flex items-center gap-2">
                      <Receipt className="w-4 h-4 text-emerald-400 shrink-0" />
                      <div>
                        <h4 className="text-xs font-black uppercase tracking-wider text-emerald-400">
                          Resumo Consolidado de Custos e Impostos da NF-e
                        </h4>
                        <p className="text-[11px] text-slate-300">
                          Rateio proporcional de frete, despesas adicionais e tributos fiscais incorporados ao custo real.
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-right">
                      <span className="text-[10px] font-bold text-slate-400 uppercase">Valor Total NF:</span>
                      <span className="text-sm sm:text-base font-black text-emerald-400 bg-emerald-950/60 border border-emerald-500/30 px-2.5 py-0.5 rounded-lg">
                        {formatCurrency(selectedNF.totalValue || nfTotals.totalCalculatedCost)}
                      </span>
                    </div>
                  </div>

                  {/* Metrics Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
                    <div className="bg-slate-800/90 p-2.5 rounded-xl border border-slate-700/60">
                      <span className="text-[9px] font-bold text-slate-400 uppercase block">Total Produtos (Base)</span>
                      <span className="font-extrabold text-slate-100 text-sm block">
                        {formatCurrency(nfTotals.totalBaseProducts)}
                      </span>
                    </div>

                    <div className="bg-slate-800/90 p-2.5 rounded-xl border border-slate-700/60">
                      <div className="flex items-center justify-between">
                        <span className="text-[9px] font-bold text-slate-400 uppercase block">+ Frete & Despesas</span>
                        {nfTotals.totalAdditionalExpenses > 0 && (
                          <Truck className="w-3 h-3 text-amber-400" />
                        )}
                      </div>
                      <span className={`font-extrabold text-sm block ${nfTotals.totalAdditionalExpenses > 0 ? 'text-amber-300' : 'text-slate-400'}`}>
                        {formatCurrency(nfTotals.totalAdditionalExpenses)}
                      </span>
                      <div className="flex flex-wrap gap-1 mt-1 text-[9px] text-slate-400">
                        {nfTotals.totalFreight > 0 && <span>Frete: {formatCurrency(nfTotals.totalFreight)}</span>}
                        {nfTotals.totalInsurance > 0 && <span>• Seg: {formatCurrency(nfTotals.totalInsurance)}</span>}
                        {nfTotals.totalOther > 0 && <span>• Outros: {formatCurrency(nfTotals.totalOther)}</span>}
                      </div>
                    </div>

                    <div className="bg-slate-800/90 p-2.5 rounded-xl border border-slate-700/60">
                      <div className="flex items-center justify-between">
                        <span className="text-[9px] font-bold text-slate-400 uppercase block">+ Tributos Totais</span>
                        {nfTotals.totalTaxes > 0 && (
                          <ShieldCheck className="w-3 h-3 text-rose-400" />
                        )}
                      </div>
                      <span className={`font-extrabold text-sm block ${nfTotals.totalTaxes > 0 ? 'text-rose-300' : 'text-slate-400'}`}>
                        {formatCurrency(nfTotals.totalTaxes)}
                      </span>
                      <div className="flex flex-wrap gap-1 mt-1 text-[9px] text-slate-400">
                        {nfTotals.totalIcmsSt > 0 && <span>ST: {formatCurrency(nfTotals.totalIcmsSt)}</span>}
                        {nfTotals.totalIpi > 0 && <span>• IPI: {formatCurrency(nfTotals.totalIpi)}</span>}
                        {nfTotals.totalIi > 0 && <span>• II: {formatCurrency(nfTotals.totalIi)}</span>}
                        {nfTotals.totalDifal > 0 && <span>• DIFAL: {formatCurrency(nfTotals.totalDifal)}</span>}
                      </div>
                    </div>

                    <div className="bg-slate-800/90 p-2.5 rounded-xl border border-slate-700/60">
                      <div className="flex items-center justify-between">
                        <span className="text-[9px] font-bold text-slate-400 uppercase block">- Deduções Fiscais</span>
                        {nfTotals.totalDeductions > 0 && (
                          <Minus className="w-3 h-3 text-emerald-400" />
                        )}
                      </div>
                      <span className={`font-extrabold text-sm block ${nfTotals.totalDeductions > 0 ? 'text-emerald-400' : 'text-slate-400'}`}>
                        {formatCurrency(nfTotals.totalDeductions)}
                      </span>
                      <div className="flex flex-wrap gap-1 mt-1 text-[9px] text-slate-400">
                        {nfTotals.totalDiscount > 0 && <span>Desc: {formatCurrency(nfTotals.totalDiscount)}</span>}
                        {nfTotals.totalRecoverableTaxes > 0 && <span>• Recup: {formatCurrency(nfTotals.totalRecoverableTaxes)}</span>}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Tabela de Produtos / Itens da Nota */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                    <Package className="w-4 h-4 text-rose-500" />
                    <span>Itens Lançados nesta Nota ({selectedNF.items?.length || 0})</span>
                  </h4>
                  <span className="text-xs font-bold text-slate-500">
                    Total: {selectedNF.items?.reduce((acc, it) => acc + (it.quantity || 0), 0) || 0} unidades
                  </span>
                </div>

                <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-extrabold uppercase tracking-wider text-slate-500">
                        <th className="py-2.5 px-3.5">Item / Produto</th>
                        <th className="py-2.5 px-3 text-center">Qtd Entrada</th>
                        <th className="py-2.5 px-3 text-right">Custo Unitário</th>
                        <th className="py-2.5 px-3 text-right">Custo Total</th>
                        <th className="py-2.5 px-3">Lote</th>
                        <th className="py-2.5 px-3">Validade</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {selectedNF.items?.map((item, idx) => {
                        const freight = item.freightAllocated || 0;
                        const insurance = item.insuranceAllocated || 0;
                        const other = item.otherExpensesAllocated || 0;
                        const discount = item.discountAllocated || 0;
                        const icmsSt = item.icmsStAllocated || 0;
                        const ipi = item.ipiAllocated || 0;
                        const ii = item.iiAllocated || 0;
                        const difal = item.difalAllocated || 0;
                        const recTaxes = item.recoverableTaxesAllocated || 0;

                        const itemTotalCost = item.totalCost || (item.quantity * item.costPrice) || 0;
                        const netAlloc = freight + insurance + other + icmsSt + ipi + ii + difal - discount - recTaxes;
                        const baseProdVal = item.itemProdValue !== undefined && item.itemProdValue > 0
                          ? item.itemProdValue
                          : Math.max(0, itemTotalCost - netAlloc);
                        const baseUnitVal = item.quantity > 0 ? baseProdVal / item.quantity : 0;

                        const hasItemAllocations =
                          freight > 0 ||
                          insurance > 0 ||
                          other > 0 ||
                          discount > 0 ||
                          icmsSt > 0 ||
                          ipi > 0 ||
                          ii > 0 ||
                          difal > 0 ||
                          recTaxes > 0;

                        const isExpanded = !!expandedItems[idx];

                        return (
                          <React.Fragment key={idx}>
                            <tr className="hover:bg-slate-50/60 transition-colors">
                              <td className="py-3 px-3.5 font-bold text-slate-800">
                                <div className="space-y-1">
                                  <span className="block font-extrabold text-slate-900">{item.productName}</span>
                                  {hasItemAllocations && (
                                    <button
                                      type="button"
                                      onClick={() => toggleItemExpansion(idx)}
                                      className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 px-2 py-0.5 rounded-md transition-colors cursor-pointer border border-rose-200/60"
                                    >
                                      <Receipt className="w-3 h-3 text-rose-500" />
                                      <span>{isExpanded ? 'Ocultar composição' : 'Ver composição do custo'}</span>
                                      {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                                    </button>
                                  )}
                                </div>
                              </td>
                              <td className="py-3 px-3 text-center font-extrabold text-slate-900">
                                <span className="px-2 py-0.5 bg-slate-100 rounded-lg">
                                  {item.quantity} un
                                </span>
                              </td>
                              <td className="py-3 px-3 text-right font-medium text-slate-600">
                                <div>
                                  <span className="block font-bold text-slate-800">{formatCurrency(item.costPrice || 0)}</span>
                                  {hasItemAllocations && (
                                    <span className="text-[10px] text-slate-400 block" title="Preço de tabela (base)">
                                      Base: {formatCurrency(baseUnitVal)}
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="py-3 px-3 text-right font-extrabold text-slate-900">
                                <span className="text-emerald-600 font-extrabold">
                                  {formatCurrency(itemTotalCost)}
                                </span>
                              </td>
                              <td className="py-3 px-3 font-mono text-slate-600 text-[11px]">
                                {item.batchNumber || '-'}
                              </td>
                              <td className="py-3 px-3 text-slate-600 font-semibold text-[11px]">
                                {formatDate(item.expirationDate)}
                              </td>
                            </tr>

                            {/* Detalhamento da Composição do Custo Real do Item (Apenas se expandido) */}
                            {isExpanded && hasItemAllocations && (
                              <tr className="bg-slate-900 text-slate-100 animate-in fade-in">
                                <td colSpan={6} className="p-3.5 sm:p-4">
                                  <div className="space-y-3">
                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-700 pb-2 gap-1.5">
                                      <div className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-emerald-400">
                                        <Receipt className="w-3.5 h-3.5" />
                                        <span>Composição do Custo Real: {item.productName} (+{item.quantity} un)</span>
                                      </div>
                                      <span className="text-[11px] font-mono text-slate-300">
                                        Custo Real Unitário: <strong className="text-emerald-400 font-black">{formatCurrency(item.costPrice || 0)}</strong>
                                      </span>
                                    </div>

                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 text-xs">
                                      {/* Linha: Valor Base do Produto */}
                                      <div className="bg-slate-800/90 p-2.5 rounded-xl border border-slate-700">
                                        <span className="text-[9px] font-bold text-slate-400 uppercase block">Valor do Produto (Base)</span>
                                        <div className="flex justify-between items-baseline mt-0.5">
                                          <span className="font-bold text-slate-100">{formatCurrency(baseProdVal)}</span>
                                          <span className="text-[10px] text-slate-400 font-mono">({formatCurrency(baseUnitVal)}/un)</span>
                                        </div>
                                      </div>

                                      {/* Linha: Frete (se > 0) */}
                                      {freight > 0 && (
                                        <div className="bg-slate-800/90 p-2.5 rounded-xl border border-slate-700">
                                          <span className="text-[9px] font-bold text-amber-300 uppercase block">+ Frete Rateado</span>
                                          <div className="flex justify-between items-baseline mt-0.5">
                                            <span className="font-bold text-amber-300">+{formatCurrency(freight)}</span>
                                            <span className="text-[10px] text-amber-200/70 font-mono">(+{formatCurrency(freight / item.quantity)}/un)</span>
                                          </div>
                                        </div>
                                      )}

                                      {/* Linha: Seguro (se > 0) */}
                                      {insurance > 0 && (
                                        <div className="bg-slate-800/90 p-2.5 rounded-xl border border-slate-700">
                                          <span className="text-[9px] font-bold text-amber-300 uppercase block">+ Seguro Rateado</span>
                                          <div className="flex justify-between items-baseline mt-0.5">
                                            <span className="font-bold text-amber-300">+{formatCurrency(insurance)}</span>
                                            <span className="text-[10px] text-amber-200/70 font-mono">(+{formatCurrency(insurance / item.quantity)}/un)</span>
                                          </div>
                                        </div>
                                      )}

                                      {/* Linha: Outras Despesas (se > 0) */}
                                      {other > 0 && (
                                        <div className="bg-slate-800/90 p-2.5 rounded-xl border border-slate-700">
                                          <span className="text-[9px] font-bold text-amber-300 uppercase block">+ Outras Despesas Rateadas</span>
                                          <div className="flex justify-between items-baseline mt-0.5">
                                            <span className="font-bold text-amber-300">+{formatCurrency(other)}</span>
                                            <span className="text-[10px] text-amber-200/70 font-mono">(+{formatCurrency(other / item.quantity)}/un)</span>
                                          </div>
                                        </div>
                                      )}

                                      {/* Linha: Desconto Comercial (se > 0) */}
                                      {discount > 0 && (
                                        <div className="bg-slate-800/90 p-2.5 rounded-xl border border-slate-700">
                                          <span className="text-[9px] font-bold text-emerald-300 uppercase block">- Desconto Rateado</span>
                                          <div className="flex justify-between items-baseline mt-0.5">
                                            <span className="font-bold text-emerald-300">-{formatCurrency(discount)}</span>
                                            <span className="text-[10px] text-emerald-200/70 font-mono">(-{formatCurrency(discount / item.quantity)}/un)</span>
                                          </div>
                                        </div>
                                      )}

                                      {/* Linha: ICMS-ST (se > 0) */}
                                      {icmsSt > 0 && (
                                        <div className="bg-slate-800/90 p-2.5 rounded-xl border border-slate-700">
                                          <span className="text-[9px] font-bold text-rose-300 uppercase block">+ ICMS-ST Rateado</span>
                                          <div className="flex justify-between items-baseline mt-0.5">
                                            <span className="font-bold text-rose-300">+{formatCurrency(icmsSt)}</span>
                                            <span className="text-[10px] text-rose-200/70 font-mono">(+{formatCurrency(icmsSt / item.quantity)}/un)</span>
                                          </div>
                                        </div>
                                      )}

                                      {/* Linha: IPI (se > 0) */}
                                      {ipi > 0 && (
                                        <div className="bg-slate-800/90 p-2.5 rounded-xl border border-slate-700">
                                          <span className="text-[9px] font-bold text-rose-300 uppercase block">+ IPI Rateado</span>
                                          <div className="flex justify-between items-baseline mt-0.5">
                                            <span className="font-bold text-rose-300">+{formatCurrency(ipi)}</span>
                                            <span className="text-[10px] text-rose-200/70 font-mono">(+{formatCurrency(ipi / item.quantity)}/un)</span>
                                          </div>
                                        </div>
                                      )}

                                      {/* Linha: II (se > 0) */}
                                      {ii > 0 && (
                                        <div className="bg-slate-800/90 p-2.5 rounded-xl border border-slate-700">
                                          <span className="text-[9px] font-bold text-rose-300 uppercase block">+ Imposto de Importação (II)</span>
                                          <div className="flex justify-between items-baseline mt-0.5">
                                            <span className="font-bold text-rose-300">+{formatCurrency(ii)}</span>
                                            <span className="text-[10px] text-rose-200/70 font-mono">(+{formatCurrency(ii / item.quantity)}/un)</span>
                                          </div>
                                        </div>
                                      )}

                                      {/* Linha: DIFAL (se > 0) */}
                                      {difal > 0 && (
                                        <div className="bg-slate-800/90 p-2.5 rounded-xl border border-slate-700">
                                          <span className="text-[9px] font-bold text-amber-300 uppercase block">+ DIFAL Rateado</span>
                                          <div className="flex justify-between items-baseline mt-0.5">
                                            <span className="font-bold text-amber-300">+{formatCurrency(difal)}</span>
                                            <span className="text-[10px] text-amber-200/70 font-mono">(+{formatCurrency(difal / item.quantity)}/un)</span>
                                          </div>
                                        </div>
                                      )}

                                      {/* Linha: Impostos Recuperáveis (se > 0) */}
                                      {recTaxes > 0 && (
                                        <div className="bg-slate-800/90 p-2.5 rounded-xl border border-slate-700">
                                          <span className="text-[9px] font-bold text-emerald-300 uppercase block">- Impostos Recuperáveis</span>
                                          <div className="flex justify-between items-baseline mt-0.5">
                                            <span className="font-bold text-emerald-300">-{formatCurrency(recTaxes)}</span>
                                            <span className="text-[10px] text-emerald-200/70 font-mono">(-{formatCurrency(recTaxes / item.quantity)}/un)</span>
                                          </div>
                                        </div>
                                      )}

                                      {/* Total Custo Real do Item */}
                                      <div className="bg-emerald-950/80 p-2.5 rounded-xl border border-emerald-500/40 sm:col-span-2 lg:col-span-3 flex justify-between items-center">
                                        <div>
                                          <span className="text-[9px] font-black text-emerald-400 uppercase block">(=) Custo Real Final de Aquisição</span>
                                          <span className="text-[11px] text-slate-300 font-mono">
                                            {item.quantity} un × {formatCurrency(item.costPrice || 0)}
                                          </span>
                                        </div>
                                        <span className="text-base font-black text-emerald-400">
                                          {formatCurrency(itemTotalCost)}
                                        </span>
                                      </div>
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="bg-slate-50/90 font-extrabold border-t border-slate-200 text-slate-900">
                        <td className="py-3 px-3.5">Totais da Nota:</td>
                        <td className="py-3 px-3 text-center">
                          {selectedNF.items?.reduce((acc, it) => acc + (it.quantity || 0), 0) || 0} un
                        </td>
                        <td className="py-3 px-3"></td>
                        <td className="py-3 px-3 text-right text-emerald-600 text-sm">
                          {formatCurrency(selectedNF.totalValue || 0)}
                        </td>
                        <td colSpan={2}></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 sm:p-5 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <Clock className="w-3.5 h-3.5" />
                <span>Recebida em: {formatDateTime(selectedNF.receiveDate || selectedNF.issueDate)}</span>
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                {canDeleteNF && (
                  <button
                    onClick={() => setNfToDelete(selectedNF)}
                    className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-white hover:bg-rose-50 text-rose-600 font-bold text-xs border border-rose-200 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Excluir Nota</span>
                  </button>
                )}

                <button
                  onClick={() => setSelectedNF(null)}
                  className="px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs transition-colors"
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL DE CONFIRMAÇÃO DE EXCLUSÃO DE NF ================= */}
      {nfToDelete && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white w-full max-w-md rounded-3xl border border-slate-200 p-6 shadow-2xl space-y-4 animate-in zoom-in-95 duration-150 text-left">
            <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>

            <div className="text-center space-y-1.5">
              <h3 className="text-base font-extrabold text-slate-900">
                Excluir Nota Fiscal #{nfToDelete.numberNF}?
              </h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                Ao excluir esta nota fiscal, <strong className="text-slate-800">as quantidades de todos os itens lançados serão revertidas e subtraídas do estoque do depósito</strong>.
              </p>
            </div>

            {deleteError && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{deleteError}</span>
              </div>
            )}

            {deleteSuccess && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl text-xs flex items-center gap-2">
                <Check className="w-4 h-4 shrink-0 text-emerald-600" />
                <span>{deleteSuccess}</span>
              </div>
            )}

            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200/80 text-xs space-y-1">
              <div className="flex justify-between text-slate-600">
                <span>Fornecedor:</span>
                <strong className="text-slate-800">{nfToDelete.supplier}</strong>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Total de Itens:</span>
                <strong className="text-slate-800">
                  {nfToDelete.items?.reduce((acc, it) => acc + (it.quantity || 0), 0) || 0} un
                </strong>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Valor Total:</span>
                <strong className="text-emerald-600 font-black">
                  {formatCurrency(nfToDelete.totalValue || 0)}
                </strong>
              </div>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => {
                  setNfToDelete(null);
                  setDeleteError(null);
                  setDeleteSuccess(null);
                }}
                className="flex-1 py-2.5 px-4 rounded-xl border border-slate-200 font-bold text-xs text-slate-600 hover:bg-slate-50 transition-colors"
              >
                Cancelar
              </button>

              <button
                type="button"
                disabled={isDeleting}
                onClick={handleConfirmDeleteNF}
                className="flex-1 py-2.5 px-4 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs shadow-md shadow-rose-600/30 transition-all flex items-center justify-center gap-1.5"
              >
                {isDeleting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Excluindo...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Sim, Excluir e Reverter</span>
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
