import React, { useState, useEffect, useRef } from 'react';
import { Camera, Search, X, Check, ScanLine, AlertCircle, Upload, Sparkles, Package } from 'lucide-react';
import { Html5Qrcode } from 'html5-qrcode';
import { Product } from '../types';
import { formatCurrency } from '../utils/inventoryUtils';

interface ProductSearchScannerProps {
  products: Product[];
  selectedProductId: string;
  onSelectProduct: (product: Product) => void;
  label?: string;
  placeholder?: string;
}

export const ProductSearchScanner: React.FC<ProductSearchScannerProps> = ({
  products,
  selectedProductId,
  onSelectProduct,
  label = 'Localizar Produto por GTIN / Câmera, SKU ou Nome *',
  placeholder = 'Digite GTIN/EAN, SKU ou nome do produto...',
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [scannedFeedback, setScannedFeedback] = useState<string | null>(null);
  const [isScanningActive, setIsScanningActive] = useState(false);

  const html5QrcodeRef = useRef<Html5Qrcode | null>(null);
  const scannerContainerId = 'reader-barcode-scanner';
  const fileInputRef = useRef<HTMLInputElement>(null);

  const selectedProduct = products.find((p) => p.id === selectedProductId);

  // Filter products by GTIN, SKU or Description/Name
  const filteredProducts = products.filter((p) => {
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase().trim();
    const ean = (p.codeEAN || '').toLowerCase();
    const sku = (p.sku || '').toLowerCase();
    const name = (p.name || '').toLowerCase();
    return ean.includes(term) || sku.includes(term) || name.includes(term);
  });

  // Handle scanned code (from camera or image)
  const handleDecodedCode = (rawCode: string) => {
    const code = rawCode.trim();
    if (!code) return;

    // Search exact match by GTIN/EAN, SKU, or ID
    const found = products.find(
      (p) =>
        (p.codeEAN && p.codeEAN.trim() === code) ||
        (p.sku && p.sku.trim() === code) ||
        p.id === code ||
        p.name.toLowerCase().includes(code.toLowerCase())
    );

    if (found) {
      onSelectProduct(found);
      setSearchTerm('');
      setScannedFeedback(`✓ Produto localizado por GTIN/Código: "${found.name}" (GTIN: ${found.codeEAN || 'S/N'})`);
      stopCameraScanner();
      setIsCameraOpen(false);
      setTimeout(() => setScannedFeedback(null), 4000);
    } else {
      setCameraError(`Código "${code}" lido, porém nenhum produto com este GTIN/SKU foi encontrado neste estabelecimento.`);
    }
  };

  const startCameraScanner = async () => {
    setCameraError(null);
    setIsCameraOpen(true);
    setIsScanningActive(true);

    // Wait for DOM container
    setTimeout(async () => {
      try {
        if (html5QrcodeRef.current) {
          try {
            await html5QrcodeRef.current.stop();
          } catch {
            // ignore
          }
        }

        const html5Qrcode = new Html5Qrcode(scannerContainerId);
        html5QrcodeRef.current = html5Qrcode;

        await html5Qrcode.start(
          { facingMode: 'environment' },
          {
            fps: 10,
            qrbox: { width: 260, height: 160 },
            aspectRatio: 1.0,
          },
          (decodedText) => {
            handleDecodedCode(decodedText);
          },
          () => {
            // Frame parse error (normal when no barcode in frame)
          }
        );
      } catch (err: any) {
        console.error('Erro ao iniciar câmera:', err);
        setCameraError(
          'Não foi possível acessar a câmera do dispositivo. Verifique as permissões do navegador ou utilize o upload de foto do código de barras.'
        );
        setIsScanningActive(false);
      }
    }, 300);
  };

  const stopCameraScanner = async () => {
    if (html5QrcodeRef.current) {
      try {
        if (html5QrcodeRef.current.isScanning) {
          await html5QrcodeRef.current.stop();
        }
        html5QrcodeRef.current.clear();
      } catch (e) {
        console.warn('Erro ao encerrar scanner:', e);
      }
      html5QrcodeRef.current = null;
    }
    setIsScanningActive(false);
    setIsCameraOpen(false);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setCameraError(null);
      const html5Qrcode = new Html5Qrcode('temp-file-scanner');
      const decodedText = await html5Qrcode.scanFile(file, true);
      handleDecodedCode(decodedText);
    } catch (err) {
      console.error('Erro ao ler foto do código de barras:', err);
      setCameraError('Não foi possível identificar um código de barras válido na imagem enviada.');
    }
  };

  useEffect(() => {
    return () => {
      if (html5QrcodeRef.current && html5QrcodeRef.current.isScanning) {
        html5QrcodeRef.current.stop().catch(() => {});
      }
    };
  }, []);

  return (
    <div className="space-y-2">
      <label className="block text-xs font-bold text-slate-800 flex items-center gap-1.5">
        <ScanLine className="w-3.5 h-3.5 text-amber-600" />
        <span>{label}</span>
      </label>

      {/* Success Badge Banner */}
      {scannedFeedback && (
        <div className="p-2.5 bg-emerald-50 border border-emerald-300 rounded-xl text-xs font-bold text-emerald-800 flex items-center gap-2 animate-in fade-in duration-200">
          <Sparkles className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{scannedFeedback}</span>
        </div>
      )}

      {/* Search Input Box */}
      <div className="relative">
        <div className="flex items-center bg-white rounded-xl border border-slate-300 focus-within:border-amber-500 focus-within:ring-2 focus-within:ring-amber-500/20 shadow-xs overflow-hidden">
          <div className="pl-3 text-slate-400">
            <Search className="w-4 h-4" />
          </div>

          <input
            type="text"
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setIsDropdownOpen(true);
            }}
            onFocus={() => setIsDropdownOpen(true)}
            placeholder={placeholder}
            className="w-full text-xs font-semibold p-2.5 pl-2 text-slate-900 bg-transparent focus:outline-none"
          />

          {searchTerm && (
            <button
              type="button"
              onClick={() => setSearchTerm('')}
              className="p-2 text-slate-400 hover:text-slate-600"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}

          <button
            type="button"
            onClick={startCameraScanner}
            title="Abrir Câmera de Celular/Webcam"
            className="p-2.5 bg-slate-100 hover:bg-amber-100 text-slate-700 hover:text-amber-800 border-l border-slate-200 transition-colors flex items-center gap-1 text-[11px] font-bold shrink-0 cursor-pointer"
          >
            <Camera className="w-4 h-4 text-amber-600" />
            <span className="hidden sm:inline">Ler GTIN</span>
          </button>
        </div>

        {/* Dropdown Options List */}
        {isDropdownOpen && (
          <div className="absolute z-50 left-0 right-0 mt-1 max-h-60 overflow-y-auto bg-white rounded-2xl border border-slate-200 shadow-xl divide-y divide-slate-100 animate-in fade-in duration-150">
            {filteredProducts.length === 0 ? (
              <div className="p-4 text-center text-xs text-slate-500">
                Nenhum produto encontrado com GTIN/SKU/Nome matching "<strong>{searchTerm}</strong>".
              </div>
            ) : (
              filteredProducts.map((prod) => {
                const isSelected = prod.id === selectedProductId;
                return (
                  <button
                    key={prod.id}
                    type="button"
                    onClick={() => {
                      onSelectProduct(prod);
                      setIsDropdownOpen(false);
                      setSearchTerm('');
                    }}
                    className={`w-full text-left p-3 hover:bg-amber-50/70 transition-colors flex items-center justify-between gap-2 cursor-pointer ${
                      isSelected ? 'bg-amber-50/90 font-bold border-l-4 border-amber-500' : ''
                    }`}
                  >
                    <div className="space-y-0.5 min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-900 truncate">{prod.name}</span>
                        {isSelected && <Check className="w-3.5 h-3.5 text-amber-600 shrink-0" />}
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-[10px] text-slate-500">
                        <span>
                          GTIN/EAN: <strong className="text-slate-700">{prod.codeEAN || 'Sem GTIN'}</strong>
                        </span>
                        <span>•</span>
                        <span>
                          SKU: <strong className="text-slate-700">{prod.sku}</strong>
                        </span>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="text-[10px] block font-bold text-slate-500">
                        Loja: <strong className="text-amber-700">{prod.stockLoja}</strong> | Dep: <strong className="text-sky-800">{prod.stockDeposito}</strong>
                      </span>
                      <span className="text-xs font-black text-emerald-700">
                        {formatCurrency(prod.sellPrice)}
                      </span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* Currently Selected Product Details Pill */}
      {selectedProduct && (
        <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200 flex items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-2 bg-amber-100 text-amber-800 rounded-xl shrink-0">
              <Package className="w-4 h-4" />
            </div>
            <div className="truncate">
              <p className="font-extrabold text-slate-900 truncate">{selectedProduct.name}</p>
              <p className="text-[10px] text-slate-500 truncate">
                GTIN: <strong>{selectedProduct.codeEAN || 'N/A'}</strong> • SKU: <strong>{selectedProduct.sku}</strong>
              </p>
            </div>
          </div>

          <div className="text-right shrink-0">
            <span className="text-[10px] font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-md block">
              Preço: {formatCurrency(selectedProduct.sellPrice)}
            </span>
          </div>
        </div>
      )}

      {/* Camera Scanner Modal Overlay */}
      {isCameraOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl max-w-md w-full overflow-hidden shadow-2xl border border-slate-700 flex flex-col">
            
            {/* Header */}
            <div className="bg-slate-900 p-4 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-amber-500/20 text-amber-400 rounded-xl border border-amber-500/30">
                  <Camera className="w-5 h-5 animate-pulse" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-white">Leitor de Barcode / GTIN</h3>
                  <p className="text-[10px] text-slate-400">Aproxime o código de barras da câmera</p>
                </div>
              </div>

              <button
                type="button"
                onClick={stopCameraScanner}
                className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body Scanner Box */}
            <div className="p-4 bg-slate-900 flex-1 flex flex-col items-center justify-center relative min-h-[280px]">
              {cameraError ? (
                <div className="p-4 bg-rose-950/80 border border-rose-700/80 rounded-2xl text-center space-y-3 max-w-xs text-rose-200">
                  <AlertCircle className="w-8 h-8 text-rose-400 mx-auto" />
                  <p className="text-xs font-semibold">{cameraError}</p>
                  
                  <div className="pt-2 flex flex-col gap-2">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-extrabold rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Upload className="w-4 h-4" />
                      <span>Enviar Foto do Código</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="w-full space-y-3">
                  <div className="relative w-full rounded-2xl overflow-hidden border-2 border-amber-500/60 shadow-inner bg-black">
                    <div id={scannerContainerId} className="w-full min-h-[240px]" />
                  </div>
                  <p className="text-[11px] text-slate-400 text-center font-medium">
                    Centralize o código GTIN (EAN-13, EAN-8, Code128) dentro da área em destaque.
                  </p>
                </div>
              )}

              {/* Hidden file input for photo upload fallback */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleFileUpload}
                className="hidden"
              />
              <div id="temp-file-scanner" className="hidden" />
            </div>

            {/* Footer */}
            <div className="p-3 bg-slate-100 border-t border-slate-200 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-1.5 text-xs font-bold text-slate-700 hover:text-slate-900 py-2 px-3 rounded-xl bg-white border border-slate-200 shadow-2xs"
              >
                <Upload className="w-3.5 h-3.5 text-amber-600" />
                <span>Usar Foto / Galeria</span>
              </button>

              <button
                type="button"
                onClick={stopCameraScanner}
                className="py-2 px-4 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-colors"
              >
                Cancelar
              </button>
            </div>

          </div>
        </div>
      )}
    </div>
  );
};
