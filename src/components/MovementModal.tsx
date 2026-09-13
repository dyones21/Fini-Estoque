import React, { useState, useEffect } from 'react';
import { X, MinusCircle, ShoppingBag, AlertOctagon, RefreshCw } from 'lucide-react';
import { useStock } from '../context/StockContext';
import { Product, StockMovement } from '../types';
import { ProductSearchScanner } from './ProductSearchScanner';
import { parseNumber } from '../utils/inventoryUtils';
import { getFriendlyErrorMessage } from '../utils/errorHandler';

interface MovementModalProps {
  isOpen: boolean;
  onClose: () => void;
  preselectedProduct?: Product | null;
}

export const MovementModal: React.FC<MovementModalProps> = ({
  isOpen,
  onClose,
  preselectedProduct,
}) => {
  const { products, registerMovement, checkPermission } = useStock();

  const [selectedProductId, setSelectedProductId] = useState<string>('');
  const [type, setType] = useState<StockMovement['type']>('venda_loja');
  const [location, setLocation] = useState<'loja' | 'deposito'>('loja');
  const [quantity, setQuantity] = useState<string | number>(1);
  const [reason, setReason] = useState<string>('');

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
            Você não possui permissão para registrar movimentações ou ajustes de estoque.
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const qty = parseNumber(quantity, 1);
    if (!selectedProductId || !currentProduct || qty <= 0) return;

    if (type === 'venda_loja' && currentProduct.stockLoja < qty) {
      alert(`Operação rejeitada: A quantidade solicitada (${qty}) é maior que o estoque disponível na loja (${currentProduct.stockLoja} un).`);
      return;
    }

    try {
      await registerMovement(
        selectedProductId,
        type,
        qty,
        location,
        reason || (type === 'venda_loja' ? 'Baixa para Baleiro / Pacote Aberto' : 'Baixa registrada'),
        type === 'venda_loja' ? currentProduct.sellPrice : currentProduct.costPrice
      );

      alert(`Movimentação registrada com sucesso para "${currentProduct.name}"!`);
      onClose();
    } catch (err: any) {
      alert(getFriendlyErrorMessage(err, 'Falha ao registrar movimentação no servidor.'));
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden">
        
        {/* Header */}
        <div className="bg-linear-to-r from-slate-900 to-slate-800 p-5 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-slate-700 text-amber-400">
              <MinusCircle className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-black tracking-tight">
                Registrar Saída ou Baixa
              </h2>
              <p className="text-xs text-slate-300">
                Baixas por Venda, Validade Vencida, Avaria ou Ajuste
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          
          {/* Movement Type Radio Cards */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-2">
              Tipo de Movimentação *
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => {
                  setType('venda_loja');
                  setLocation('loja');
                }}
                className={`p-3 rounded-xl border text-left transition-all ${
                  type === 'venda_loja'
                    ? 'bg-emerald-50 border-emerald-300 text-emerald-900 font-bold ring-2 ring-emerald-500/20'
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <ShoppingBag className="w-4 h-4 text-emerald-600 mb-1" />
                <p className="text-xs">Baixa Baleiro</p>
              </button>

              <button
                type="button"
                onClick={() => setType('perda_avaria')}
                className={`p-3 rounded-xl border text-left transition-all ${
                  type === 'perda_avaria'
                    ? 'bg-rose-50 border-rose-300 text-rose-900 font-bold ring-2 ring-rose-500/20'
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <AlertOctagon className="w-4 h-4 text-rose-600 mb-1" />
                <p className="text-xs">Perda / Avaria</p>
              </button>

              <button
                type="button"
                onClick={() => setType('ajuste_inventario')}
                className={`p-3 rounded-xl border text-left transition-all ${
                  type === 'ajuste_inventario'
                    ? 'bg-amber-50 border-amber-300 text-amber-900 font-bold ring-2 ring-amber-500/20'
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <RefreshCw className="w-4 h-4 text-amber-600 mb-1" />
                <p className="text-xs">Ajuste Balanço</p>
              </button>
            </div>
          </div>

          {/* Product Scanner & Search */}
          <ProductSearchScanner
            products={products}
            selectedProductId={selectedProductId}
            onSelectProduct={(prod) => setSelectedProductId(prod.id)}
            label="Localizar Produto (GTIN/Câmera, SKU ou Nome) *"
            placeholder="Escaneie GTIN/EAN com câmera ou busque por nome..."
          />

          {/* Location Select */}
          {type !== 'venda_loja' && (
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Origem da Baixa
              </label>
              <select
                value={location}
                onChange={(e) => setLocation(e.target.value as 'loja' | 'deposito')}
                className="w-full text-xs p-2.5 rounded-xl border border-slate-200 bg-white"
              >
                <option value="loja">Estoque da Loja</option>
                <option value="deposito">Estoque do Depósito</option>
              </select>
            </div>
          )}

          {/* Quantity */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Quantidade *
            </label>
            <input
              type="text"
              inputMode="numeric"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              onFocus={(e) => e.target.select()}
              className="w-full text-base font-extrabold text-slate-900 p-2.5 rounded-xl border border-slate-200"
            />
          </div>

          {/* Reason */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Motivo / Justificativa
            </label>
            <input
              type="text"
              placeholder="Ex: Embalagem danificada, vencimento ou cupom de venda"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full text-xs p-2.5 rounded-xl border border-slate-200"
            />
          </div>

          {/* Footer */}
          <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-semibold"
            >
              Cancelar
            </button>

            <button
              type="submit"
              className="bg-slate-900 hover:bg-slate-800 text-white font-bold px-5 py-2.5 rounded-xl text-xs shadow-md"
            >
              Confirmar Baixa
            </button>
          </div>

        </form>

      </div>
    </div>
  );
};
