import React, { useState, useEffect } from 'react';
import { X, ShoppingBag, Check, Plus, Minus, Tag, Store } from 'lucide-react';
import { useStock } from '../context/StockContext';
import { Product } from '../types';
import { formatCurrency, parseNumber } from '../utils/inventoryUtils';
import { getFriendlyErrorMessage } from '../utils/errorHandler';
import { ProductSearchScanner } from './ProductSearchScanner';

interface StoreSaleModalProps {
  isOpen: boolean;
  onClose: () => void;
  preselectedProduct?: Product | null;
}

export const StoreSaleModal: React.FC<StoreSaleModalProps> = ({
  isOpen,
  onClose,
  preselectedProduct,
}) => {
  const { products, registerMovement, checkPermission } = useStock();

  const [selectedProductId, setSelectedProductId] = useState<string>('');
  const [quantity, setQuantity] = useState<string | number>(1);
  const [reason, setReason] = useState<string>('Baixa para Baleiro / Abertura de Pacote Exposto');
  const [successMessage, setSuccessMessage] = useState<string>('');

  useEffect(() => {
    if (preselectedProduct) {
      setSelectedProductId(preselectedProduct.id);
    } else if (products.length > 0 && !selectedProductId) {
      setSelectedProductId(products[0].id);
    }
  }, [preselectedProduct, products]);

  if (!isOpen) return null;

  if (!checkPermission('canRegisterMovements')) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm animate-in fade-in duration-200">
        <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-2xl max-w-md w-full text-center space-y-4">
          <div className="w-12 h-12 bg-rose-100 text-rose-600 rounded-2xl flex items-center justify-center mx-auto">
            <X className="w-6 h-6" />
          </div>
          <h3 className="text-base font-black text-slate-900">Acesso Não Autorizado</h3>
          <p className="text-xs text-slate-600">
            Você não possui permissão para registrar baixas ou movimentações de estoque.
          </p>
          <button
            onClick={onClose}
            className="w-full py-2.5 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-800 transition-colors"
          >
            Fechar
          </button>
        </div>
      </div>
    );
  }

  const currentProduct = products.find((p) => p.id === selectedProductId);

  const handleQuickAdd = (amount: number) => {
    const currentQty = parseNumber(quantity, 1);
    setQuantity(Math.max(1, currentQty + amount));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const qty = parseNumber(quantity, 1);
    if (!selectedProductId || !currentProduct) return;

    if (qty <= 0) {
      alert('A quantidade deve ser maior que zero.');
      return;
    }

    if (currentProduct.stockLoja < qty) {
      const confirmProceed = confirm(
        `Atenção: A quantidade informada (${qty}) é maior que o estoque fechado da loja (${currentProduct.stockLoja} un). Deseja registrar a baixa para baleiro (pacote aberto) mesmo assim?`
      );
      if (!confirmProceed) return;
    }

    try {
      await registerMovement(
        selectedProductId,
        'venda_loja',
        qty,
        'loja',
        reason || 'Baixa para Baleiro / Pacote Aberto',
        currentProduct.sellPrice
      );

      const msg = `Baixa de ${qty}x "${currentProduct.name}" efetuada para o Baleiro (Pacote Aberto) com sucesso! Item removido do estoque fechado.`;
      setSuccessMessage(msg);

      setTimeout(() => {
        setSuccessMessage('');
        onClose();
      }, 1400);
    } catch (err: any) {
      const friendlyMsg = getFriendlyErrorMessage(err, 'Não foi possível registrar a baixa para o baleiro no servidor.');
      alert(friendlyMsg);
    }
  };

  const qtyNumber = parseNumber(quantity, 1);
  const totalSaleValue = currentProduct ? qtyNumber * currentProduct.sellPrice : 0;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden my-auto max-h-[92vh] flex flex-col">
        
        {/* Header - Fixed top */}
        <div className="bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 p-4 sm:p-5 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5 sm:gap-3">
            <div className="p-2 sm:p-2.5 rounded-2xl bg-white/10 backdrop-blur-md text-white border border-white/20 shrink-0">
              <ShoppingBag className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                <h2 className="text-base sm:text-lg font-black tracking-tight text-left">
                  Baixa para Baleiro (Pacote Aberto)
                </h2>
                <span className="text-[9px] sm:text-[10px] font-extrabold px-2 py-0.5 rounded bg-white text-emerald-800 uppercase">
                  Baleiro / Balcão
                </span>
              </div>
              <p className="text-[11px] sm:text-xs text-emerald-100 mt-0.5 text-left">
                Saída de pacotes fechados do estoque para abertura e exposição
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 sm:p-2 rounded-xl text-emerald-100 hover:text-white hover:bg-white/10 transition-colors shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Modal Content Body */}
        <div className="overflow-y-auto flex-1">
          {/* Notice Alert Box */}
          <div className="bg-amber-50 border-b border-amber-200 p-3 px-4 sm:px-5 flex items-center gap-2.5 text-xs text-amber-900 font-semibold">
            <Tag className="w-4 h-4 text-amber-600 shrink-0" />
            <span className="text-left">
              <strong>Nota de Regra:</strong> Pacotes abertos expostos no baleiro <u>não contam</u> no saldo de estoque fechado do sistema.
            </span>
          </div>

          {/* Success Alert */}
          {successMessage ? (
            <div className="p-8 text-center space-y-3">
              <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
                <Check className="w-6 h-6" />
              </div>
              <p className="text-sm font-bold text-slate-800">{successMessage}</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-4">
              
              {/* Product Scanner & Search */}
              <ProductSearchScanner
                products={products}
                selectedProductId={selectedProductId}
                onSelectProduct={(prod) => setSelectedProductId(prod.id)}
                label="Localizar Produto p/ Baixa (GTIN/Câmera, SKU ou Nome) *"
                placeholder="Escaneie GTIN/EAN com câmera ou busque por nome..."
              />

              {/* Current Product Info Card */}
              {currentProduct && (
                <div className="p-3.5 sm:p-4 rounded-2xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                  <div className="text-left">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                      Disponível na Loja Friburgo
                    </span>
                    <div className="flex items-center gap-2 mt-0.5">
                      <Store className="w-4 h-4 text-amber-500 shrink-0" />
                      <span className="text-base sm:text-lg font-black text-slate-900">
                        {currentProduct.stockLoja} <span className="text-xs font-semibold text-slate-500">{currentProduct.unit}</span>
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      SKU: {currentProduct.sku} • Preço: <span className="font-bold text-emerald-700">{formatCurrency(currentProduct.sellPrice)}</span>
                    </p>
                  </div>

                  <div className="text-left sm:text-right border-t sm:border-t-0 sm:border-l border-slate-200 pt-2 sm:pt-0 sm:pl-4">
                    <span className="text-[10px] font-bold text-slate-400 uppercase block">
                      No Depósito Central
                    </span>
                    <span className="text-xs sm:text-sm font-bold text-sky-800">
                      {currentProduct.stockDeposito} un
                    </span>
                  </div>
                </div>
              )}

              {/* Quantity Input + Quick Chips */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1 text-left">
                  Quantidade de Pacotes Fechados a Baixar *
                </label>

                <div className="flex items-center gap-2 mb-2">
                  <button
                    type="button"
                    onClick={() => handleQuickAdd(-1)}
                    className="p-2.5 sm:p-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold transition-colors shrink-0"
                  >
                    <Minus className="w-4 h-4" />
                  </button>

                  <input
                    type="text"
                    inputMode="numeric"
                    required
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    onFocus={(e) => e.target.select()}
                    className="flex-1 text-center text-lg sm:text-xl font-black text-slate-900 p-2 sm:p-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-500/20"
                  />

                  <button
                    type="button"
                    onClick={() => handleQuickAdd(1)}
                    className="p-2.5 sm:p-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold transition-colors shrink-0"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>

                {/* Quick increment presets */}
                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  <span className="text-[10px] text-slate-400 font-bold uppercase mr-1">Atalhos:</span>
                  {[1, 2, 5, 10, 20].map((amt) => (
                    <button
                      key={amt}
                      type="button"
                      onClick={() => setQuantity(amt)}
                      className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-colors"
                    >
                      +{amt}
                    </button>
                  ))}
                </div>
              </div>

              {/* Total Sale Revenue Preview */}
              <div className="p-3 sm:p-3.5 bg-emerald-50 rounded-2xl border border-emerald-200 flex items-center justify-between">
                <div className="flex items-center gap-2 text-emerald-800">
                  <Tag className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span className="text-xs font-bold">Valor Potencial das Unidades:</span>
                </div>
                <span className="text-base sm:text-lg font-black text-emerald-700">
                  {formatCurrency(totalSaleValue)}
                </span>
              </div>

              {/* Reason or Note */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1 text-left">
                  Motivo / Detalhes da Abertura de Pacote
                </label>
                <input
                  type="text"
                  placeholder="Ex: Baixa para baleiro, degustação, reposição de balcão"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="w-full text-xs p-2.5 rounded-xl border border-slate-200"
                />
              </div>

              {/* Footer */}
              <div className="pt-3 border-t border-slate-100 flex flex-col-reverse sm:flex-row items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={onClose}
                  className="w-full sm:w-auto px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-semibold"
                >
                  Cancelar
                </button>

                <button
                  type="submit"
                  className="w-full sm:w-auto flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-5 py-2.5 rounded-xl text-xs shadow-md transition-all hover:scale-[1.01]"
                >
                  <ShoppingBag className="w-4 h-4" />
                  <span>Confirmar Baixa p/ Baleiro</span>
                </button>
              </div>

            </form>
          )}
        </div>

      </div>
    </div>
  );
};
