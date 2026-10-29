import React, { useState, useEffect } from 'react';
import { X, ShoppingBag, Check, Plus, Minus, Tag, Store, ArrowLeft, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { useStock } from '../context/StockContext';
import { Product } from '../types';
import { formatCurrency, parseNumber } from '../utils/inventoryUtils';
import { getFriendlyErrorMessage } from '../utils/errorHandler';
import { ProductSearchScanner } from './ProductSearchScanner';
import { DismissibleInfoCard } from './DismissibleInfoCard';

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

  useEffect(() => {
    if (isOpen) {
      window.scrollTo({ top: 0, behavior: 'instant' });
    }
  }, [isOpen]);

  const qtyNumber = parseNumber(quantity, 1);
  const totalSaleValue = currentProduct ? qtyNumber * currentProduct.sellPrice : 0;

  return (
    <div className="w-full max-w-4xl mx-auto space-y-6 animate-in fade-in duration-200">
      {/* Navigation & Title Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-5 rounded-3xl border border-slate-200 shadow-xs">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onClose}
            className="p-2.5 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors flex items-center justify-center shrink-0"
            title="Voltar para a lista"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-black text-slate-900 tracking-tight">
                Baixa para Baleiro (Venda Loja)
              </h1>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-800">
                Operacional Loja
              </span>
            </div>
            <p className="text-xs text-slate-500 font-medium">
              Saída de pacotes fechados do estoque para abertura e exposição no balcão
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-bold transition-colors"
          >
            Cancelar e Voltar
          </button>
          {!successMessage && (
            <button
              type="submit"
              form="sale-dedicated-form"
              className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-5 py-2.5 rounded-xl shadow-xs transition-colors"
            >
              <ShoppingBag className="w-4 h-4" />
              <span>Confirmar Baixa</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Dedicated Card */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-xs p-6 sm:p-8 space-y-6">
        {/* Notice Alert Box (Dismissible on first access) */}
        <DismissibleInfoCard
          storageKey="dismissed_info_storesale_baleiro_rule"
          className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-xs text-amber-900 font-semibold"
        >
          <div className="flex items-center gap-3">
            <Tag className="w-4 h-4 text-amber-600 shrink-0" />
            <span>
              <strong>Nota de Regra:</strong> Pacotes abertos expostos no baleiro <u>não contam</u> no saldo de estoque fechado do sistema.
            </span>
          </div>
        </DismissibleInfoCard>

        {/* Success Alert */}
        {successMessage ? (
          <div className="p-8 text-center space-y-4">
            <div className="w-14 h-14 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
              <Check className="w-7 h-7" />
            </div>
            <h3 className="text-base font-black text-slate-900">Baixa Registrada com Sucesso!</h3>
            <p className="text-xs font-bold text-slate-600">{successMessage}</p>
            <div className="pt-4 flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => {
                  setSuccessMessage('');
                  setQuantity(1);
                }}
                className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 font-bold text-xs hover:bg-slate-50 transition-colors"
              >
                Registrar Outra Baixa
              </button>
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2.5 rounded-xl bg-slate-900 text-white font-bold text-xs hover:bg-slate-800 transition-colors"
              >
                Voltar ao Estoque
              </button>
            </div>
          </div>
        ) : (
          <form id="sale-dedicated-form" onSubmit={handleSubmit} className="space-y-6">
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
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                    Disponível na Loja Friburgo
                  </span>
                  <div className="flex items-center gap-2 mt-1">
                    <Store className="w-4 h-4 text-amber-500 shrink-0" />
                    <span className="text-xl font-black text-slate-900">
                      {currentProduct.stockLoja} <span className="text-xs font-semibold text-slate-500">{currentProduct.unit}</span>
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    SKU: {currentProduct.sku} • Preço de Venda: <span className="font-bold text-emerald-700">{formatCurrency(currentProduct.sellPrice)}</span>
                  </p>
                </div>

                <div className="border-t sm:border-t-0 sm:border-l border-slate-200 pt-3 sm:pt-0 sm:pl-6 text-left sm:text-right">
                  <span className="text-[10px] font-bold text-slate-400 uppercase block">
                    No Depósito Central
                  </span>
                  <span className="text-sm font-bold text-sky-800">
                    {currentProduct.stockDeposito} un
                  </span>
                </div>
              </div>
            )}

            {/* Quantity Input + Quick Chips */}
            <div className="space-y-2">
              <label className="block text-xs font-bold text-slate-700">
                Quantidade de Pacotes Fechados a Baixar *
              </label>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => handleQuickAdd(-1)}
                  className="p-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold transition-colors shrink-0"
                >
                  <Minus className="w-5 h-5" />
                </button>

                <input
                  type="text"
                  inputMode="numeric"
                  required
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  onFocus={(e) => e.target.select()}
                  className="flex-1 text-center text-2xl font-black text-slate-900 p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-500/20"
                />

                <button
                  type="button"
                  onClick={() => handleQuickAdd(1)}
                  className="p-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold transition-colors shrink-0"
                >
                  <Plus className="w-5 h-5" />
                </button>
              </div>

              {/* Quick increment presets */}
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <span className="text-xs text-slate-400 font-bold uppercase mr-1">Atalhos rápidos:</span>
                {[1, 2, 5, 10, 20].map((amt) => (
                  <button
                    key={amt}
                    type="button"
                    onClick={() => setQuantity(amt)}
                    className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-colors"
                  >
                    +{amt}
                  </button>
                ))}
              </div>
            </div>

            {/* Total Sale Revenue Preview */}
            <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-200 flex items-center justify-between">
              <div className="flex items-center gap-2 text-emerald-800">
                <Tag className="w-4 h-4 text-emerald-600 shrink-0" />
                <span className="text-xs font-bold">Valor Potencial das Unidades:</span>
              </div>
              <span className="text-xl font-black text-emerald-700">
                {formatCurrency(totalSaleValue)}
              </span>
            </div>

            {/* Reason or Note */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Motivo / Detalhes da Abertura de Pacote
              </label>
              <input
                type="text"
                placeholder="Ex: Baixa para baleiro, degustação, reposição de balcão"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="w-full text-xs p-3 rounded-xl border border-slate-200 font-medium"
              />
            </div>

            {/* Footer Actions */}
            <div className="pt-4 border-t border-slate-100 flex flex-col-reverse sm:flex-row items-center justify-between gap-3">
              <button
                type="button"
                onClick={onClose}
                className="w-full sm:w-auto px-5 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-100 text-xs font-bold transition-colors"
              >
                Cancelar e Voltar
              </button>

              <button
                type="submit"
                className="w-full sm:w-auto flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-6 py-2.5 rounded-xl shadow-xs transition-colors"
              >
                <ShoppingBag className="w-4 h-4" />
                <span>Confirmar Baixa p/ Baleiro</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
