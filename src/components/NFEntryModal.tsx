import React, { useState } from 'react';
import {
  X,
  FileSpreadsheet,
  Plus,
  Trash2,
  Warehouse,
  CheckCircle2,
  Building,
  Search,
  Sparkles,
  Upload,
  Link,
  PlusCircle,
  Loader2,
  Tag,
  AlertCircle,
  FileText,
  ShieldCheck,
  Check,
} from 'lucide-react';
import { useStock } from '../context/StockContext';
import { NFItem, Product, ProductCategory } from '../types';
import { formatCurrency, parseNumber } from '../utils/inventoryUtils';

interface NFEntryModalProps {
  isOpen: boolean;
  onClose: () => void;
}

// Interface for items imported from Receita Federal / XML
interface ImportedNFItem {
  id: string;
  codeEAN: string;
  description: string;
  quantity: number;
  costPrice: number;
  batchNumber: string;
  expirationDate: string;
  unit: Product['unit'];
  category: ProductCategory;
  // Link status
  linkType: 'existing' | 'new';
  matchedProductId: string; // If existing
  // New product form data if linkType === 'new'
  newProductData: {
    sku: string;
    name: string;
    category: ProductCategory;
    unit: Product['unit'];
    sellPrice: number;
    minStockDeposito: number;
    minStockLoja: number;
  };
}

// Sample Receita Federal Invoices to test / simulate live Receita WS fetch
const MOCK_RECEITA_INVOICES = [
  {
    id: 'nf-receita-001',
    numberNF: '001.095.420',
    accessKey: '3526070240882100014455001001095420184139ef12',
    supplier: 'Fini Comercializadora de Alimentos S/A',
    cnpjSupplier: '02.408.821/0001-44',
    issueDate: '2026-07-28',
    notes: 'Importação automática via Webservice Receita Federal / SEFAZ-SP (Chave 352607...)',
    items: [
      {
        id: 'item-rec-1',
        codeEAN: '7898591450011',
        description: 'Fini Minhocas Azedinhas 90g',
        quantity: 120,
        costPrice: 3.80,
        batchNumber: 'LOTE-FINI-2026-A',
        expirationDate: '2027-08-30',
        unit: 'Pacote 100g' as const,
        category: 'Balas Azedas' as const,
      },
      {
        id: 'item-rec-2',
        codeEAN: '7898591450028',
        description: 'Fini Tubes Morango Citrico 80g',
        quantity: 150,
        costPrice: 3.60,
        batchNumber: 'LOTE-FINI-2026-B',
        expirationDate: '2027-09-15',
        unit: 'Pacote 100g' as const,
        category: 'Regaliz & Tubes' as const,
      },
      {
        id: 'item-rec-3',
        codeEAN: '7898591450035',
        description: 'Fini Marshmallow Torção Recheado 250g',
        quantity: 80,
        costPrice: 8.20,
        batchNumber: 'LOTE-MARSH-2026',
        expirationDate: '2027-06-20',
        unit: 'Pacote 500g' as const,
        category: 'Marshmallows' as const,
      },
      // Item that DOES NOT exist in default stock -> Tests "Cadastrar Novo Produto Auto"
      {
        id: 'item-rec-4',
        codeEAN: '7898591450999',
        description: 'Fini Amoras Silvestres Premium 100g',
        quantity: 100,
        costPrice: 4.10,
        batchNumber: 'LOTE-AMORA-2026',
        expirationDate: '2027-10-31',
        unit: 'Pacote 100g' as const,
        category: 'Balas de Gelatina' as const,
      },
    ],
  },
  {
    id: 'nf-receita-002',
    numberNF: '002.884.102',
    accessKey: '3326071234567800019955002002884102184139ef33',
    supplier: 'Distribuidora Candy Friburgo Ltda',
    cnpjSupplier: '12.345.678/0001-99',
    issueDate: '2026-07-29',
    notes: 'Nota Fiscal Eletrônica emitida em Friburgo - Carga de Gelatinas',
    items: [
      {
        id: 'item-rec-5',
        codeEAN: '7898591450042',
        description: 'Fini Bananas Gelatina 90g',
        quantity: 200,
        costPrice: 3.50,
        batchNumber: 'LOTE-BANANA-2026',
        expirationDate: '2027-12-01',
        unit: 'Pacote 100g' as const,
        category: 'Balas de Gelatina' as const,
      },
      {
        id: 'item-rec-6',
        codeEAN: '7898591450888',
        description: 'Fini Ovos Fritos Gelatina 250g',
        quantity: 90,
        costPrice: 7.90,
        batchNumber: 'LOTE-OVOS-2026',
        expirationDate: '2027-11-20',
        unit: 'Pacote 500g' as const,
        category: 'Balas de Gelatina' as const,
      },
    ],
  },
];

