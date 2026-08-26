import React, { useState } from 'react';
import {
  X,
  FileSpreadsheet,
  Plus,
  Trash2,
  Warehouse,
  CheckCircle2,
  Building,
  Upload,
  Link,
  PlusCircle,
  Loader2,
  Tag,
  AlertCircle,
  FileText,
  ShieldCheck,
  Check,
  FileCode,
  ArrowRight,
} from 'lucide-react';
import { useStock } from '../context/StockContext';
import { NFItem, Product, ProductCategory } from '../types';
import { formatCurrency, parseNumber } from '../utils/inventoryUtils';
import { authFetch } from '../utils/apiAuth';
import { ParsedNFData, ParsedNFItem } from '../utils/nfeXmlParser';

interface NFEntryModalProps {
  isOpen: boolean;
  onClose: () => void;
}

// Interface for items imported from XML
interface ImportedNFItem {
  id: string;
  codeEAN: string;
  cProd: string;
  description: string;
  quantity: number;
  costPrice: number;
  batchNumber: string;
  expirationDate: string;
  unit: Product['unit'];
  category: ProductCategory;
  // Link status
  linkType: 'existing' | 'new';
  matchedProductId: string;
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

export const NFEntryModal: React.FC<NFEntryModalProps> = ({ isOpen, onClose }) => {
  const { products, addProduct, addNFEntry, currentUser, companyInfo, checkPermission } = useStock();

  // Mode tab: 'xml' (XML File Import) vs 'manual' (Manual Form)
  const [activeTabMode, setActiveTabMode] = useState<'xml' | 'manual'>('xml');

  // XML Import State
  const [isProcessingXml, setIsProcessingXml] = useState(false);
  const [xmlError, setXmlError] = useState<string | null>(null);
  const [xmlSuccessMessage, setXmlSuccessMessage] = useState('');
  const [importedFileName, setImportedFileName] = useState<string | null>(null);

  // XML Header Data
  const [xmlHeader, setXmlHeader] = useState<{
    numberNF: string;
    accessKey: string;
    supplier: string;
    cnpjSupplier: string;
    recipientCnpj: string;
    recipientName: string;
    issueDate: string;
    notes: string;
  }>({
    numberNF: '',
    accessKey: '',
    supplier: '',
    cnpjSupplier: '',
    recipientCnpj: '',
    recipientName: '',
    issueDate: new Date().toISOString().slice(0, 10),
    notes: '',
  });

  const [importedItems, setImportedItems] = useState<ImportedNFItem[]>([]);

  // Manual Mode state
  const [manualNumberNF, setManualNumberNF] = useState('');
  const [manualAccessKey, setManualAccessKey] = useState('');
  const [manualSupplier, setManualSupplier] = useState('');
  const [manualCnpj, setManualCnpj] = useState('');
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
    const cleanEan = (codeEAN || '').trim();
    if (cleanEan && cleanEan !== 'SEM GTIN' && cleanEan !== 'SEMGTIN') {
      const matchByEan = products.find((p) => (p.ean && p.ean === cleanEan) || (p.codeEAN && p.codeEAN === cleanEan));
      if (matchByEan) return matchByEan;
    }

    const descLower = description.toLowerCase().trim();
    return products.find((p) => {
      const pNameLower = p.name.toLowerCase().trim();
      return pNameLower === descLower || descLower.includes(pNameLower) || pNameLower.includes(descLower);
    });
  };

  // Helper to map XML unit string to standard product unit
  const mapUnitToStandard = (rawUnit: string): Product['unit'] => {
    const u = (rawUnit || '').toUpperCase().trim();
    if (u.includes('500G') || u.includes('500 G')) return 'Pacote 500g';
    if (u.includes('100G') || u.includes('90G') || u.includes('80G') || u.includes('PCT')) return 'Pacote 100g';
    if (u.includes('1KG') || u.includes('1 KG') || u.includes('CX') || u.includes('CAIXA')) return 'Caixa 1kg';
    if (u.includes('DISP') || u.includes('12UN') || u.includes('DP')) return 'Display 12un';
    return 'Pacote 100g';
  };

  // Helper to detect default Fini category
  const detectCategory = (description: string): ProductCategory => {
    const d = description.toLowerCase();
    if (d.includes('azed') || d.includes('citric') || d.includes('ácid')) return 'Balas Azedas';
    if (d.includes('tube') || d.includes('regaliz') || d.includes('tijolinho')) return 'Regaliz & Tubes';
    if (d.includes('marsh') || d.includes('torção') || d.includes('vulcano')) return 'Marshmallows';
    if (d.includes('chicle') || d.includes('goma') || d.includes('ovo de dinossauro')) return 'Chicletes';
    if (d.includes('display') || d.includes('caixa')) return 'Caixas & Displays';
    return 'Balas de Gelatina';
  };

