import React, { useRef, useState } from 'react';
import {
  Cloud,
  CloudCheck,
  Download,
  Upload,
  RefreshCw,
  Database,
  ShieldCheck,
  HardDrive,
  Check,
  Trash2,
  AlertTriangle,
  KeyRound,
  ShieldAlert,
  X,
} from 'lucide-react';
import { useStock } from '../context/StockContext';
import { formatDateTime } from '../utils/inventoryUtils';

export const CloudBackupModal: React.FC = () => {
  const {
    cloudInfo,
    triggerCloudSync,
    exportBackupJSON,
    importBackupJSON,
    wipeSystemData,
    verifyAdminPin,
    products,
    nfEntries,
    transfers,
    checkPermission,
  } = useStock();

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [importStatus, setImportStatus] = useState<string>('');

  if (!checkPermission('canManageBackup')) {
    return (
      <div className="bg-white rounded-3xl p-8 border border-slate-200 shadow-sm text-center max-w-lg mx-auto my-12 space-y-4">
        <div className="w-14 h-14 bg-rose-100 text-rose-600 rounded-2xl flex items-center justify-center mx-auto">
          <ShieldAlert className="w-8 h-8" />
        </div>
        <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight">Acesso Restrito ao Backup</h3>
        <p className="text-xs font-semibold text-slate-600 leading-relaxed">
          Você não possui permissão para acessar o gerenciamento de backups e restauração do sistema.
        </p>
      </div>
    );
  }
  
  // Wipe System State
  const [isWipeModalOpen, setIsWipeModalOpen] = useState<boolean>(false);
  const [adminPin, setAdminPin] = useState<string>('');
  const [pinError, setPinError] = useState<string>('');
  const [wipeSuccess, setWipeSuccess] = useState<string>('');
  const [isWiping, setIsWiping] = useState<boolean>(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        const success = importBackupJSON(content);
        if (success) {
          setImportStatus('Backup restaurado com sucesso!');
          setTimeout(() => setImportStatus(''), 4000);
        } else {
          setImportStatus('Erro: Arquivo de backup JSON inválido.');
        }
      }
    };
    reader.readAsText(file);
  };

  const handleConfirmWipe = async () => {
    if (!adminPin.trim()) {
      setPinError('Informe o PIN de administrador.');
      return;
    }

    try {
      setIsWiping(true);
      setPinError('');
      await wipeSystemData(adminPin.trim());
      setIsWipeModalOpen(false);
      setAdminPin('');
      setPinError('');
      setWipeSuccess('Sistema zerado com sucesso! Todos os dados e registros foram apagados do banco de dados.');
      setTimeout(() => setWipeSuccess(''), 6000);
    } catch (err: any) {
      console.error('Erro ao zerar sistema:', err);
      setPinError(err.message || 'Falha ao zerar dados do sistema no servidor.');
    } finally {
      setIsWiping(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      
      {/* Title Header */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-2xl bg-sky-50 text-sky-600 border border-sky-200">
            <Cloud className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-black text-slate-900">
                Sincronização em Nuvem & Backups Automatizados
              </h2>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 uppercase flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" /> Sincronizado
              </span>
            </div>
            <p className="text-xs text-slate-500">
              Servidor de redundância em tempo real com backup criptografado do banco de dados do estoque Fini
            </p>
          </div>
        </div>

        <button
          onClick={triggerCloudSync}
          className="flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white font-bold px-4 py-2.5 rounded-xl text-xs shadow-md transition-all"
        >
          <RefreshCw className={`w-4 h-4 ${cloudInfo.status === 'syncing' ? 'animate-spin text-emerald-400' : ''}`} />
          <span>Sincronizar Nuvem Agora</span>
        </button>
      </div>

      {/* Cloud Status Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        
        <div className="bg-white p-5 rounded-2xl border border-slate-200">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-[10px] font-bold uppercase">Última Sincronia</span>
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
          </div>
          <p className="text-base font-extrabold text-slate-900">
            {formatDateTime(cloudInfo.lastSyncTime)}
          </p>
          <p className="text-xs text-emerald-600 font-semibold mt-1">
            ✓ Todos os registros estão protegidos na nuvem
          </p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-[10px] font-bold uppercase">Volume de Dados</span>
            <Database className="w-4 h-4 text-sky-600" />
          </div>
          <p className="text-base font-extrabold text-slate-900">
            {cloudInfo.totalRecords} Registros
          </p>
          <p className="text-xs text-slate-500 mt-1">
            {products.length} Produtos • {nfEntries.length} NFs • {transfers.length} Transf.
          </p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-[10px] font-bold uppercase">Tamanho da Redundância</span>
            <HardDrive className="w-4 h-4 text-amber-600" />
          </div>
          <p className="text-base font-extrabold text-slate-900">
            {cloudInfo.backupSizeKB} KB
          </p>
          <p className="text-xs text-slate-500 mt-1">
            Persistência em tempo real + IndexedDB Local
          </p>
        </div>

      </div>

      {/* Backup Actions Box */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-6">
        <div>
          <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-1">
            Ações de Segurança e Backup
          </h3>
          <p className="text-xs text-slate-500">
            Exporte uma cópia física do banco de dados ou restaure um arquivo de backup previamente salvo
          </p>
        </div>

        {importStatus && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs font-bold text-emerald-800 flex items-center gap-2">
            <Check className="w-4 h-4 text-emerald-600" />
            <span>{importStatus}</span>
          </div>
        )}

        {wipeSuccess && (
          <div className="p-3.5 bg-rose-50 border border-rose-300 rounded-xl text-xs font-bold text-rose-900 flex items-center gap-2">
            <Check className="w-4 h-4 text-rose-600" />
            <span>{wipeSuccess}</span>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          
          {/* Download JSON */}
          <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-emerald-100 text-emerald-700">
                <Download className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-xs font-extrabold text-slate-900">
                  Exportar Cópia de Segurança (JSON)
                </h4>
                <p className="text-[11px] text-slate-500">
                  Baixe um arquivo de backup completo com todos os produtos, NFs e movimentações
                </p>
              </div>
            </div>

            <button
              onClick={exportBackupJSON}
              className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 px-4 rounded-xl text-xs transition-colors shadow-xs"
            >
              <Download className="w-4 h-4" />
              <span>Baixar Backup Completo</span>
            </button>
          </div>

          {/* Import JSON */}
          <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-sky-100 text-sky-700">
                <Upload className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-xs font-extrabold text-slate-900">
                  Restaurar de Arquivo JSON
                </h4>
                <p className="text-[11px] text-slate-500">
                  Selecione um arquivo de backup para restaurar o estado do estoque
                </p>
              </div>
            </div>

            <input
              type="file"
              ref={fileInputRef}
              accept=".json"
              onChange={handleFileChange}
              className="hidden"
            />

            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-full flex items-center justify-center gap-2 bg-sky-600 hover:bg-sky-700 text-white font-bold py-2.5 px-4 rounded-xl text-xs transition-colors shadow-xs"
            >
              <Upload className="w-4 h-4" />
              <span>Selecionar Arquivo JSON</span>
            </button>
          </div>

        </div>

        {/* Reset / Wipe System Zone */}
        <div className="pt-5 border-t border-rose-100 bg-rose-50/50 p-5 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-xl bg-rose-100 text-rose-700 shrink-0 mt-0.5">
              <Trash2 className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-black text-rose-900 uppercase tracking-wide">
                Zerar o Sistema (Apagar Todas as Informações)
              </p>
              <p className="text-[11px] text-rose-700 font-medium mt-0.5">
                Exclui permanentemente todos os produtos, movimentações, notas fiscais e histórico.
                Requer confirmação e autorização por PIN do administrador.
              </p>
            </div>
          </div>

          <button
            onClick={() => {
              setPinError('');
              setAdminPin('');
              setIsWipeModalOpen(true);
            }}
            className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-xs shadow-md shadow-rose-950/20 transition-all shrink-0 hover:scale-[1.01]"
          >
            <Trash2 className="w-4 h-4 text-amber-300" />
            <span>Zerar Todo o Sistema</span>
          </button>
        </div>

      </div>

      {/* WIPE SYSTEM CONFIRMATION MODAL WITH ADMIN PIN */}
      {isWipeModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl border border-slate-200 overflow-hidden text-left">
            {/* Modal Header */}
            <div className="bg-rose-600 p-5 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-white/20 text-amber-300">
                  <ShieldAlert className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-black uppercase tracking-tight">
                    Zerar Sistema - Confirmação
                  </h3>
                  <p className="text-[10px] text-rose-100 font-medium">
                    Autorização com PIN de Administrador
                  </p>
                </div>
              </div>

              <button
                onClick={() => setIsWipeModalOpen(false)}
                className="p-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 space-y-4">
              <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-2xl flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                <div className="text-xs text-rose-900 leading-relaxed">
                  <strong>ATENÇÃO EXTREMA:</strong> Você está prestes a <strong>apagar todas as informações</strong> cadastradas no sistema ERP (produtos, estoque, histórico de movimentações, NFs e notificações).
                  <p className="mt-1 font-bold text-rose-700">Esta ação é irreversível.</p>
                </div>
              </div>

              {/* PIN Input */}
              <div className="space-y-2 pt-1">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-extrabold text-slate-800">
                    Digite o PIN de Administrador:
                  </label>
                  <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">
                    PIN Padrão: 2101
                  </span>
                </div>
                <div className="relative">
                  <KeyRound className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                  <input
                    type="password"
                    maxLength={6}
                    placeholder="2101"
                    value={adminPin}
                    onChange={(e) => {
                      setAdminPin(e.target.value);
                      setPinError('');
                    }}
                    autoFocus
                    className="w-full text-base font-mono tracking-widest pl-10 pr-4 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-rose-500 focus:border-rose-500 bg-slate-50 font-black text-slate-900"
                  />
                </div>
                {pinError && (
                  <p className="text-xs font-bold text-rose-600 flex items-center gap-1 mt-1">
                    <ShieldAlert className="w-3.5 h-3.5" />
                    <span>{pinError}</span>
                  </p>
                )}
              </div>

              {/* Action Buttons */}
              <div className="pt-3 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsWipeModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 font-bold text-xs hover:bg-slate-100 transition-colors"
                >
                  Cancelar
                </button>

                <button
                  type="button"
                  onClick={handleConfirmWipe}
                  disabled={!adminPin.trim() || isWiping}
                  className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-black text-xs shadow-md shadow-rose-900/30 transition-all flex items-center gap-2"
                >
                  <Trash2 className={`w-4 h-4 ${isWiping ? 'animate-spin' : ''}`} />
                  <span>{isWiping ? 'Apagando banco de dados...' : 'Confirmar e Zerar Sistema'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