export const NFEntryModal: React.FC<NFEntryModalProps> = ({ isOpen, onClose }) => {
  const { products, addProduct, addNFEntry, currentUser, checkPermission } = useStock();

  // Mode tab: 'receita' (Direct Receita Import) vs 'manual' (Manual Form)
  const [activeTabMode, setActiveTabMode] = useState<'receita' | 'manual'>('receita');

  // Receita query parameters
  const [accessKeyInput, setAccessKeyInput] = useState('');
  const [isQueryingReceita, setIsQueryingReceita] = useState(false);
  const [receitaSuccessMessage, setReceitaSuccessMessage] = useState('');

  // Receita Imported Data
  const [receitaHeader, setReceitaHeader] = useState({
    numberNF: '',
    accessKey: '',
    supplier: 'Fini Comercializadora de Alimentos S/A',
    cnpjSupplier: '02.408.821/0001-44',
    issueDate: new Date().toISOString().slice(0, 10),
    notes: 'Importação automática Receita Federal / SEFAZ',
  });

  const [importedItems, setImportedItems] = useState<ImportedNFItem[]>([]);

  // Manual Mode state
  const [manualNumberNF, setManualNumberNF] = useState('');
  const [manualAccessKey, setManualAccessKey] = useState('');
  const [manualSupplier, setManualSupplier] = useState('Fini Comercializadora de Alimentos S/A');
  const [manualCnpj, setManualCnpj] = useState('02.408.821/0001-44');
  const [manualIssueDate, setManualIssueDate] = useState(new Date().toISOString().slice(0, 10));
  const [manualNotes, setManualNotes] = useState('');
  const [manualItems, setManualItems] = useState<NFItem[]>([]);

  // Manual item builder inputs
  const [selectedProductId, setSelectedProductId] = useState('');
  const [itemQuantity, setItemQuantity] = useState<string | number>(10);
  const [itemCostPrice, setItemCostPrice] = useState<string | number>('12,50');
  const [itemBatch, setItemBatch] = useState(`LOTE-${new Date().getFullYear()}-NF`);
  const [itemExpiration, setItemExpiration] = useState('2027-06-30');

  if (!isOpen) return null;

  if (!checkPermission('canAddNFEntries')) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm animate-in fade-in duration-200">
        <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-2xl max-w-md w-full text-center space-y-4">
          <div className="w-12 h-12 bg-rose-100 text-rose-600 rounded-2xl flex items-center justify-center mx-auto">
            <AlertCircle className="w-6 h-6" />
          </div>
          <h3 className="text-base font-black text-slate-900">Acesso Não Autorizado</h3>
          <p className="text-xs text-slate-600">
            Você não possui permissão para dar entrada em Notas Fiscais.
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

  // Helper to match an item to existing products in stock
  const findMatchingProduct = (description: string, codeEAN: string): Product | undefined => {
    const descLower = description.toLowerCase();
    return products.find(
      (p) =>
        (codeEAN && p.ean === codeEAN) ||
        p.name.toLowerCase() === descLower ||
        descLower.includes(p.name.toLowerCase()) ||
        p.name.toLowerCase().includes(descLower)
    );
  };

  // Trigger Receita Import from preset or Access Key query
  const handleConsultReceita = (presetInvoiceId?: string) => {
    setIsQueryingReceita(true);
    setReceitaSuccessMessage('');

    setTimeout(() => {
      let targetNF = MOCK_RECEITA_INVOICES[0];
      if (presetInvoiceId) {
        const found = MOCK_RECEITA_INVOICES.find((i) => i.id === presetInvoiceId);
        if (found) targetNF = found;
      } else if (accessKeyInput.trim()) {
        targetNF = {
          ...MOCK_RECEITA_INVOICES[0],
          accessKey: accessKeyInput.trim(),
          numberNF: `NF-${Math.floor(100000 + Math.random() * 900000)}`,
        };
      }

      setReceitaHeader({
        numberNF: targetNF.numberNF,
        accessKey: targetNF.accessKey,
        supplier: targetNF.supplier,
        cnpjSupplier: targetNF.cnpjSupplier,
        issueDate: targetNF.issueDate,
        notes: targetNF.notes,
      });

      // Map imported items with auto-link logic
      const mapped: ImportedNFItem[] = targetNF.items.map((raw) => {
        const matched = findMatchingProduct(raw.description, raw.codeEAN);

        return {
          id: raw.id,
          codeEAN: raw.codeEAN,
          description: raw.description,
          quantity: raw.quantity,
          costPrice: raw.costPrice,
          batchNumber: raw.batchNumber,
          expirationDate: raw.expirationDate,
          unit: raw.unit,
          category: raw.category,
          linkType: matched ? ('existing' as const) : ('new' as const),
          matchedProductId: matched ? matched.id : '',
          newProductData: {
            sku: `FINI-${raw.description.substring(0, 8).toUpperCase().replace(/\s+/g, '')}`,
            name: raw.description,
            category: raw.category,
            unit: raw.unit,
            sellPrice: Math.round(raw.costPrice * 1.85 * 100) / 100, // Default 85% margin suggestion
            minStockDeposito: 30,
            minStockLoja: 10,
          },
        };
      });

      setImportedItems(mapped);
      setIsQueryingReceita(false);
    }, 800);
  };

  // Handler for XML upload
  const handleXmlFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsQueryingReceita(true);
    const reader = new FileReader();

    reader.onload = () => {
      // Parse file or simulate parsed NFe XML structure
      setTimeout(() => {
        handleConsultReceita('nf-receita-001');
      }, 500);
    };

    reader.readAsText(file);
  };

  // Toggle item link mode (existing vs new)
  const handleItemLinkTypeChange = (index: number, linkType: 'existing' | 'new') => {
    setImportedItems((prev) =>
      prev.map((item, i) => {
        if (i !== index) return item;
        return {
          ...item,
          linkType,
          matchedProductId:
            linkType === 'existing' && !item.matchedProductId && products.length > 0
              ? products[0].id
              : item.matchedProductId,
        };
      })
    );
  };

  // Update matched product for an item
  const handleMatchedProductChange = (index: number, productId: string) => {
    setImportedItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, matchedProductId: productId } : item))
    );
  };

  // Update new product details
  const handleNewProductDataChange = (
    index: number,
    field: keyof ImportedNFItem['newProductData'],
    value: any
  ) => {
    setImportedItems((prev) =>
      prev.map((item, i) => {
        if (i !== index) return item;
        return {
          ...item,
          newProductData: {
            ...item.newProductData,
            [field]: value,
          },
        };
      })
    );
  };

  // Remove item from imported Receita list
  const removeImportedItem = (index: number) => {
    setImportedItems((prev) => prev.filter((_, i) => i !== index));
  };

  // Calculate totals
  const receitaTotalValue = importedItems.reduce(
    (acc, item) => acc + item.quantity * item.costPrice,
    0
  );

  // Submit Receita NF Entry (Registers missing products + inserts NF Entry into Depósito)
  const handleSubmitReceitaNF = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!receitaHeader.numberNF) {
      alert('Selecione ou consulte uma Nota Fiscal da Receita Federal primeiro.');
      return;
    }

    if (importedItems.length === 0) {
      alert('A Nota Fiscal deve conter pelo menos um produto.');
      return;
    }

    // List of final NFItems to be inserted
    const finalNFItems: NFItem[] = [];
    let newProductsCreatedCount = 0;

    for (const item of importedItems) {
      let finalProductId = item.matchedProductId;
      let finalProductName = item.description;

      // If user chose "Cadastrar como Novo Produto", create it in StockContext first!
      if (item.linkType === 'new' || !finalProductId) {
        const newPData = item.newProductData;
        const newProdId = `prod-auto-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

        const createdProd = await addProduct({
          id: newProdId,
          sku: newPData.sku || `SKU-${Date.now().toString().slice(-6)}`,
          ean: item.codeEAN || '7898591450000',
          codeEAN: item.codeEAN || '7898591450000',
          name: newPData.name,
          category: newPData.category,
          unit: newPData.unit,
          stockDeposito: 0, // Stock will be added by addNFEntry
          stockLoja: 0,
          minStockDeposito: Number(newPData.minStockDeposito) || 30,
          minStockLoja: Number(newPData.minStockLoja) || 10,
          costPrice: item.costPrice,
          sellPrice: Number(newPData.sellPrice) || item.costPrice * 1.8,
          expirationDate: item.expirationDate,
          batchNumber: item.batchNumber,
        });

        finalProductId = createdProd?.id || newProdId;
        finalProductName = newPData.name;
        newProductsCreatedCount++;
      } else {
        const existing = products.find((p) => p.id === finalProductId);
        if (existing) {
          finalProductName = existing.name;
        }
      }

      finalNFItems.push({
        productId: finalProductId,
        productName: finalProductName,
        quantity: item.quantity,
        costPrice: item.costPrice,
        totalCost: item.quantity * item.costPrice,
        batchNumber: item.batchNumber,
        expirationDate: item.expirationDate,
      });
    }

    // Save NF Entry
    try {
      await addNFEntry({
        numberNF: receitaHeader.numberNF,
        accessKey: receitaHeader.accessKey,
        supplier: receitaHeader.supplier,
        cnpjSupplier: receitaHeader.cnpjSupplier,
        issueDate: receitaHeader.issueDate,
        items: finalNFItems,
        totalValue: receitaTotalValue,
        notes: `${receitaHeader.notes} (${newProductsCreatedCount} novos produtos cadastrados auto)`,
        createdBy: currentUser.name,
      });

      const successMsg = `Entrada por Nota Fiscal Receita Federal #${receitaHeader.numberNF} CONCLUÍDA! ${finalNFItems.length} itens lançados no DEPÓSITO CENTRAL. ${
        newProductsCreatedCount > 0
          ? `${newProductsCreatedCount} novo(s) produto(s) cadastrado(s) automaticamente no sistema.`
          : ''
      }`;

      setReceitaSuccessMessage(successMsg);

      setTimeout(() => {
        setReceitaSuccessMessage('');
        onClose();
      }, 2000);
    } catch (err: any) {
      alert(`Falha ao salvar Nota Fiscal no servidor:\n\n${err?.message || 'Erro inesperado'}`);
    }
  };

  // MANUAL MODE FUNCTIONS
  const handleManualProductSelect = (pId: string) => {
    setSelectedProductId(pId);
    const prod = products.find((p) => p.id === pId);
    if (prod) {
      setItemCostPrice(prod.costPrice);
      setItemExpiration(prod.expirationDate);
    }
  };

  const handleAddManualItem = () => {
    const qty = parseNumber(itemQuantity, 1);
    const cost = parseNumber(itemCostPrice, 0);
    if (!selectedProductId || qty <= 0) return;
    const prod = products.find((p) => p.id === selectedProductId);
    if (!prod) return;

    const newItem: NFItem = {
      productId: prod.id,
      productName: prod.name,
      quantity: qty,
      costPrice: cost,
      totalCost: qty * cost,
      batchNumber: itemBatch || `LOTE-${new Date().getFullYear()}`,
      expirationDate: itemExpiration,
    };

    setManualItems((prev) => [...prev, newItem]);
    setSelectedProductId('');
    setItemQuantity(10);
  };

  const removeManualItem = (index: number) => {
    setManualItems((prev) => prev.filter((_, i) => i !== index));
  };

  const manualTotalValue = manualItems.reduce((acc, i) => acc + i.totalCost, 0);

  const handleSubmitManual = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualNumberNF.trim()) {
      alert('Informe o Número da Nota Fiscal.');
      return;
    }
    if (manualItems.length === 0) {
      alert('Adicione pelo menos um produto na Nota Fiscal.');
      return;
    }

    try {
      await addNFEntry({
        numberNF: manualNumberNF,
        accessKey: manualAccessKey,
        supplier: manualSupplier,
        cnpjSupplier: manualCnpj,
        issueDate: manualIssueDate,
        items: manualItems,
        totalValue: manualTotalValue,
        notes: manualNotes,
        createdBy: currentUser.name,
      });

      alert(
        `Entrada de Nota Fiscal #${manualNumberNF} realizada com SUCESSO! O estoque do DEPÓSITO CENTRAL foi atualizado.`
      );
      onClose();
    } catch (err: any) {
      alert(`Falha ao salvar Nota Fiscal no servidor:\n\n${err?.message || 'Erro inesperado'}`);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl max-w-5xl w-full shadow-2xl border border-slate-200 overflow-hidden my-auto max-h-[94vh] flex flex-col">
        
        {/* Modal Header - Fixed top */}
        <div className="bg-gradient-to-r from-slate-900 via-rose-950 to-slate-900 p-3.5 sm:p-5 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5 sm:gap-3">
            <div className="p-2 sm:p-2.5 rounded-2xl bg-rose-600/30 border border-rose-500/40 text-rose-300 shrink-0">
              <FileSpreadsheet className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                <h2 className="text-sm sm:text-lg font-black tracking-tight text-left">
                  Entrada de Nota Fiscal (NF-e)
                </h2>
                <span className="text-[9px] sm:text-[10px] font-bold px-2 py-0.5 rounded bg-sky-500 text-white uppercase flex items-center gap-1">
                  <Warehouse className="w-3 h-3" /> Depósito
                </span>
              </div>
              <p className="text-[11px] text-rose-200/80 text-left line-clamp-1">
                Importação direta da Receita Federal e Revisão / Vínculo de Produtos
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 sm:p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-colors shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mode Selector Tabs (Receita Federal Direct vs Manual) */}
        <div className="bg-slate-100 p-1.5 border-b border-slate-200 flex flex-col sm:flex-row items-center gap-1.5 shrink-0">
          <button
            onClick={() => {
              setActiveTabMode('receita');
              if (importedItems.length === 0) handleConsultReceita('nf-receita-001');
            }}
            className={`w-full sm:flex-1 flex items-center justify-center gap-2 py-2 sm:py-2.5 px-3 sm:px-4 rounded-xl text-xs font-bold transition-all ${
              activeTabMode === 'receita'
                ? 'bg-rose-600 text-white shadow-md'
                : 'text-slate-600 hover:bg-slate-200/70'
            }`}
          >
            <Sparkles className="w-4 h-4 text-amber-300 shrink-0" />
            <span className="text-center sm:text-left">Importação Receita Federal / XML (Auto)</span>
          </button>

          <button
            onClick={() => setActiveTabMode('manual')}
            className={`w-full sm:flex-1 flex items-center justify-center gap-2 py-2 sm:py-2.5 px-3 sm:px-4 rounded-xl text-xs font-bold transition-all ${
              activeTabMode === 'manual'
                ? 'bg-rose-600 text-white shadow-md'
                : 'text-slate-600 hover:bg-slate-200/70'
            }`}
          >
            <FileText className="w-4 h-4 shrink-0" />
            <span className="text-center sm:text-left">Lançamento Manual Item por Item</span>
          </button>
        </div>

        {/* Success Alert Banner */}
        {receitaSuccessMessage ? (
          <div className="p-8 text-center space-y-3">
            <div className="w-14 h-14 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
              <Check className="w-7 h-7" />
            </div>
            <p className="text-base font-extrabold text-slate-800 max-w-lg mx-auto">
              {receitaSuccessMessage}
            </p>
          </div>
        ) : activeTabMode === 'receita' ? (
          /* =========================================================================
             MODE 1: RECEITA FEDERAL DIRECT IMPORT & SMART LINKING
             ========================================================================= */
          <form onSubmit={handleSubmitReceitaNF} className="p-5 space-y-5 max-h-[75vh] overflow-y-auto">
            
            {/* Search Query & XML File Bar */}
            <div className="bg-gradient-to-r from-rose-50 via-slate-50 to-rose-50/50 p-4 rounded-2xl border border-rose-200/80 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-rose-600" />
                  <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider">
                    Consultar webservice Receita Federal / SEFAZ ou Upload XML
                  </h3>
                </div>
                <span className="text-[10px] font-bold text-rose-700 bg-rose-100 px-2 py-0.5 rounded-full">
                  NF-e On-line
                </span>
              </div>

              <div className="flex flex-col sm:flex-row items-center gap-2">
                <div className="relative flex-1 w-full">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  <input
                    type="text"
                    placeholder="Cole a Chave de Acesso da NF-e (44 dígitos) ou CNPJ do fornecedor..."
                    value={accessKeyInput}
                    onChange={(e) => setAccessKeyInput(e.target.value)}
                    className="w-full text-xs pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 bg-white font-mono focus:ring-2 focus:ring-rose-500/20"
                  />
                </div>

                <button
                  type="button"
                  onClick={() => handleConsultReceita()}
                  disabled={isQueryingReceita}
                  className="w-full sm:w-auto flex items-center justify-center gap-2 bg-rose-600 hover:bg-rose-700 text-white font-bold py-2.5 px-4 rounded-xl text-xs shadow-sm transition-all"
                >
                  {isQueryingReceita ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Buscando Receita...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 text-amber-300" />
                      <span>Buscar na Receita</span>
                    </>
                  )}
                </button>

                <label className="w-full sm:w-auto cursor-pointer flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 text-white font-bold py-2.5 px-3 rounded-xl text-xs transition-colors">
                  <Upload className="w-4 h-4 text-rose-400" />
                  <span>Subir Arquivo XML</span>
                  <input
                    type="file"
                    accept=".xml"
                    onChange={handleXmlFileUpload}
                    className="hidden"
                  />
                </label>
              </div>

              {/* Sample NF Preset Chips */}
              <div className="pt-1 flex flex-wrap items-center gap-2">
                <span className="text-[10px] font-bold text-slate-400 uppercase">Testar NFs Prontas:</span>
                <button
                  type="button"
                  onClick={() => handleConsultReceita('nf-receita-001')}
                  className="text-xs px-2.5 py-1 rounded-lg bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 font-semibold flex items-center gap-1.5 transition-colors"
                >
                  <Building className="w-3.5 h-3.5 text-rose-600" />
                  <span>NF #001.095.420 (Fini S/A - Inclui Novo Produto)</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleConsultReceita('nf-receita-002')}
                  className="text-xs px-2.5 py-1 rounded-lg bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 font-semibold flex items-center gap-1.5 transition-colors"
                >
                  <Building className="w-3.5 h-3.5 text-sky-600" />
                  <span>NF #002.884.102 (Candy Friburgo)</span>
                </button>
              </div>
            </div>

            {/* Imported Header Info Card */}
            {receitaHeader.numberNF && (
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3">
                <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                  <div className="flex items-center gap-2">
                    <Building className="w-4 h-4 text-rose-600" />
                    <span className="text-xs font-black text-slate-800 uppercase">
                      Dados do Emitente & Nota Fiscal Receita Federal
                    </span>
                  </div>
                  <span className="text-xs font-mono font-bold text-slate-500">
                    NF nº {receitaHeader.numberNF}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase block">Fornecedor:</span>
                    <span className="font-bold text-slate-900">{receitaHeader.supplier}</span>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase block">CNPJ Emitente:</span>
                    <span className="font-mono text-slate-700">{receitaHeader.cnpjSupplier}</span>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase block">Data de Emissão:</span>
                    <span className="font-bold text-slate-800">{receitaHeader.issueDate}</span>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase block">Chave de Acesso:</span>
                    <span className="font-mono text-[10px] text-slate-600 truncate block" title={receitaHeader.accessKey}>
                      {receitaHeader.accessKey}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Smart Item Mapping & Auto-Linking List */}
            <div className="space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h4 className="text-xs font-extrabold text-slate-900 uppercase tracking-wider text-left">
                    Itens Extraídos da Nota Fiscal ({importedItems.length})
                  </h4>
                  <p className="text-[11px] text-slate-500 text-left">
                    O sistema vincula automaticamente produtos existentes ou permite configurar cadastros novos.
                  </p>
                </div>
                <span className="text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-xl self-start sm:self-auto">
                  Total NF: {formatCurrency(receitaTotalValue)}
                </span>
              </div>

              {importedItems.length === 0 ? (
                <div className="p-8 text-center border-2 border-dashed border-slate-200 rounded-2xl text-slate-400 text-xs space-y-2">
                  <Search className="w-8 h-8 text-slate-300 mx-auto" />
                  <p>Nenhuma nota fiscal selecionada ainda.</p>
                  <p className="text-[11px]">
                    Clique em um dos botões de teste acima ou digite a Chave de Acesso para buscar.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {importedItems.map((item, index) => {
                    const matchedProduct = products.find((p) => p.id === item.matchedProductId);

                    return (
                      <div
                        key={item.id}
                        className={`p-3.5 sm:p-4 rounded-2xl border transition-all space-y-3 ${
                          item.linkType === 'new'
                            ? 'bg-amber-50/60 border-amber-300'
                            : 'bg-white border-slate-200 shadow-xs'
                        }`}
                      >
                        {/* Item Info Line */}
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-slate-200/80">
                          <div className="space-y-1.5 text-left">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-xs font-black text-slate-900">
                                {index + 1}. {item.description}
                              </span>
                              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-100 text-slate-600 font-bold">
                                EAN: {item.codeEAN}
                              </span>
                            </div>

                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs text-slate-700 pt-1">
                              <div className="bg-slate-50 p-2 rounded-xl border border-slate-100">
                                <span className="text-[10px] text-slate-400 block font-bold uppercase">Quantidade</span>
                                <strong className="text-sky-700 font-black">+{item.quantity} un</strong>
                              </div>

                              <div className="bg-slate-50 p-2 rounded-xl border border-slate-100">
                                <span className="text-[10px] text-slate-400 block font-bold uppercase">Custo Unitário</span>
                                <strong className="text-slate-900 font-extrabold">{formatCurrency(item.costPrice)}</strong>
                              </div>

                              <div className="bg-slate-50 p-2 rounded-xl border border-slate-100">
                                <span className="text-[10px] text-slate-400 block font-bold uppercase">Total do Item</span>
                                <strong className="text-emerald-700 font-black">{formatCurrency(item.quantity * item.costPrice)}</strong>
                              </div>

                              <div className="bg-slate-50 p-2 rounded-xl border border-slate-100">
                                <span className="text-[10px] text-slate-400 block font-bold uppercase">Lote e Validade</span>
                                <span className="font-mono text-[11px] text-slate-700 font-semibold block truncate">
                                  {item.batchNumber} (Val: {item.expirationDate})
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Mode Switcher: Link vs New Product */}
                          <div className="flex items-center gap-2 shrink-0 flex-wrap pt-2 md:pt-0">
                            <button
                              type="button"
                              onClick={() => handleItemLinkTypeChange(index, 'existing')}
                              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                                item.linkType === 'existing'
                                  ? 'bg-sky-600 text-white shadow-xs'
                                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                              }`}
                            >
                              <Link className="w-3.5 h-3.5" />
                              <span>Vincular Existente</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => handleItemLinkTypeChange(index, 'new')}
                              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                                item.linkType === 'new'
                                  ? 'bg-amber-600 text-white shadow-xs'
                                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                              }`}
                            >
                              <PlusCircle className="w-3.5 h-3.5" />
                              <span>Cadastrar Novo Produto</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => removeImportedItem(index)}
                              className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-100 transition-colors"
                              title="Remover este item da Nota"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>

                        {/* Mapping Details Box */}
                        <div className="pt-3">
                          {item.linkType === 'existing' ? (
                            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                              <label className="text-xs font-bold text-slate-700 shrink-0">
                                Produto Correspondente no Estoque:
                              </label>
                              <select
                                value={item.matchedProductId}
                                onChange={(e) => handleMatchedProductChange(index, e.target.value)}
                                className="flex-1 text-xs p-2 rounded-xl border border-slate-200 bg-white font-bold text-slate-900"
                              >
                                {products.map((p) => (
                                  <option key={p.id} value={p.id}>
                                    {p.name} — (SKU: {p.sku}) • Depósito: {p.stockDeposito} un
                                  </option>
                                ))}
                              </select>

                              {matchedProduct && (
                                <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200">
                                  ✓ Vinculado a {matchedProduct.name}
                                </span>
                              )}
                            </div>
                          ) : (
                            /* New Product Quick Registration Config */
                            <div className="bg-amber-100/50 p-3 rounded-xl border border-amber-200 space-y-2">
                              <div className="flex items-center gap-2 text-amber-900 font-extrabold text-xs">
                                <Tag className="w-4 h-4 text-amber-600" />
                                <span>Configurar Cadastro Automático para este Novo Produto Fini:</span>
                              </div>

                              <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 text-xs">
                                <div>
                                  <label className="block text-[10px] font-bold text-slate-600 mb-0.5">
                                    Nome do Produto *
                                  </label>
                                  <input
                                    type="text"
                                    required
                                    value={item.newProductData.name}
                                    onChange={(e) =>
                                      handleNewProductDataChange(index, 'name', e.target.value)
                                    }
                                    className="w-full text-xs p-2 rounded-lg border border-slate-200 bg-white font-bold"
                                  />
                                </div>

                                <div>
                                  <label className="block text-[10px] font-bold text-slate-600 mb-0.5">
                                    Categoria Fini
                                  </label>
                                  <select
                                    value={item.newProductData.category}
                                    onChange={(e) =>
                                      handleNewProductDataChange(index, 'category', e.target.value)
                                    }
                                    className="w-full text-xs p-2 rounded-lg border border-slate-200 bg-white font-semibold"
                                  >
                                    <option value="Balas de Gelatina">Balas de Gelatina</option>
                                    <option value="Marshmallows">Marshmallows</option>
                                    <option value="Regaliz & Tubes">Regaliz & Tubes</option>
                                    <option value="Chicletes">Chicletes</option>
                                    <option value="Balas Azedas">Balas Azedas</option>
                                    <option value="Caixas & Displays">Caixas & Displays</option>
                                  </select>
                                </div>

                                <div>
                                  <label className="block text-[10px] font-bold text-slate-600 mb-0.5">
                                    Preço de Venda Sugerido (R$) *
                                  </label>
                                  <input
                                    type="text"
                                    inputMode="decimal"
                                    required
                                    placeholder="0,00"
                                    value={item.newProductData.sellPrice}
                                    onChange={(e) =>
                                      handleNewProductDataChange(
                                        index,
                                        'sellPrice',
                                        e.target.value
                                      )
                                    }
                                    onFocus={(e) => e.target.select()}
                                    className="w-full text-xs p-2 rounded-lg border border-slate-200 bg-white font-extrabold text-emerald-800"
                                  />
                                </div>

                                <div>
                                  <label className="block text-[10px] font-bold text-slate-600 mb-0.5">
                                    Unidade / Apresentação
                                  </label>
                                  <select
                                    value={item.newProductData.unit}
                                    onChange={(e) =>
                                      handleNewProductDataChange(index, 'unit', e.target.value)
                                    }
                                    className="w-full text-xs p-2 rounded-lg border border-slate-200 bg-white"
                                  >
                                    <option value="Pacote 100g">Pacote 100g</option>
                                    <option value="Pacote 500g">Pacote 500g</option>
                                    <option value="Caixa 1kg">Caixa 1kg</option>
                                    <option value="Display 12un">Display 12un</option>
                                    <option value="Unidade">Unidade</option>
                                  </select>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Submit Bar */}
            <div className="bg-slate-900 text-white p-4 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <p className="text-[10px] text-slate-400 uppercase font-bold">
                  Valor Total da Nota Fiscal Receita
                </p>
                <p className="text-2xl font-black text-emerald-400">
                  {formatCurrency(receitaTotalValue)}
                </p>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2.5 rounded-xl border border-slate-700 text-slate-300 hover:bg-slate-800 text-xs font-semibold"
                >
                  Cancelar
                </button>

                <button
                  type="submit"
                  disabled={importedItems.length === 0}
                  className="flex items-center gap-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-40 text-white font-bold px-6 py-2.5 rounded-xl text-xs shadow-md transition-all hover:scale-[1.01]"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Confirmar Entrada & Cadastrar Produtos Novos</span>
                </button>
              </div>
            </div>

          </form>
        ) : (
          /* =========================================================================
             MODE 2: MANUAL ENTRY FORM
             ========================================================================= */
          <form onSubmit={handleSubmitManual} className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
            
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-4">
              <h3 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                <Building className="w-4 h-4 text-rose-600" />
                Dados da Nota Fiscal e Fornecedor
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Número da NF *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: 001.095.420"
                    value={manualNumberNF}
                    onChange={(e) => setManualNumberNF(e.target.value)}
                    className="w-full text-xs p-2.5 rounded-xl border border-slate-200 font-bold focus:ring-2 focus:ring-rose-500/20"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Fornecedor
                  </label>
                  <input
                    type="text"
                    value={manualSupplier}
                    onChange={(e) => setManualSupplier(e.target.value)}
                    className="w-full text-xs p-2.5 rounded-xl border border-slate-200"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Data de Emissão
                  </label>
                  <input
                    type="date"
                    value={manualIssueDate}
                    onChange={(e) => setManualIssueDate(e.target.value)}
                    className="w-full text-xs p-2.5 rounded-xl border border-slate-200"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Chave de Acesso (Opcional)
                  </label>
                  <input
                    type="text"
                    placeholder="352607..."
                    value={manualAccessKey}
                    onChange={(e) => setManualAccessKey(e.target.value)}
                    className="w-full text-xs p-2.5 rounded-xl border border-slate-200 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Observação / Conferência
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: Carga conferida e sem avarias no descarregamento"
                    value={manualNotes}
                    onChange={(e) => setManualNotes(e.target.value)}
                    className="w-full text-xs p-2.5 rounded-xl border border-slate-200"
                  />
                </div>
              </div>
            </div>

            {/* Manual Item Builder */}
            <div className="bg-rose-50/50 p-4 rounded-2xl border border-rose-200/80 space-y-3">
              <h3 className="text-xs font-extrabold text-rose-900 uppercase tracking-wider flex items-center gap-2">
                <Plus className="w-4 h-4 text-rose-600" />
                Adicionar Produtos da Nota Fiscal
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                
                <div className="lg:col-span-2">
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Selecione o Produto *
                  </label>
                  <select
                    value={selectedProductId}
                    onChange={(e) => handleManualProductSelect(e.target.value)}
                    className="w-full text-xs p-2 rounded-xl border border-slate-200 bg-white"
                  >
                    <option value="">-- Selecione o Produto Fini --</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.unit})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Quantidade
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={itemQuantity}
                    onChange={(e) => setItemQuantity(e.target.value)}
                    onFocus={(e) => e.target.select()}
                    className="w-full text-xs p-2 rounded-xl border border-slate-200 bg-white font-bold"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Custo Unit. (R$)
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder="0,00"
                    value={itemCostPrice}
                    onChange={(e) => setItemCostPrice(e.target.value)}
                    onFocus={(e) => e.target.select()}
                    className="w-full text-xs p-2 rounded-xl border border-slate-200 bg-white font-bold"
                  />
                </div>

                <div className="flex items-end">
                  <button
                    type="button"
                    onClick={handleAddManualItem}
                    disabled={!selectedProductId}
                    className="w-full bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white font-bold py-2 px-3 rounded-xl text-xs transition-colors shadow-xs"
                  >
                    + Adicionar Item
                  </button>
                </div>

              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Número do Lote
                  </label>
                  <input
                    type="text"
                    value={itemBatch}
                    onChange={(e) => setItemBatch(e.target.value)}
                    className="w-full text-xs p-2 rounded-xl border border-slate-200 bg-white font-mono"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Data de Validade
                  </label>
                  <input
                    type="date"
                    value={itemExpiration}
                    onChange={(e) => setItemExpiration(e.target.value)}
                    className="w-full text-xs p-2 rounded-xl border border-slate-200 bg-white"
                  />
                </div>
              </div>
            </div>

            {/* Table of Manual Items */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                Itens Inclusos nesta Nota ({manualItems.length})
              </h4>

              <div className="border border-slate-200 rounded-2xl overflow-x-auto shadow-xs">
                <table className="w-full min-w-[600px] text-left text-xs">
                  <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[10px] border-b border-slate-200">
                    <tr>
                      <th className="py-2.5 px-3">Produto</th>
                      <th className="py-2.5 px-3 text-center">Quantidade</th>
                      <th className="py-2.5 px-3 text-right">Custo Unit.</th>
                      <th className="py-2.5 px-3 text-right">Total Item</th>
                      <th className="py-2.5 px-3 text-center">Lote / Validade</th>
                      <th className="py-2.5 px-3 text-center">Ação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {manualItems.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-6 text-center text-slate-400 text-xs">
                          Nenhum item adicionado ainda. Preencha o formulário e clique em "+ Adicionar Item".
                        </td>
                      </tr>
                    ) : (
                      manualItems.map((item, idx) => (
                        <tr key={idx} className="hover:bg-slate-50">
                          <td className="py-2.5 px-3 font-bold text-slate-900">
                            {item.productName}
                          </td>
                          <td className="py-2.5 px-3 text-center font-extrabold text-sky-700">
                            +{item.quantity} un
                          </td>
                          <td className="py-2.5 px-3 text-right text-slate-700">
                            {formatCurrency(item.costPrice)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-bold text-slate-900">
                            {formatCurrency(item.totalCost)}
                          </td>
                          <td className="py-2.5 px-3 text-center text-[11px] text-slate-500 font-mono">
                            {item.batchNumber} ({item.expirationDate})
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <button
                              type="button"
                              onClick={() => removeManualItem(idx)}
                              className="p-1 text-rose-600 hover:bg-rose-50 rounded"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Footer Total */}
            <div className="bg-slate-900 text-white p-4 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <p className="text-[10px] text-slate-400 uppercase font-bold">
                  Valor Total da Nota Fiscal
                </p>
                <p className="text-2xl font-black text-emerald-400">
                  {formatCurrency(manualTotalValue)}
                </p>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2.5 rounded-xl border border-slate-700 text-slate-300 hover:bg-slate-800 text-xs font-semibold"
                >
                  Cancelar
                </button>

                <button
                  type="submit"
                  disabled={manualItems.length === 0 || !manualNumberNF}
                  className="flex items-center gap-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-40 text-white font-bold px-5 py-2.5 rounded-xl text-xs shadow-md transition-all"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Confirmar Entrada no Depósito</span>
                </button>
              </div>
            </div>

          </form>
        )}

      </div>
    </div>
  );
};