  // Handler for XML file selection & upload to server
  const handleXmlFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset input value so user can re-upload the same file if needed
    e.target.value = '';

    setXmlError(null);
    setXmlSuccessMessage('');

    // Validar tipo do arquivo
    if (!file.name.toLowerCase().endsWith('.xml')) {
      setXmlError('Por favor, selecione um arquivo válido com extensão .xml.');
      return;
    }

    // Validar tamanho máximo do arquivo (5MB)
    const MAX_SIZE_BYTES = 5 * 1024 * 1024;
    if (file.size > MAX_SIZE_BYTES) {
      setXmlError(`O arquivo selecionado (${(file.size / (1024 * 1024)).toFixed(2)} MB) excede o limite máximo permitido de 5MB.`);
      return;
    }

    setIsProcessingXml(true);
    setImportedFileName(file.name);

    try {
      const xmlText = await file.text();

      if (!xmlText || xmlText.trim().length === 0) {
        throw new Error('O arquivo XML selecionado está vazio.');
      }

      // Envia o XML para validação e parse no servidor
      const response = await authFetch('/api/nfe/import-xml', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          xml: xmlText,
          companyCnpj: companyInfo?.cnpj || '',
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result?.error || `Falha ao processar o arquivo XML no servidor (HTTP ${response.status}).`);
      }

      const parsedData: ParsedNFData = result.data;

      // Popula os dados do cabeçalho da NF
      setXmlHeader({
        numberNF: parsedData.numberNF,
        accessKey: parsedData.accessKey,
        supplier: parsedData.supplier,
        cnpjSupplier: parsedData.cnpjSupplier,
        recipientCnpj: parsedData.recipientCnpj,
        recipientName: parsedData.recipientName,
        issueDate: parsedData.issueDate,
        notes: parsedData.notes,
      });

      // Mapeia os itens do XML com verificação de vínculo a produtos existentes
      const mapped: ImportedNFItem[] = parsedData.items.map((raw: ParsedNFItem) => {
        const matched = findMatchingProduct(raw.description, raw.codeEAN);
        const standardUnit = mapUnitToStandard(raw.unit);
        const detectedCat = detectCategory(raw.description);

        return {
          id: raw.id,
          codeEAN: raw.codeEAN,
          cProd: raw.cProd,
          description: raw.description,
          quantity: raw.quantity,
          costPrice: raw.costPrice,
          batchNumber: raw.batchNumber,
          expirationDate: raw.expirationDate,
          unit: matched ? matched.unit : standardUnit,
          category: matched ? matched.category : detectedCat,
          linkType: matched ? ('existing' as const) : ('new' as const),
          matchedProductId: matched ? matched.id : '',
          newProductData: {
            sku: `FINI-${(raw.cProd || raw.description.substring(0, 8)).toUpperCase().replace(/[^A-Z0-9]/g, '')}`,
            name: raw.description,
            category: detectedCat,
            unit: standardUnit,
            sellPrice: Math.round(raw.costPrice * 1.85 * 100) / 100, // Margem sugerida padrão de 85%
            minStockDeposito: 30,
            minStockLoja: 10,
          },
        };
      });

