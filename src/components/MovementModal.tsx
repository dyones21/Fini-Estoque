import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  MinusCircle,
  ShoppingBag,
  AlertOctagon,
  RefreshCw,
  Plus,
  Minus,
  CheckCircle2,
} from 'lucide-react';
import { useStock } from '../context/StockContext';
import { Product, StockMovement, LossCategory } from '../types';
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
  const [lossCategory, setLossCategory] = useState<LossCategory>('Vencimento');
  const [reason, setReason] = useState<string>('');

  // Ajuste de inventário: Modos "Definir novo saldo" e "Adicionar/Remover quantidade (+/-)"
  const [adjustmentMode, setAdjustmentMode] = useState<'set_balance' | 'delta'>('set_balance');
  const [newBalanceInput, setNewBalanceInput] = useState<string>('0');
  const [deltaInput, setDeltaInput] = useState<string>('+0');

  useEffect(() => {
    if (preselectedProduct) {
      setSelectedProductId(preselectedProduct.id);
    } else if (products.length > 0 && !selectedProductId) {
      setSelectedProductId(products[0].id);
    }
  }, [preselectedProduct, products]);

  const currentProduct = products.find((p) => p.id === selectedProductId);

  // Saldo atual no local selecionado
  const currentStock = currentProduct
    ? location === 'deposito'
      ? currentProduct.stockDeposito
      : currentProduct.stockLoja
    : 0;

  // Quando o produto ou a localização mudam, sincroniza os campos de ajuste
  useEffect(() => {
    if (currentProduct) {
      const stock = location === 'deposito' ? currentProduct.stockDeposito : currentProduct.stockLoja;
      setNewBalanceInput(String(stock));
      setDeltaInput('+0');
    }
  }, [currentProduct?.id, location]);

  // Função auxiliar para parsing seguro de deltas com sinais (+/-)
  const parseDelta = (val: string): number => {
    const trimmed = String(val || '').trim();
    if (!trimmed || trimmed === '+' || trimmed === '-') return 0;
    const clean = trimmed.replace(',', '.');
    const num = parseFloat(clean);
    return isNaN(num) ? 0 : Math.round(num);
  };

  // Cálculo reativo do saldo final e da diferença apurada
  const { calculatedBalance, calculatedDiff } = useMemo(() => {
    if (type !== 'ajuste_inventario') {
      const q = parseNumber(quantity, 1);
      return { calculatedBalance: q, calculatedDiff: 0 };
    }

    if (adjustmentMode === 'set_balance') {
      const target = Math.round(parseNumber(newBalanceInput, 0));
      return {
        calculatedBalance: target,
        calculatedDiff: target - currentStock,
      };
    } else {
      const delta = parseDelta(deltaInput);
      return {
        calculatedBalance: currentStock + delta,
        calculatedDiff: delta,
      };
    }
  }, [type, adjustmentMode, newBalanceInput, deltaInput, currentStock, quantity]);

  // Alternância inteligente entre os modos mantendo o valor sincronizado
  const handleSwitchToDelta = () => {
    setAdjustmentMode('delta');
    const d = calculatedDiff;
    setDeltaInput(d >= 0 ? `+${d}` : `${d}`);
  };

  const handleSwitchToSetBalance = () => {
    setAdjustmentMode('set_balance');
    setNewBalanceInput(String(calculatedBalance));
  };

  // Atalhos rápidos para somar/subtrair no modo delta (+/-)
  const applyDeltaStep = (step: number) => {
    const currentVal = parseDelta(deltaInput);
    const nextVal = currentVal + step;
    setDeltaInput(nextVal >= 0 ? `+${nextVal}` : `${nextVal}`);
  };

  const isNegativeAdjustment = type === 'ajuste_inventario' && calculatedBalance < 0;

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProductId || !currentProduct) return;

    const unitName = currentProduct.unit || 'un';

    // 1. Validação específica para Ajuste de Inventário
    if (type === 'ajuste_inventario') {
      if (calculatedBalance < 0) {
        alert(
          `Operação rejeitada: O ajuste resultaria em saldo negativo (${calculatedBalance} ${unitName}). O estoque não pode ficar menor que zero.`
        );
        return;
      }

      const trimmedReason = reason.trim();
      if (!trimmedReason) {
        alert('O motivo/justificativa é obrigatório para registrar um ajuste de inventário.');
        return;
      }

      const diffStr = calculatedDiff >= 0 ? `+${calculatedDiff}` : `${calculatedDiff}`;
      const finalReason = trimmedReason;

      try {
        await registerMovement(
          selectedProductId,
          type,
          calculatedBalance,
          location,
          finalReason,
          currentProduct.costPrice
        );

        alert(
          `Ajuste de inventário registrado com sucesso para "${currentProduct.name}"!\n` +
            `Diferença: ${diffStr} ${unitName} (de ${currentStock} para ${calculatedBalance} ${unitName}).`
        );
        onClose();
      } catch (err: any) {
        alert(getFriendlyErrorMessage(err, 'Falha ao registrar ajuste de inventário no servidor.'));
      }
      return;
    }

    // 2. Fluxo para Venda Loja e Perda/Avaria
    const qty = parseNumber(quantity, 1);
    if (qty <= 0) {
      alert('A quantidade informada deve ser maior que zero.');
      return;
    }

    if (type === 'venda_loja' && currentProduct.stockLoja < qty) {
      alert(
        `Operação rejeitada: A quantidade solicitada (${qty}) é maior que o estoque disponível na loja (${currentProduct.stockLoja} ${unitName}).`
      );
      return;
    }

    // Validação estrita de motivo para perda/avaria
    const trimmedReason = reason.trim();
    if (type === 'perda_avaria' && lossCategory === 'Outro' && !trimmedReason) {
      alert('Para o motivo "Outro", é obrigatório especificar a justificativa no campo de texto.');
      return;
    }

    let finalReason = trimmedReason;
    if (type === 'perda_avaria') {
      finalReason = trimmedReason ? `${lossCategory}: ${trimmedReason}` : `Perda por ${lossCategory}`;
    } else if (type === 'venda_loja') {
      finalReason = trimmedReason || 'Baixa para Baleiro / Pacote Aberto';
    }

    try {
      await registerMovement(
        selectedProductId,
        type,
        qty,
        location,
        finalReason,
        type === 'venda_loja' ? currentProduct.sellPrice : currentProduct.costPrice,
        type === 'perda_avaria' ? lossCategory : undefined
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
                Baixas por Saída p/ Baleiro, Validade Vencida, Avaria ou Ajuste
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
                <p className="text-xs">Saída Baleiro</p>
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
                {type === 'ajuste_inventario' ? 'Local do Estoque para Ajuste *' : 'Origem da Baixa *'}
              </label>
              <select
                value={location}
                onChange={(e) => setLocation(e.target.value as 'loja' | 'deposito')}
                className="w-full text-xs p-2.5 rounded-xl border border-slate-200 bg-white font-semibold"
              >
                <option value="loja">Estoque da Loja (Nova Friburgo)</option>
                <option value="deposito">Estoque do Depósito Central</option>
              </select>
            </div>
          )}

          {/* Structured Loss Category for perda_avaria */}
          {type === 'perda_avaria' && (
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Motivo da Perda / Avaria *
              </label>
              <select
                value={lossCategory}
                onChange={(e) => setLossCategory(e.target.value as LossCategory)}
                className="w-full text-xs p-2.5 rounded-xl border border-rose-300 bg-rose-50/50 font-semibold text-rose-900 focus:outline-none focus:ring-2 focus:ring-rose-500/30"
              >
                <option value="Vencimento">Vencimento (Data de validade expirada)</option>
                <option value="Quebra/Avaria">Quebra / Avaria (Embalagem rasgada/danificada)</option>
                <option value="Furto/Extravio">Furto / Extravio</option>
                <option value="Outro">Outro (especifique no campo abaixo)</option>
              </select>
            </div>
          )}

          {/* AJUSTE DE INVENTÁRIO: Controles Especializados (Novo Saldo vs Diferença +/-) */}
          {type === 'ajuste_inventario' ? (
            <div className="space-y-3 bg-slate-50/70 p-3.5 rounded-2xl border border-slate-200">
              
              {/* Saldo Atual no local */}
              <div className="bg-white border border-slate-200 rounded-xl p-2.5 flex items-center justify-between text-xs shadow-2xs">
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase block">Saldo Atual no Sistema</span>
                  <span className="font-bold text-slate-800">
                    {location === 'deposito' ? 'Depósito Central' : 'Estoque da Loja'}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-sm font-black text-slate-900">
                    {currentStock} {currentProduct?.unit || 'un'}
                  </span>
                </div>
              </div>

              {/* Seletor de Modo de Ajuste */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Forma de Informar o Ajuste *
                </label>
                <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-200/70 rounded-xl border border-slate-200 text-xs">
                  <button
                    type="button"
                    onClick={handleSwitchToSetBalance}
                    className={`py-2 px-3 rounded-lg font-extrabold transition-all cursor-pointer ${
                      adjustmentMode === 'set_balance'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Definir novo saldo
                  </button>
                  <button
                    type="button"
                    onClick={handleSwitchToDelta}
                    className={`py-2 px-3 rounded-lg font-extrabold transition-all cursor-pointer ${
                      adjustmentMode === 'delta'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Adicionar/Remover (+/-)
                  </button>
                </div>
              </div>

              {/* Modo 1: Definir Novo Saldo Total */}
              {adjustmentMode === 'set_balance' ? (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-bold text-slate-700">
                      Novo Saldo Apurado na Contagem Física *
                    </label>
                    <span className="text-[10px] text-slate-500 font-semibold">Valor final</span>
                  </div>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={newBalanceInput}
                    onChange={(e) => setNewBalanceInput(e.target.value)}
                    onFocus={(e) => e.target.select()}
                    placeholder={`Ex: ${currentStock}`}
                    className="w-full text-base font-extrabold text-slate-900 p-2.5 rounded-xl border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/30"
                  />
                  <p className="text-[11px] text-slate-500 mt-1">
                    Digite a quantidade total contada fisicamente na prateleira/depósito.
                  </p>
                </div>
              ) : (
                /* Modo 2: Adicionar ou Remover Quantidade (+/-) */
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-bold text-slate-700">
                      Diferença (+ para adicionar, - para remover) *
                    </label>
                    <span className="text-[10px] text-slate-500 font-semibold">Com sinal +/-</span>
                  </div>
                  <input
                    type="text"
                    value={deltaInput}
                    onChange={(e) => setDeltaInput(e.target.value)}
                    onFocus={(e) => e.target.select()}
                    placeholder="Ex: +2 ou -3"
                    className="w-full text-base font-mono font-extrabold text-slate-900 p-2.5 rounded-xl border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/30"
                  />
                  <div className="flex flex-wrap items-center gap-1.5 mt-2">
                    <span className="text-[10px] font-bold text-slate-400 uppercase mr-0.5">Atalhos:</span>
                    <button
                      type="button"
                      onClick={() => applyDeltaStep(-5)}
                      className="px-2.5 py-1 text-xs font-mono font-bold rounded-lg bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 cursor-pointer"
                    >
                      -5
                    </button>
                    <button
                      type="button"
                      onClick={() => applyDeltaStep(-1)}
                      className="px-2.5 py-1 text-xs font-mono font-bold rounded-lg bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 cursor-pointer"
                    >
                      -1
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeltaInput('+0')}
                      className="px-2.5 py-1 text-xs font-mono font-bold rounded-lg bg-slate-100 text-slate-700 border border-slate-200 hover:bg-slate-200 cursor-pointer"
                    >
                      0
                    </button>
                    <button
                      type="button"
                      onClick={() => applyDeltaStep(+1)}
                      className="px-2.5 py-1 text-xs font-mono font-bold rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 cursor-pointer"
                    >
                      +1
                    </button>
                    <button
                      type="button"
                      onClick={() => applyDeltaStep(+5)}
                      className="px-2.5 py-1 text-xs font-mono font-bold rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 cursor-pointer"
                    >
                      +5
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Use valores positivos para sobras (ex: +2) ou negativos para faltas (ex: -3).
                  </p>
                </div>
              )}

              {/* Resumo Claro do Ajuste antes de confirmar */}
              <div
                className={`p-3 rounded-xl border transition-all ${
                  isNegativeAdjustment
                    ? 'bg-rose-50 border-rose-300 text-rose-950'
                    : calculatedDiff > 0
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-950'
                    : calculatedDiff < 0
                    ? 'bg-amber-50 border-amber-200 text-amber-950'
                    : 'bg-white border-slate-200 text-slate-700'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-0.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                      Resumo do Ajuste
                    </span>
                    <div className="font-extrabold text-sm flex flex-wrap items-center gap-1.5">
                      {calculatedDiff > 0 ? (
                        <span className="text-emerald-700 font-black">
                          Ajuste: +{calculatedDiff} {currentProduct?.unit || 'un'}
                        </span>
                      ) : calculatedDiff < 0 ? (
                        <span className="text-rose-700 font-black">
                          Ajuste: {calculatedDiff} {currentProduct?.unit || 'un'}
                        </span>
                      ) : (
                        <span className="text-slate-700 font-black">
                          Ajuste: 0 {currentProduct?.unit || 'un'}
                        </span>
                      )}
                      <span className="text-xs font-semibold text-slate-500">
                        {calculatedDiff === 0
                          ? `(mantém ${currentStock})`
                          : `(de ${currentStock} para ${calculatedBalance})`}
                      </span>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <span className="text-[10px] font-bold text-slate-500 uppercase block">Novo Saldo Final</span>
                    <span
                      className={`text-base font-black ${
                        isNegativeAdjustment ? 'text-rose-600' : 'text-slate-900'
                      }`}
                    >
                      {calculatedBalance} {currentProduct?.unit || 'un'}
                    </span>
                  </div>
                </div>

                {isNegativeAdjustment && (
                  <div className="mt-2.5 pt-2 border-t border-rose-200 flex items-center gap-2 text-rose-700 text-xs font-bold">
                    <AlertOctagon className="w-4 h-4 text-rose-600 shrink-0" />
                    <span>
                      Não é permitido saldo negativo. O ajuste deixaria o saldo em {calculatedBalance} {currentProduct?.unit || 'un'}.
                    </span>
                  </div>
                )}
              </div>

            </div>
          ) : (
            /* Campo de Quantidade Padrão para Saída Baleiro e Perda/Avaria */
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
          )}

          {/* Reason / Justification */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              {type === 'ajuste_inventario' ? (
                <span>Motivo / Justificativa do Ajuste <span className="text-rose-600">*</span></span>
              ) : type === 'perda_avaria' ? (
                <span>
                  Complemento do Motivo {lossCategory === 'Outro' ? <span className="text-rose-600">* (obrigatório)</span> : <span className="text-slate-400 font-normal">(opcional)</span>}
                </span>
              ) : (
                <span>Observação <span className="text-slate-400 font-normal">(opcional)</span></span>
              )}
            </label>
            <input
              type="text"
              placeholder={
                type === 'ajuste_inventario'
                  ? 'Ex: Contagem física periódica acusou diferença de saldo (obrigatório)'
                  : type === 'perda_avaria'
                  ? (lossCategory === 'Outro' ? 'Especifique o motivo detalhado (obrigatório)' : 'Ex: Embalagem furada na caixa do fornecedor...')
                  : 'Ex: Baixa para reposição de baleiro'
              }
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className={`w-full text-xs p-2.5 rounded-xl border ${
                (type === 'ajuste_inventario' || (type === 'perda_avaria' && lossCategory === 'Outro')) && !reason.trim()
                  ? 'border-amber-300 bg-amber-50/20'
                  : 'border-slate-200'
              }`}
              required={type === 'ajuste_inventario' || (type === 'perda_avaria' && lossCategory === 'Outro')}
            />
          </div>

          {/* Footer */}
          <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-semibold cursor-pointer"
            >
              Cancelar
            </button>

            <button
              type="submit"
              disabled={isNegativeAdjustment}
              className={`font-bold px-5 py-2.5 rounded-xl text-xs shadow-md transition-all ${
                isNegativeAdjustment
                  ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
                  : 'bg-slate-900 hover:bg-slate-800 text-white cursor-pointer'
              }`}
            >
              {type === 'ajuste_inventario'
                ? `Confirmar Ajuste (${calculatedDiff >= 0 ? '+' : ''}${calculatedDiff})`
                : 'Confirmar Baixa'}
            </button>
          </div>

        </form>

      </div>
    </div>
  );
};
