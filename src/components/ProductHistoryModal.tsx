import React, { useMemo } from 'react';
import {
  X,
  History,
  ArrowRightLeft,
  ShoppingBag,
  FileSpreadsheet,
  MinusCircle,
  Clock,
  Warehouse,
  Store,
  User,
  Package,
  Layers,
  ArrowDownRight,
  ArrowUpRight,
  Info,
} from 'lucide-react';
import { useStock } from '../context/StockContext';
import { Product, StockMovement } from '../types';

interface ProductHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  product: Product | null;
}

export const ProductHistoryModal: React.FC<ProductHistoryModalProps> = ({
  isOpen,
  onClose,
  product,
}) => {
  const { movements } = useStock();

  const productMovements = useMemo(() => {
    if (!product) return [];
    
    // Filtra todas as movimentações do produto
    const filtered = movements.filter(
      (m) =>
        m.productId === product.id ||
        (m.productName && product.name && m.productName.trim().toLowerCase() === product.name.trim().toLowerCase())
    );

    // Ordena da mais recente para a mais antiga
    return [...filtered].sort((a, b) => {
      const timeA = new Date(a.date || (a as any).timestamp || 0).getTime();
      const timeB = new Date(b.date || (b as any).timestamp || 0).getTime();
      return timeB - timeA;
    });
  }, [movements, product]);

  if (!isOpen || !product) return null;

  const totalStock = (product.stockDeposito || 0) + (product.stockLoja || 0);

  const formatMovementDate = (isoStr?: string) => {
    if (!isoStr) return '--/--/---- --:--';
    try {
      const d = new Date(isoStr);
      if (isNaN(d.getTime())) return isoStr;
      return d.toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return isoStr;
    }
  };

  const getMovementMeta = (m: StockMovement) => {
    const rawType = String(m.type || '').toLowerCase();

    if (rawType.includes('entrada') || rawType === 'entrada_nf') {
      return {
        label: 'Entrada por NF',
        badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-300',
        icon: FileSpreadsheet,
        iconColor: 'text-emerald-600',
        qtyPrefix: '+',
        qtyClass: 'text-emerald-700 font-extrabold',
        defaultOrigin: 'Fornecedor NF',
        defaultDest: 'Depósito Central',
      };
    }

    if (rawType.includes('transf') || rawType === 'transferencia_deposito_loja') {
      return {
        label: 'Transferência Interna',
        badgeClass: 'bg-sky-100 text-sky-800 border-sky-300',
        icon: ArrowRightLeft,
        iconColor: 'text-sky-600',
        qtyPrefix: '',
        qtyClass: 'text-sky-800 font-bold',
        defaultOrigin: 'Depósito Central',
        defaultDest: 'Loja GummyStock',
      };
    }

    if (rawType.includes('venda') || rawType === 'venda_loja') {
      return {
        label: 'Baixa para Baleiro / Venda',
        badgeClass: 'bg-teal-100 text-teal-800 border-teal-300',
        icon: ShoppingBag,
        iconColor: 'text-teal-600',
        qtyPrefix: '-',
        qtyClass: 'text-teal-700 font-extrabold',
        defaultOrigin: 'Loja GummyStock',
        defaultDest: 'Baleiro / Consumidor Final',
      };
    }

    // Perda / Avaria / Ajuste
    return {
      label: 'Ajuste / Perda / Avaria',
      badgeClass: 'bg-amber-100 text-amber-800 border-amber-300',
      icon: MinusCircle,
      iconColor: 'text-amber-600',
      qtyPrefix: '-',
      qtyClass: 'text-amber-700 font-bold',
      defaultOrigin: m.location === 'deposito' ? 'Depósito Central' : 'Loja GummyStock',
      defaultDest: 'Baixa Operacional',
    };
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
        
        {/* Modal Header */}
        <div className="bg-slate-900 text-white p-5 sm:p-6 flex items-start justify-between gap-4 shrink-0">
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-2xl bg-slate-800 text-rose-400 shrink-0 mt-0.5 border border-slate-700">
              <History className="w-6 h-6" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-black text-white">{product.name}</h2>
                <span className="text-[10px] font-mono font-bold bg-slate-800 text-rose-300 px-2 py-0.5 rounded-md border border-slate-700">
                  SKU: {product.sku}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Histórico completo de entradas, transferências e saídas registradas.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Product Stock Summary Bar */}
        <div className="bg-slate-50 border-b border-slate-200 p-4 px-6 grid grid-cols-2 sm:grid-cols-4 gap-3 shrink-0">
          <div className="bg-white p-2.5 rounded-xl border border-slate-200 shadow-2xs">
            <span className="text-[10px] font-bold text-slate-500 uppercase block">Categoria</span>
            <span className="text-xs font-extrabold text-slate-800 truncate block">{product.category}</span>
          </div>

          <div className="bg-sky-50/80 p-2.5 rounded-xl border border-sky-100 shadow-2xs">
            <span className="text-[10px] font-bold text-sky-700 uppercase block">Depósito Central</span>
            <span className="text-sm font-black text-sky-900">{product.stockDeposito} {product.unit}</span>
          </div>

          <div className="bg-amber-50/80 p-2.5 rounded-xl border border-amber-100 shadow-2xs">
            <span className="text-[10px] font-bold text-amber-700 uppercase block">Loja Friburgo</span>
            <span className="text-sm font-black text-amber-900">{product.stockLoja} {product.unit}</span>
          </div>

          <div className="bg-slate-900 text-white p-2.5 rounded-xl shadow-2xs">
            <span className="text-[10px] font-bold text-slate-400 uppercase block">Saldo Total</span>
            <span className="text-sm font-black text-white">{totalStock} {product.unit}</span>
          </div>
        </div>

        {/* Timeline Content List */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          {productMovements.length === 0 ? (
            <div className="text-center py-12 px-4 space-y-3 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
              <div className="w-12 h-12 rounded-2xl bg-slate-200/80 text-slate-500 flex items-center justify-center mx-auto">
                <History className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-bold text-slate-700">Nenhuma movimentação registrada ainda</h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
                As movimentações aparecerão aqui assim que houver entradas de Nota Fiscal, transferências entre depósito e loja, baixas para o baleiro ou ajustes de inventário.
              </p>
            </div>
          ) : (
            <div className="relative border-l-2 border-slate-200 ml-4 pl-4 sm:pl-6 space-y-6">
              {productMovements.map((mov, idx) => {
                const meta = getMovementMeta(mov);
                const MovIcon = meta.icon;
                const originText = (mov as any).origin || meta.defaultOrigin;
                const destText = (mov as any).destination || meta.defaultDest;
                const batchText = (mov as any).batchNumber || product.batchNumber || 'LOTE-GERAL';
                const userText = mov.userName || (mov as any).createdBy || 'Sistema GummyStock';
                const reasonText = mov.reason || (mov as any).notes;

                return (
                  <div key={mov.id || `mov-${idx}`} className="relative group">
                    
                    {/* Timeline Dot Indicator */}
                    <div className="absolute -left-[27px] sm:-left-[35px] top-1.5 w-6 h-6 rounded-full bg-white border-2 border-slate-300 group-hover:border-rose-500 flex items-center justify-center shadow-xs transition-colors">
                      <MovIcon className={`w-3 h-3 ${meta.iconColor}`} />
                    </div>

                    {/* Timeline Card */}
                    <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-2xs hover:shadow-xs transition-all space-y-3">
                      
                      {/* Top Row: Type Badge + Date + Quantity */}
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className={`inline-flex items-center gap-1 text-[11px] font-extrabold px-2.5 py-0.5 rounded-full border ${meta.badgeClass}`}>
                            <MovIcon className="w-3 h-3" />
                            {meta.label}
                          </span>
                          <span className="text-xs font-semibold text-slate-500 flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5 text-slate-400" />
                            {formatMovementDate(mov.date || (mov as any).timestamp)}
                          </span>
                        </div>

                        <div className="text-right">
                          <span className={`text-sm ${meta.qtyClass}`}>
                            {meta.qtyPrefix}{mov.quantity} {product.unit}
                          </span>
                        </div>
                      </div>

                      {/* Route & Batch Info */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                        <div>
                          <span className="text-[10px] font-bold text-slate-400 uppercase block">Fluxo / Trajeto</span>
                          <span className="font-semibold text-slate-800 flex items-center gap-1.5 mt-0.5">
                            <span className="text-slate-600">{originText}</span>
                            <span className="text-slate-400">→</span>
                            <span className="text-slate-900 font-bold">{destText}</span>
                          </span>
                        </div>

                        <div>
                          <span className="text-[10px] font-bold text-slate-400 uppercase block">Lote & Operador</span>
                          <span className="font-semibold text-slate-700 flex items-center gap-2 mt-0.5">
                            <span className="font-mono text-[11px] bg-white px-1.5 py-0.5 rounded border border-slate-200">
                              {batchText}
                            </span>
                            <span className="text-slate-500 truncate" title={userText}>
                              👤 {userText}
                            </span>
                          </span>
                        </div>
                      </div>

                      {/* Optional Notes / Motivo */}
                      {reasonText && (
                        <div className="text-xs text-slate-600 bg-amber-50/60 border border-amber-100/80 rounded-lg p-2 flex items-start gap-2">
                          <Info className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                          <span>
                            <strong>Motivo/Obs:</strong> {reasonText}
                          </span>
                        </div>
                      )}

                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="bg-slate-50 p-4 px-6 border-t border-slate-200 flex items-center justify-between shrink-0">
          <span className="text-xs text-slate-500">
            Total de {productMovements.length} registro(s) encontrado(s).
          </span>
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs shadow-xs transition-colors cursor-pointer"
          >
            Fechar
          </button>
        </div>

      </div>
    </div>
  );
};
