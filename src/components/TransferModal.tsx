import React, { useState, useEffect } from 'react';
import { X, ArrowRightLeft, Warehouse, Store, CheckCircle2, AlertCircle } from 'lucide-react';
import { useStock } from '../context/StockContext';
import { Product } from '../types';
import { ProductSearchScanner } from './ProductSearchScanner';

interface TransferModalProps {
  isOpen: boolean;
  onClose: () => void;
  preselectedProduct?: Product | null;
}

export const TransferModal: React.FC<TransferModalProps> = ({
  isOpen,
  onClose,
  preselectedProduct,
}) => {
  const { products, transferStock, checkPermission } = useStock();

  const [selectedProductId, setSelectedProductId] = useState<string>('');
  const [quantityInput, setQuantityInput] = useState<string>('5');
  const [notes, setNotes] = useState<string>('Reposição de prateleira / gôndola da loja');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [successMessage, setSuccessMessage] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  useEffect(() => {
    if (preselectedProduct) {
      setSelectedProductId(preselectedProduct.id);
    } else if (products.length > 0 && !selectedProductId) {
      setSelectedProductId(products[0].id);
    }
  }, [preselectedProduct, products]);

  // Reset modal states when opened/closed
  useEffect(() => {
    if (isOpen) {
      setErrorMessage('');
      setSuccessMessage('');
      setQuantityInput('5');
      setIsSubmitting(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  if (!checkPermission('canTransferStock')) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm animate-in fade-in duration-200">
        <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-2xl max-w-md w-full text-center space-y-4">
          <div className="w-12 h-12 bg-rose-100 text-rose-600 rounded-2xl flex items-center justify-center mx-auto">
            <X className="w-6 h-6" />
          </div>
          <h3 className="text-base font-black text-slate-900">Acesso Não Autorizado</h3>
          <p className="text-xs text-slate-600">
            Você não possui permissão para realizar transferências entre o Depósito e a Loja.
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
  const parsedQuantity = Math.max(0, parseFloat(quantityInput) || 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    if (!selectedProductId || !currentProduct) {
      setErrorMessage('Selecione um produto.');
      return;
    }

    if (parsedQuantity <= 0) {
      setErrorMessage('Informe uma quantidade válida maior que zero.');
      return;
    }

    if (currentProduct.stockDeposito < parsedQuantity) {
      setErrorMessage(
        `Saldo insuficiente no Depósito. Saldo disponível: ${currentProduct.stockDeposito} ${currentProduct.unit}.`
      );
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await transferStock(selectedProductId, parsedQuantity, notes);
      if (res && !res.success) {
        setErrorMessage(res.message);
      } else {
        setSuccessMessage(
          res?.message || `Transferência de ${parsedQuantity}x ${currentProduct.name} realizada com sucesso!`
        );
      }
    } catch (err) {
      console.error(err);
      setErrorMessage('Ocorreu um erro ao processar a transferência.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden">
        
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-amber-950 p-5 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-300">
              <ArrowRightLeft className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-black tracking-tight">
                Transferência de Estoque
              </h2>
              <p className="text-xs text-amber-200/80">
                Movimentação interna: Depósito Central ➔ Loja Nova Friburgo
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Success View */}
        {successMessage ? (
          <div className="p-8 text-center space-y-5 animate-in zoom-in-95 duration-200">
            <div className="w-16 h-16 bg-emerald-100 border-2 border-emerald-300 text-emerald-600 rounded-3xl flex items-center justify-center mx-auto shadow-lg shadow-emerald-100">
              <CheckCircle2 className="w-10 h-10" />
            </div>

            <div className="space-y-2">
              <h3 className="text-xl font-black text-slate-900">
                Transferência Concluída!
              </h3>
              <p className="text-xs font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-2xl py-2.5 px-4 inline-block shadow-xs">
                {successMessage}
              </p>
            </div>

            {currentProduct && (
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 text-left text-xs space-y-2">
                <div className="flex justify-between items-center text-slate-600 border-b border-slate-200 pb-2">
                  <span className="font-medium">Produto:</span>
                  <span className="font-bold text-slate-900">{currentProduct.name}</span>
                </div>
                <div className="flex justify-between items-center text-slate-600 border-b border-slate-200 pb-2">
                  <span className="font-medium">Qtd Transferida:</span>
                  <span className="font-black text-amber-600 bg-amber-100 px-2 py-0.5 rounded-lg">
                    {parsedQuantity} {currentProduct.unit}
                  </span>
                </div>
                <div className="flex justify-between items-center text-slate-600">
                  <span className="font-medium">Novo Saldo Loja:</span>
                  <span className="font-bold text-emerald-700">{currentProduct.stockLoja} {currentProduct.unit}</span>
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={onClose}
              className="w-full py-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black text-xs rounded-xl shadow-lg transition-all cursor-pointer"
            >
              Concluir e Fechar
            </button>
          </div>
        ) : (

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          
          {/* Error Banner */}
          {errorMessage && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs font-semibold text-rose-700 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Product Scanner & Search */}
          <ProductSearchScanner
            products={products}
            selectedProductId={selectedProductId}
            onSelectProduct={(prod) => setSelectedProductId(prod.id)}
            label="Localizar Produto p/ Transferência (GTIN/Câmera, SKU ou Nome) *"
            placeholder="Escaneie GTIN/EAN com câmera ou busque por nome..."
          />

          {/* Current Stock Balance Visual Cards */}
          {currentProduct && (
            <div className="grid grid-cols-2 gap-3 p-3 bg-slate-50 rounded-2xl border border-slate-200">
              <div className="p-2.5 bg-sky-50 border border-sky-200 rounded-xl">
                <p className="text-[10px] font-bold text-sky-800 uppercase flex items-center gap-1">
                  <Warehouse className="w-3.5 h-3.5" /> Saldo no Depósito
                </p>
                <p className="text-xl font-black text-sky-900 mt-1">
                  {currentProduct.stockDeposito}{' '}
                  <span className="text-xs font-medium text-sky-700">un</span>
                </p>
              </div>

              <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-xl">
                <p className="text-[10px] font-bold text-amber-800 uppercase flex items-center gap-1">
                  <Store className="w-3.5 h-3.5" /> Saldo na Loja
                </p>
                <p className="text-xl font-black text-amber-900 mt-1">
                  {currentProduct.stockLoja}{' '}
                  <span className="text-xs font-medium text-amber-700">un</span>
                </p>
              </div>
            </div>
          )}

          {/* Quantity Input */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Quantidade a Transferir *
            </label>
            <input
              type="number"
              min="1"
              max={currentProduct?.stockDeposito || 999}
              value={quantityInput}
              onChange={(e) => {
                const val = e.target.value;
                // Avoid leading zeros when typing, e.g. "05" -> "5"
                if (val.length > 1 && val.startsWith('0') && !val.startsWith('0.')) {
                  setQuantityInput(val.replace(/^0+/, ''));
                } else {
                  setQuantityInput(val);
                }
              }}
              onFocus={(e) => e.target.select()}
              placeholder="Digite a quantidade"
              className="w-full text-base font-extrabold text-slate-900 p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
            />
            {currentProduct && (
              <p className="text-[11px] text-slate-500 mt-1">
                Novo Saldo do Depósito será:{' '}
                <b>{Math.max(0, currentProduct.stockDeposito - parsedQuantity)}</b> • Novo Saldo da
                Loja será: <b>{currentProduct.stockLoja + parsedQuantity}</b>
              </p>
            )}
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Observações / Finalidade
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ex: Reabastecimento para fim de semana"
              className="w-full text-xs p-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
            />
          </div>

          {/* Footer Buttons */}
          <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-semibold cursor-pointer disabled:opacity-50"
            >
              Cancelar
            </button>

            <button
              type="submit"
              disabled={isSubmitting || !currentProduct || currentProduct.stockDeposito < parsedQuantity || parsedQuantity <= 0}
              className="flex items-center gap-2 bg-gradient-to-r from-amber-600 to-rose-600 hover:from-amber-500 hover:to-rose-500 disabled:opacity-40 text-white font-bold px-5 py-2.5 rounded-xl text-xs shadow-md transition-all cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{isSubmitting ? 'Transferindo...' : 'Confirmar Transferência'}</span>
            </button>
          </div>

        </form>
        )}

      </div>
    </div>
  );
};