      setImportedItems(mapped);
    } catch (err: any) {
      console.error('Erro ao importar XML de NF-e:', err);
      setXmlError(err?.message || 'Erro inesperado ao ler e processar o arquivo XML da NF-e.');
      setImportedItems([]);
    } finally {
      setIsProcessingXml(false);
    }
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

  // Remove item from imported XML list
  const removeImportedItem = (index: number) => {
    setImportedItems((prev) => prev.filter((_, i) => i !== index));
  };

  // Calculate totals
  const xmlTotalValue = importedItems.reduce(
    (acc, item) => acc + item.quantity * item.costPrice,
    0
  );

  // Submit XML NF Entry (Registers missing products + inserts NF Entry into Depósito)
  const handleSubmitXmlNF = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!xmlHeader.numberNF) {
      alert('Faça o upload de um arquivo XML de NF-e válido primeiro.');
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

      // If user chose "Cadastrar como Novo Produto", create it in database first!
      if (item.linkType === 'new' || !finalProductId) {
        const newPData = item.newProductData;
        const newProdId = `prod-auto-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

        const createdProd = await addProduct({
          id: newProdId,
          sku: newPData.sku || `SKU-${Date.now().toString().slice(-6)}`,
          ean: item.codeEAN || '',
          codeEAN: item.codeEAN || '',
          name: newPData.name,
          category: newPData.category,
          unit: newPData.unit,
          stockDeposito: 0, // Stock will be added by addNFEntry
          stockLoja: 0,
          minStockDeposito: Number(newPData.minStockDeposito) || 30,
          minStockLoja: Number(newPData.minStockLoja) || 10,
          costPrice: item.costPrice,
          sellPrice: Number(newPData.sellPrice) || Math.round(item.costPrice * 1.8 * 100) / 100,
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
        numberNF: xmlHeader.numberNF,
        accessKey: xmlHeader.accessKey,
        supplier: xmlHeader.supplier,
        cnpjSupplier: xmlHeader.cnpjSupplier,
        issueDate: xmlHeader.issueDate,
        items: finalNFItems,
        totalValue: xmlTotalValue,
        notes: `${xmlHeader.notes} (${newProductsCreatedCount} novos produtos cadastrados auto)`,
        createdBy: currentUser.name,
      });

      const successMsg = `Entrada de NF-e #${xmlHeader.numberNF} CONCLUÍDA! ${finalNFItems.length} itens lançados no DEPÓSITO CENTRAL. ${
        newProductsCreatedCount > 0
          ? `${newProductsCreatedCount} novo(s) produto(s) cadastrado(s) automaticamente no sistema.`
          : ''
      }`;

      setXmlSuccessMessage(successMsg);

      setTimeout(() => {
        setXmlSuccessMessage('');
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
        
        {/* Modal Header */}
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
                Importação oficial de XML de NF-e e Lançamento de Estoque
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

        {/* Mode Selector Tabs */}
        <div className="bg-slate-100 p-1.5 border-b border-slate-200 flex flex-col sm:flex-row items-center gap-1.5 shrink-0">
          <button
            onClick={() => setActiveTabMode('xml')}
            className={`w-full sm:flex-1 flex items-center justify-center gap-2 py-2 sm:py-2.5 px-3 sm:px-4 rounded-xl text-xs font-bold transition-all ${
              activeTabMode === 'xml'
                ? 'bg-rose-600 text-white shadow-md'
                : 'text-slate-600 hover:bg-slate-200/70'
            }`}
          >
            <FileCode className="w-4 h-4 shrink-0" />
            <span className="text-center sm:text-left">Importar XML (NF-e Oficial)</span>
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
        {xmlSuccessMessage ? (
          <div className="p-8 text-center space-y-3">
            <div className="w-14 h-14 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
              <Check className="w-7 h-7" />
            </div>
            <p className="text-base font-extrabold text-slate-800 max-w-lg mx-auto">
              {xmlSuccessMessage}
            </p>
          </div>
        ) : activeTabMode === 'xml' ? (
          /* =========================================================================
             MODE 1: REAL XML FILE IMPORT & SMART ITEM LINKING
             ========================================================================= */
          <form onSubmit={handleSubmitXmlNF} className="p-5 space-y-5 max-h-[75vh] overflow-y-auto">
            
            {/* XML Upload Box */}
            <div className="bg-gradient-to-r from-rose-50/70 via-slate-50 to-rose-50/70 p-5 rounded-2xl border border-rose-200/80 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-rose-600" />
                  <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider">
                    Importação de Arquivo XML de Nota Fiscal Eletrônica
                  </h3>
                </div>
                {companyInfo?.cnpj ? (
                  <span className="text-[10px] font-bold text-slate-600 bg-white border border-slate-200 px-2.5 py-1 rounded-lg">
                    CNPJ da Empresa: <strong className="text-slate-900 font-mono">{companyInfo.cnpj}</strong>
                  </span>
                ) : (
                  <span className="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-lg">
                    CNPJ não cadastrado (Configurações → Dados da Empresa)
                  </span>
                )}
              </div>

              {/* Upload Drop Area */}
              <div className="flex flex-col items-center justify-center border-2 border-dashed border-rose-300 hover:border-rose-500 bg-white rounded-2xl p-6 text-center transition-colors">
                {isProcessingXml ? (
                  <div className="py-4 flex flex-col items-center gap-2">
                    <Loader2 className="w-8 h-8 text-rose-600 animate-spin" />
                    <p className="text-xs font-bold text-slate-800">Processando e validando arquivo XML da NF-e...</p>
                    <p className="text-[11px] text-slate-500">Conferindo CNPJ do destinatário, chave de acesso e produtos.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="w-12 h-12 bg-rose-100 text-rose-600 rounded-2xl flex items-center justify-center mx-auto">
                      <Upload className="w-6 h-6" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-900">
                        Clique para selecionar ou arraste o arquivo XML da NF-e
                      </p>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Aceita arquivos padrão <strong>.xml</strong> emitidos pela SEFAZ (limite de até 5MB).
                      </p>
                    </div>
                    <div>
                      <label className="cursor-pointer inline-flex items-center gap-2 bg-rose-600 hover:bg-rose-700 text-white font-bold py-2.5 px-5 rounded-xl text-xs shadow-sm transition-colors">
                        <FileCode className="w-4 h-4" />
                        <span>Selecionar Arquivo XML</span>
                        <input
                          type="file"
                          accept=".xml"
                          onChange={handleXmlFileSelected}
                          className="hidden"
                        />
                      </label>
                    </div>
                    {importedFileName && !xmlError && importedItems.length > 0 && (
                      <p className="text-[11px] text-emerald-700 font-bold bg-emerald-50 px-3 py-1 rounded-full inline-block">
                        ✓ Arquivo carregado: {importedFileName}
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Error Message Box */}
              {xmlError && (
                <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2.5 text-rose-800 text-xs animate-in fade-in">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
                  <div className="flex-1">
                    <strong className="block font-bold">Não foi possível importar esta Nota Fiscal:</strong>
                    <p className="mt-0.5 text-rose-700">{xmlError}</p>
                  </div>
                </div>
              )}
            </div>

            {/* Imported Header Info Card */}
            {xmlHeader.numberNF && (
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3 animate-in fade-in">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-200 pb-2.5 gap-2">
                  <div className="flex items-center gap-2">
                    <Building className="w-4 h-4 text-rose-600 shrink-0" />
                    <span className="text-xs font-black text-slate-800 uppercase">
                      Dados da Nota Fiscal & Fornecedor
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-bold text-slate-700 bg-white px-2.5 py-0.5 rounded-md border border-slate-200">
                      NF nº {xmlHeader.numberNF}
                    </span>
                    <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full flex items-center gap-1">
                      <Check className="w-3 h-3" /> Destinatário Validado
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase block">Fornecedor Emitente:</span>
                    <span className="font-bold text-slate-900 block truncate" title={xmlHeader.supplier}>{xmlHeader.supplier}</span>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase block">CNPJ Emitente:</span>
                    <span className="font-mono text-slate-700">{xmlHeader.cnpjSupplier}</span>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase block">Data de Emissão:</span>
                    <span className="font-bold text-slate-800">{xmlHeader.issueDate}</span>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase block">Chave de Acesso:</span>
                    <span className="font-mono text-[10px] text-slate-600 truncate block" title={xmlHeader.accessKey}>
                      {xmlHeader.accessKey || 'Não informada no XML'}
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
                    Itens Extraídos do XML ({importedItems.length})
                  </h4>
                  <p className="text-[11px] text-slate-500 text-left">
                    O sistema vincula produtos existentes pelo Código EAN/Nome ou permite cadastrar novos produtos.
                  </p>
                </div>
                {importedItems.length > 0 && (
                  <span className="text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-xl self-start sm:self-auto">
                    Total da Nota: {formatCurrency(xmlTotalValue)}
                  </span>
                )}
              </div>

              {importedItems.length === 0 ? (
                <div className="p-8 text-center border-2 border-dashed border-slate-200 rounded-2xl text-slate-400 text-xs space-y-2">
                  <FileCode className="w-8 h-8 text-slate-300 mx-auto" />
                  <p>Nenhum item carregado.</p>
                  <p className="text-[11px]">
                    Selecione um arquivo XML de NF-e acima para extrair e conferir os produtos.
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
                          <div className="space-y-1.5 text-left flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-xs font-black text-slate-900">
                                {index + 1}. {item.description}
                              </span>
                              {item.codeEAN && (
                                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-100 text-slate-600 font-bold">
                                  EAN: {item.codeEAN}
                                </span>
                              )}
                              {item.cProd && (
                                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-100 text-slate-500 font-semibold">
                                  Cód: {item.cProd}
                                </span>
                              )}
                            </div>

                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs text-slate-700 pt-1">
                              <div className="bg-slate-50 p-2 rounded-xl border border-slate-100">
                                <span className="text-[10px] text-slate-400 block font-bold uppercase">Quantidade</span>
                                <strong className="text-sky-700 font-black">+{item.quantity} {item.unit}</strong>
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
                                <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200 shrink-0">
                                  ✓ Vinculado a {matchedProduct.name}
                                </span>
                              )}
                            </div>
                          ) : (
                            /* New Product Quick Registration Config */
                            <div className="bg-amber-100/50 p-3 rounded-xl border border-amber-200 space-y-2">
                              <div className="flex items-center gap-2 text-amber-900 font-extrabold text-xs">
                                <Tag className="w-4 h-4 text-amber-600" />
                                <span>Configurar Cadastro Automático para este Novo Produto:</span>
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
                                    Categoria do Produto
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
                  Valor Total da Nota Fiscal XML
                </p>
                <p className="text-2xl font-black text-emerald-400">
                  {formatCurrency(xmlTotalValue)}
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
             MODE 2: MANUAL ENTRY FORM (UNCHANGED)
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
                    <option value="">-- Selecione o Produto GummyStock --</option>
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
