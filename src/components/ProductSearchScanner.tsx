import React, { useState, useEffect, useRef } from 'react';
import {
  Camera,
  Search,
  X,
  Check,
  ScanLine,
  AlertCircle,
  Upload,
  Sparkles,
  Package,
  RefreshCw,
  HelpCircle,
  VideoOff,
  SwitchCamera,
  Keyboard,
} from 'lucide-react';
import { Html5Qrcode, CameraDevice } from 'html5-qrcode';
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
  const [cameraError, setCameraError] = useState<{ title: string; message: string; isPermissionDenied?: boolean } | null>(null);
  const [scannedFeedback, setScannedFeedback] = useState<string | null>(null);
  const [isStartingScanner, setIsStartingScanner] = useState(false);
  const [availableCameras, setAvailableCameras] = useState<CameraDevice[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>('');

  const html5QrcodeRef = useRef<Html5Qrcode | null>(null);
  const scannerContainerId = 'reader-barcode-scanner';
  const fileInputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const selectedProduct = products.find((p) => p.id === selectedProductId);

  // Filter products by GTIN, SKU or Description/Name
  const filteredProducts = products
    .filter((p) => {
      if (!searchTerm.trim()) return true;
      const term = searchTerm.toLowerCase().trim();
      const ean = (p.ean || p.codeEAN || '').toLowerCase();
      const sku = (p.sku || '').toLowerCase();
      const name = (p.name || '').toLowerCase();
      return ean.includes(term) || sku.includes(term) || name.includes(term);
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));

  // Handle scanned code (from camera or image)
  const handleDecodedCode = (rawCode: string) => {
    const code = rawCode.trim();
    if (!code) return;

    // Search exact match by GTIN/EAN, SKU, or ID
    const found = products.find(
      (p) =>
        (p.ean && p.ean.trim() === code) ||
        (p.codeEAN && p.codeEAN.trim() === code) ||
        (p.sku && p.sku.trim() === code) ||
        p.id === code ||
        p.name.toLowerCase().includes(code.toLowerCase())
    );

    if (found) {
      onSelectProduct(found);
      setSearchTerm('');
      setScannedFeedback(`✓ Produto localizado por GTIN/Código: "${found.name}" (GTIN: ${found.ean || found.codeEAN || 'S/N'})`);
      stopCameraScanner();
      setIsCameraOpen(false);
      setTimeout(() => setScannedFeedback(null), 4000);
    } else {
      setCameraError({
        title: 'Produto Não Encontrado',
        message: `Código "${code}" lido com sucesso, porém nenhum produto com este GTIN/SKU está cadastrado no sistema.`,
      });
    }
  };

  const stopCameraScanner = async () => {
    if (html5QrcodeRef.current) {
      try {
        if (html5QrcodeRef.current.isScanning) {
          await html5QrcodeRef.current.stop();
        }
        html5QrcodeRef.current.clear();
      } catch (e) {
        // Silently ignore scanner stop errors
      }
      html5QrcodeRef.current = null;
    }
    setIsStartingScanner(false);
    setIsCameraOpen(false);
  };

  const startCameraScanner = async (overrideCameraId?: string) => {
    setCameraError(null);
    setIsCameraOpen(true);
    setIsStartingScanner(true);

    // Give DOM time to mount the container element
    setTimeout(async () => {
      try {
        if (html5QrcodeRef.current) {
          try {
            if (html5QrcodeRef.current.isScanning) {
              await html5QrcodeRef.current.stop();
            }
            html5QrcodeRef.current.clear();
          } catch {
            // ignore
          }
          html5QrcodeRef.current = null;
        }

        // Check if mediaDevices is supported in this browser context
        if (!navigator?.mediaDevices?.getUserMedia && !navigator?.mediaDevices?.enumerateDevices) {
          setCameraError({
            title: 'Navegador Sem Suporte a Câmera',
            message: 'O navegador ou ambiente atual não possui suporte direto à captura de vídeo. Utilize o envio de foto ou digite o GTIN.',
          });
          setIsStartingScanner(false);
          return;
        }

        // Check available cameras
        let camerasList: CameraDevice[] = [];
        try {
          camerasList = await Html5Qrcode.getCameras();
          setAvailableCameras(camerasList || []);
        } catch {
          // Camera enumeration might fail if permission hasn't been granted yet
        }

        const html5Qrcode = new Html5Qrcode(scannerContainerId);
        html5QrcodeRef.current = html5Qrcode;

        const targetCameraId = overrideCameraId || selectedCameraId;

        if (targetCameraId) {
          await html5Qrcode.start(
            targetCameraId,
            {
              fps: 10,
              qrbox: { width: 260, height: 160 },
              aspectRatio: 1.0,
            },
            (decodedText) => handleDecodedCode(decodedText),
            () => {}
          );
        } else if (camerasList && camerasList.length > 0) {
          // Prefer back/rear camera on mobile
          const rearCam = camerasList.find((c) =>
            /back|rear|traseira|ambiente|environment|extern/i.test(c.label)
          ) || camerasList[camerasList.length - 1]; // usually back camera is last in list

          setSelectedCameraId(rearCam.id);

          await html5Qrcode.start(
            rearCam.id,
            {
              fps: 10,
              qrbox: { width: 260, height: 160 },
              aspectRatio: 1.0,
            },
            (decodedText) => handleDecodedCode(decodedText),
            () => {}
          );
        } else {
          // Fallback to facingMode constraint
          try {
            await html5Qrcode.start(
              { facingMode: 'environment' },
              {
                fps: 10,
                qrbox: { width: 260, height: 160 },
                aspectRatio: 1.0,
              },
              (decodedText) => handleDecodedCode(decodedText),
              () => {}
            );
          } catch (facingErr: any) {
            // If environment fails (e.g. desktop webcam), fallback to default facingMode
            await html5Qrcode.start(
              { facingMode: 'user' },
              {
                fps: 10,
                qrbox: { width: 260, height: 160 },
                aspectRatio: 1.0,
              },
              (decodedText) => handleDecodedCode(decodedText),
              () => {}
            );
          }
        }

        setIsStartingScanner(false);
      } catch (err: any) {
        setIsStartingScanner(false);
        const errStr = (err?.message || err?.name || String(err)).toLowerCase();

        if (
          errStr.includes('notallowed') ||
          errStr.includes('permission') ||
          errStr.includes('denied') ||
          err?.name === 'NotAllowedError'
        ) {
          setCameraError({
            title: 'Permissão de Câmera Negada',
            message:
              'O navegador bloqueou o acesso à câmera. Para utilizar o leitor ao vivo, permita a câmera nas configurações/cadeado da barra de endereço do seu navegador, ou utilize o upload de foto do código.',
            isPermissionDenied: true,
          });
        } else if (
          errStr.includes('notfound') ||
          errStr.includes('requested device not found') ||
          err?.name === 'NotFoundError'
        ) {
          setCameraError({
            title: 'Câmera Não Encontrada',
            message:
              'Nenhum dispositivo de câmera de vídeo foi detectado. Conecte uma webcam ou utilize o envio de foto / digitação manual do GTIN.',
          });
        } else if (
          errStr.includes('notreadable') ||
          errStr.includes('could not start video source') ||
          err?.name === 'NotReadableError'
        ) {
          setCameraError({
            title: 'Câmera Ocupada ou Indisponível',
            message:
              'A câmera pode estar em uso por outro aplicativo ou aba do navegador. Feche outros aplicativos e tente novamente.',
          });
        } else {
          setCameraError({
            title: 'Falha ao Iniciar Câmera',
            message:
              'Não foi possível inicializar a câmera do dispositivo. Você pode enviar uma foto do código de barras da galeria ou digitar o código manualmente.',
          });
        }
      }
    }, 350);
  };

  const handleSwitchCamera = (newCamId: string) => {
    setSelectedCameraId(newCamId);
    startCameraScanner(newCamId);
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
      setCameraError({
        title: 'Código Não Identificado',
        message: 'Não foi possível ler um código de barras nítido na imagem enviada. Tente com uma foto mais próxima e com boa iluminação.',
      });
    } finally {
      if (e.target) {
        e.target.value = '';
      }
    }
  };

  const handleManualSearchClick = () => {
    stopCameraScanner();
    setTimeout(() => {
      searchInputRef.current?.focus();
      setIsDropdownOpen(true);
    }, 200);
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
            ref={searchInputRef}
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
              className="p-2 text-slate-400 hover:text-slate-600 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}

          <button
            type="button"
            onClick={() => startCameraScanner()}
            title="Abrir Leitor de Câmera / Barcode"
            className="p-2.5 bg-slate-100 hover:bg-amber-100 text-slate-700 hover:text-amber-800 border-l border-slate-200 transition-colors flex items-center gap-1.5 text-[11px] font-bold shrink-0 cursor-pointer"
          >
            <Camera className="w-4 h-4 text-amber-600" />
            <span className="hidden sm:inline">Escanear GTIN</span>
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
                          GTIN/EAN: <strong className="text-slate-700">{prod.ean || prod.codeEAN || 'Sem GTIN'}</strong>
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
                GTIN: <strong>{selectedProduct.ean || selectedProduct.codeEAN || 'N/A'}</strong> • SKU: <strong>{selectedProduct.sku}</strong>
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
          <div className="bg-white rounded-3xl max-w-md w-full overflow-hidden shadow-2xl border border-slate-700 flex flex-col max-h-[90vh]">
            
            {/* Header */}
            <div className="bg-slate-900 p-4 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-amber-500/20 text-amber-400 rounded-xl border border-amber-500/30">
                  <Camera className="w-5 h-5 animate-pulse" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-white">Leitor de Código de Barras / GTIN</h3>
                  <p className="text-[10px] text-slate-400">Posicione o código em frente à câmera</p>
                </div>
              </div>

              <button
                type="button"
                onClick={stopCameraScanner}
                className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                title="Fechar Leitor"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Camera Switcher (if multiple cameras available) */}
            {availableCameras.length > 1 && !cameraError && (
              <div className="bg-slate-800 px-4 py-2 flex items-center justify-between text-xs text-slate-300 border-b border-slate-700">
                <span className="flex items-center gap-1.5 font-semibold">
                  <SwitchCamera className="w-3.5 h-3.5 text-amber-400" />
                  Câmera:
                </span>
                <select
                  value={selectedCameraId}
                  onChange={(e) => handleSwitchCamera(e.target.value)}
                  className="bg-slate-900 text-white text-xs rounded-lg px-2 py-1 border border-slate-600 focus:outline-none"
                >
                  {availableCameras.map((cam) => (
                    <option key={cam.id} value={cam.id}>
                      {cam.label || `Câmera ${cam.id.slice(0, 5)}`}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Body Scanner Box */}
            <div className="p-4 bg-slate-900 flex-1 flex flex-col items-center justify-center relative min-h-[300px] overflow-y-auto">
              {isStartingScanner && !cameraError && (
                <div className="absolute inset-0 z-10 bg-slate-900/90 flex flex-col items-center justify-center gap-3">
                  <div className="w-8 h-8 border-3 border-amber-500 border-t-transparent rounded-full animate-spin" />
                  <p className="text-xs font-bold text-amber-300">Iniciando câmera...</p>
                </div>
              )}

              {cameraError ? (
                <div className="p-5 bg-slate-800/95 border border-slate-700 rounded-2xl text-center space-y-4 max-w-sm text-slate-200">
                  <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center mx-auto text-amber-400">
                    {cameraError.isPermissionDenied ? <VideoOff className="w-6 h-6" /> : <AlertCircle className="w-6 h-6 text-amber-400" />}
                  </div>

                  <div className="space-y-1.5">
                    <h4 className="text-sm font-extrabold text-white">{cameraError.title}</h4>
                    <p className="text-xs text-slate-300 leading-relaxed">{cameraError.message}</p>
                  </div>

                  {cameraError.isPermissionDenied && (
                    <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-[11px] text-amber-200 text-left flex items-start gap-2">
                      <HelpCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                      <span>
                        Dica: No Google Chrome ou Edge, clique no ícone ao lado do endereço web e marque <strong>Câmera: Permitir</strong>, depois recarregue ou tente novamente.
                      </span>
                    </div>
                  )}
                  
                  <div className="pt-2 flex flex-col gap-2">
                    <button
                      type="button"
                      onClick={() => startCameraScanner()}
                      className="w-full py-2.5 bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-black rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer shadow-xs"
                    >
                      <RefreshCw className="w-4 h-4" />
                      <span>Tentar Novamente</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full py-2 bg-slate-700 hover:bg-slate-600 text-white text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <Upload className="w-4 h-4 text-amber-400" />
                      <span>Enviar Foto do Código de Barras</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleManualSearchClick}
                      className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer border border-slate-700"
                    >
                      <Keyboard className="w-3.5 h-3.5 text-slate-400" />
                      <span>Digitar GTIN ou Nome Manualmente</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="w-full space-y-3">
                  <div className="relative w-full rounded-2xl overflow-hidden border-2 border-amber-500/60 shadow-inner bg-black">
                    <div id={scannerContainerId} className="w-full min-h-[250px]" />
                  </div>
                  <p className="text-[11px] text-slate-400 text-center font-medium">
                    Enquadre o código de barras (EAN-13, EAN-8, Code 128) no centro do leitor.
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
            <div className="p-3 bg-slate-100 border-t border-slate-200 flex items-center justify-between gap-2 shrink-0">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-1.5 text-xs font-bold text-slate-700 hover:text-slate-900 py-2 px-3 rounded-xl bg-white border border-slate-200 shadow-2xs cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5 text-amber-600" />
                <span>Foto da Galeria</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleManualSearchClick}
                  className="py-2 px-3 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                >
                  Digitar Busca
                </button>

                <button
                  type="button"
                  onClick={stopCameraScanner}
                  className="py-2 px-4 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
                >
                  Fechar
                </button>
              </div>
            </div>

          </div>
        </div>
      )}
    </div>
  );
};
