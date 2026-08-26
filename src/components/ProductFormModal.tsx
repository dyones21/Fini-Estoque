import React, { useState, useEffect } from 'react';
import { X, Package, Save, FolderPlus, Check, Plus, AlertCircle, Loader2 } from 'lucide-react';
import { useStock } from '../context/StockContext';
import { Product, ProductCategory } from '../types';
import { parseNumber } from '../utils/inventoryUtils';

interface ProductFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  editingProduct?: Product | null;
}

export const ProductFormModal: React.FC<ProductFormModalProps> = ({
  isOpen,
  onClose,
  editingProduct,
}) => {
  const { addProduct, updateProduct, checkPermission, categories, addCategory } = useStock();

  const [sku, setSku] = useState('');
  const [ean, setEan] = useState('');
  const [name, setName] = useState('');
  const [category, setCategory] = useState<ProductCategory>('Balas de Gelatina');
  const [unit, setUnit] = useState<Product['unit']>('Pacote 500g');
  const [stockDeposito, setStockDeposito] = useState<string | number>(0);
  const [stockLoja, setStockLoja] = useState<string | number>(0);
  const [minStockDeposito, setMinStockDeposito] = useState<string | number>(15);
  const [minStockLoja, setMinStockLoja] = useState<string | number>(5);
  const [costPrice, setCostPrice] = useState<string | number>('12,50');
  const [sellPrice, setSellPrice] = useState<string | number>('24,90');
  const [expirationDate, setExpirationDate] = useState('2027-06-30');
  const [batchNumber, setBatchNumber] = useState('LOTE-2026-F1');

  // Loading & Error states
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Quick category creation local state
  const [isCreatingCategory, setIsCreatingCategory] = useState(false);
  const [newCategoryInput, setNewCategoryInput] = useState('');

  const handleQuickAddCategory = () => {
    const trimmed = newCategoryInput.trim();
    if (!trimmed) return;
    addCategory(trimmed);
    setCategory(trimmed);
    setNewCategoryInput('');
    setIsCreatingCategory(false);
  };

  useEffect(() => {
    setFormError(null);
    setIsSubmitting(false);
    if (editingProduct) {
      setSku(editingProduct.sku);
      setEan(editingProduct.ean);
      setName(editingProduct.name);
      setCategory(editingProduct.category);
      setUnit(editingProduct.unit);
      setStockDeposito(editingProduct.stockDeposito);
      setStockLoja(editingProduct.stockLoja);
      setMinStockDeposito(editingProduct.minStockDeposito);
      setMinStockLoja(editingProduct.minStockLoja);
      setCostPrice(editingProduct.costPrice);
      setSellPrice(editingProduct.sellPrice);
      setExpirationDate(editingProduct.expirationDate);
      setBatchNumber(editingProduct.batchNumber);
    } else {
      setSku(`FINI-0${Math.floor(Math.random() * 80 + 20)}`);
      setEan(`789859145${Math.floor(Math.random() * 8000 + 1000)}`);
      setName('');
      setCategory('Balas de Gelatina');
      setUnit('Pacote 500g');
      setStockDeposito(0);
      setStockLoja(0);
      setMinStockDeposito(15);
      setMinStockLoja(5);
      setCostPrice(12.5);
      setSellPrice(24.9);
      setExpirationDate('2027-06-30');
      setBatchNumber(`LOTE-${new Date().getFullYear()}-A1`);
    }
  }, [editingProduct, isOpen]);

  if (!isOpen) return null;

  if (!checkPermission('canManageProducts')) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm animate-in fade-in duration-200">
        <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-2xl max-w-md w-full text-center space-y-4">
          <div className="w-12 h-12 bg-rose-100 text-rose-600 rounded-2xl flex items-center justify-center mx-auto">
            <X className="w-6 h-6" />
          </div>
          <h3 className="text-base font-black text-slate-900">Acesso Não Autorizado</h3>
          <p className="text-xs text-slate-600">
            Você não possui permissão para cadastrar ou editar produtos.
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
    setFormError(null);

    if (!name.trim()) {
      setFormError('Informe o Nome do Produto.');
      return;
    }

    setIsSubmitting(true);

    try {
      if (editingProduct) {
        await updateProduct(editingProduct.id, {
          sku,
          ean,
          name,
          category,
          unit,
          stockDeposito: parseNumber(stockDeposito),
          stockLoja: parseNumber(stockLoja),
          minStockDeposito: parseNumber(minStockDeposito),
          minStockLoja: parseNumber(minStockLoja),
          costPrice: parseNumber(costPrice),
          sellPrice: parseNumber(sellPrice),
          expirationDate,
          batchNumber,
        });
        alert(`Produto "${name}" atualizado com sucesso no banco de dados!`);
      } else {
        await addProduct({
          sku,
          ean,
          name,
          category,
          unit,
          stockDeposito: parseNumber(stockDeposito),
          stockLoja: parseNumber(stockLoja),
          minStockDeposito: parseNumber(minStockDeposito),
          minStockLoja: parseNumber(minStockLoja),
          costPrice: parseNumber(costPrice),
          sellPrice: parseNumber(sellPrice),
          expirationDate,
          batchNumber,
        });
        alert(`Novo produto "${name}" cadastrado e salvo com sucesso no banco de dados!`);
      }
      onClose();
    } catch (err: any) {
      console.error('Falha ao salvar produto:', err);
      const msg = err?.message || 'Erro inesperado ao salvar produto no banco de dados.';
      setFormError(msg);
      alert(`Falha ao salvar produto:\n\n${msg}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl max-w-2xl w-full shadow-2xl border border-slate-200 overflow-hidden my-8">
        
        {/* Header */}
        <div className="bg-slate-900 p-5 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-rose-600 text-white">
              <Package className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-black tracking-tight">
                {editingProduct ? 'Editar Produto' : 'Cadastrar Novo Produto'}
              </h2>
              <p className="text-xs text-slate-400">
                Ajuste de metadados, valores de custo/venda e limites mínimos de estoque
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

        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
          {formError && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2.5 text-rose-700 text-xs animate-in fade-in">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <div className="flex-1">
                <span className="font-bold">Erro ao salvar no banco de dados:</span>
                <p className="mt-0.5 break-words">{formError}</p>
              </div>
            </div>
          )}
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Nome do Produto *
              </label>
              <input
                type="text"
                required
                placeholder="Ex: Dentaduras 500g"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full text-xs p-2.5 rounded-xl border border-slate-200 font-bold focus:ring-2 focus:ring-rose-500/20"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-bold text-slate-700">
                  Categoria
                </label>
                {!isCreatingCategory ? (
                  <button
                    type="button"
                    onClick={() => setIsCreatingCategory(true)}
                    className="text-[11px] font-bold text-rose-600 hover:text-rose-700 flex items-center gap-1 hover:underline"
                    title="Cadastrar uma nova categoria rápida"
                  >
                    <FolderPlus className="w-3.5 h-3.5" />
                    + Nova Categoria
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setIsCreatingCategory(false);
                      setNewCategoryInput('');
                    }}
                    className="text-[11px] font-bold text-slate-500 hover:text-slate-700 hover:underline"
                  >
                    Cancelar
                  </button>
                )}
              </div>

              {!isCreatingCategory ? (
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full text-xs p-2.5 rounded-xl border border-slate-200 bg-white font-semibold text-slate-800 focus:ring-2 focus:ring-rose-500/20"
                >
                  {categories.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="flex items-center gap-1.5 animate-in fade-in duration-150">
                  <input
                    type="text"
                    autoFocus
                    placeholder="Nome da nova categoria..."
                    value={newCategoryInput}
                    onChange={(e) => setNewCategoryInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleQuickAddCategory();
                      }
                    }}
                    className="w-full text-xs p-2 rounded-xl border border-rose-300 focus:ring-2 focus:ring-rose-500/20 font-bold text-rose-950 bg-rose-50/40"
                  />
                  <button
                    type="button"
                    onClick={handleQuickAddCategory}
                    className="bg-rose-600 hover:bg-rose-700 text-white font-bold px-3 py-2 rounded-xl text-xs flex items-center gap-1 shrink-0 transition-colors shadow-2xs"
                  >
                    <Check className="w-3.5 h-3.5" />
                    Salvar
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">SKU</label>
              <input
                type="text"
                value={sku}
                onChange={(e) => setSku(e.target.value)}
                className="w-full text-xs p-2.5 rounded-xl border border-slate-200 font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">EAN / Código</label>
              <input
                type="text"
                value={ean}
                onChange={(e) => setEan(e.target.value)}
                className="w-full text-xs p-2.5 rounded-xl border border-slate-200 font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Apresentação</label>
              <select
                value={unit}
                onChange={(e) => setUnit(e.target.value as any)}
                className="w-full text-xs p-2.5 rounded-xl border border-slate-200 bg-white"
              >
                <option value="Pacote 500g">Pacote 500g</option>
                <option value="Pacote 100g">Pacote 100g</option>
                <option value="Display 12un">Display 12un</option>
                <option value="Caixa 1kg">Caixa 1kg</option>
                <option value="Unidade">Unidade</option>
              </select>
            </div>
          </div>

          {/* Pricing */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 bg-slate-50 rounded-2xl border border-slate-200">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Preço de Custo (R$) *
              </label>
              <input
                type="text"
                inputMode="decimal"
                required
                placeholder="12,50"
                value={costPrice}
                onChange={(e) => setCostPrice(e.target.value)}
                onFocus={(e) => e.target.select()}
                className="w-full text-xs p-2.5 rounded-xl border border-slate-200 font-bold text-slate-900 bg-white"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Preço de Venda (R$) *
              </label>
              <input
                type="text"
                inputMode="decimal"
                required
                placeholder="24,90"
                value={sellPrice}
                onChange={(e) => setSellPrice(e.target.value)}
                onFocus={(e) => e.target.select()}
                className="w-full text-xs p-2.5 rounded-xl border border-slate-200 font-bold text-rose-600 bg-white"
              />
            </div>
          </div>

          {/* Initial Stock & Thresholds */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-sky-800 mb-1">
                Estoque Depósito
              </label>
              <input
                type="text"
                inputMode="numeric"
                value={stockDeposito}
                onChange={(e) => setStockDeposito(e.target.value)}
                onFocus={(e) => e.target.select()}
                className="w-full text-xs p-2.5 rounded-xl border border-sky-200 font-bold text-sky-900 bg-sky-50/50"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-amber-800 mb-1">
                Estoque Loja
              </label>
              <input
                type="text"
                inputMode="numeric"
                value={stockLoja}
                onChange={(e) => setStockLoja(e.target.value)}
                onFocus={(e) => e.target.select()}
                className="w-full text-xs p-2.5 rounded-xl border border-amber-200 font-bold text-amber-900 bg-amber-50/50"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">
                Mínimo Depósito
              </label>
              <input
                type="text"
                inputMode="numeric"
                value={minStockDeposito}
                onChange={(e) => setMinStockDeposito(e.target.value)}
                onFocus={(e) => e.target.select()}
                className="w-full text-xs p-2.5 rounded-xl border border-slate-200 font-semibold"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">
                Mínimo Loja
              </label>
              <input
                type="text"
                inputMode="numeric"
                value={minStockLoja}
                onChange={(e) => setMinStockLoja(e.target.value)}
                onFocus={(e) => e.target.select()}
                className="w-full text-xs p-2.5 rounded-xl border border-slate-200 font-semibold"
              />
            </div>
          </div>

          {/* Batch & Expiration */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Lote</label>
              <input
                type="text"
                value={batchNumber}
                onChange={(e) => setBatchNumber(e.target.value)}
                className="w-full text-xs p-2.5 rounded-xl border border-slate-200 font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Data de Validade</label>
              <input
                type="date"
                value={expirationDate}
                onChange={(e) => setExpirationDate(e.target.value)}
                className="w-full text-xs p-2.5 rounded-xl border border-slate-200"
              />
            </div>
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
              disabled={isSubmitting}
              className="flex items-center gap-2 bg-rose-600 hover:bg-rose-700 disabled:bg-rose-400 text-white font-bold px-5 py-2.5 rounded-xl text-xs shadow-md transition-colors"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Salvando no banco...</span>
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  <span>{editingProduct ? 'Salvar Alterações' : 'Cadastrar Produto'}</span>
                </>
              )}
            </button>
          </div>

        </form>

      </div>
    </div>
  );
};
