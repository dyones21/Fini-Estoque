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
                      {selectedNF.items?.map((item, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/60 transition-colors">
                          <td className="py-3 px-3.5 font-bold text-slate-800">
                            {item.productName}
                          </td>
                          <td className="py-3 px-3 text-center font-extrabold text-slate-900">
                            <span className="px-2 py-0.5 bg-slate-100 rounded-lg">
                              {item.quantity} un
                            </span>
                          </td>
                          <td className="py-3 px-3 text-right font-medium text-slate-600">
                            {formatCurrency(item.costPrice || 0)}
                          </td>
                          <td className="py-3 px-3 text-right font-extrabold text-slate-900">
                            {formatCurrency(item.totalCost || (item.quantity * item.costPrice) || 0)}
                          </td>
                          <td className="py-3 px-3 font-mono text-slate-600 text-[11px]">
                            {item.batchNumber || '-'}
                          </td>
                          <td className="py-3 px-3 text-slate-600 font-semibold text-[11px]">
                            {formatDate(item.expirationDate)}
                          </td>
                        </tr>
                      ))}
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
