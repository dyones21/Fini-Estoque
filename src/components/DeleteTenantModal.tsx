/**
 * NOTA ARQUITETURAL - EXPANSÃO SAAS MULTI-TENANT:
 * Este componente (DeleteTenantModal) está preservado para a fase futura de expansão SaaS.
 * Na fase de lançamento atual, o sistema é Single-Tenant ("Fini Nova Friburgo").
 */

import React, { useState } from 'react';
import { AlertTriangle, Lock, ShieldAlert, Trash2, X, KeyRound, Building2 } from 'lucide-react';
import { Tenant, UserProfile } from '../types';

interface DeleteTenantModalProps {
  isOpen: boolean;
  tenant: Tenant | null;
  currentUser: UserProfile | null;
  onClose: () => void;
  onConfirmDelete: (tenantId: string) => void;
}

export const DeleteTenantModal: React.FC<DeleteTenantModalProps> = ({
  isOpen,
  tenant,
  currentUser,
  onClose,
  onConfirmDelete,
}) => {
  const [pinInput, setPinInput] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [confirmText, setConfirmText] = useState('');

  if (!isOpen || !tenant) return null;

  const handleClose = () => {
    setPinInput('');
    setErrorMsg('');
    setConfirmText('');
    onClose();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (tenant.isMaster) {
      setErrorMsg('A empresa Matriz/Master não pode ser excluída do sistema.');
      return;
    }

    const expectedPin = (currentUser?.pin || '').trim();
    if (!expectedPin || pinInput.trim() !== expectedPin) {
      setErrorMsg(`PIN de autorização incorreto! Verifique o PIN cadastrado para ${currentUser?.name || 'sua conta'}.`);
      return;
    }

    if (confirmText.trim().toUpperCase() !== 'EXCLUIR') {
      setErrorMsg('Digite a palavra EXCLUIR para confirmar a ação.');
      return;
    }

    // Execute deletion
    onConfirmDelete(tenant.id);
    handleClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4 animate-fadeIn">
      <div className="w-full max-w-md bg-slate-900 border border-rose-900/60 rounded-3xl shadow-2xl overflow-hidden text-white relative my-auto">
        
        {/* Header */}
        <div className="bg-gradient-to-r from-rose-950 via-slate-900 to-slate-900 p-5 border-b border-rose-900/40 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-rose-500/20 border border-rose-500/40 rounded-2xl flex items-center justify-center text-rose-400 shrink-0">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-black text-rose-300 uppercase tracking-wide">
                Excluir Empresa SaaS
              </h3>
              <p className="text-[11px] text-slate-400">
                Ação Crítica com Confirmação por PIN
              </p>
            </div>
          </div>

          <button
            onClick={handleClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          
          {/* Target Company Box */}
          <div className="bg-slate-950 border border-slate-800 p-4 rounded-2xl space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                <Building2 className="w-3 h-3 text-purple-400" />
                Empresa Alvo
              </span>
              <span className="text-[10px] font-mono font-bold text-rose-400 bg-rose-950/80 px-2 py-0.5 rounded border border-rose-900/50">
                {tenant.code}
              </span>
            </div>
            <p className="text-base font-black text-white">{tenant.name}</p>
            <p className="text-xs text-slate-400">
              CNPJ: {tenant.cnpj || 'Não informado'} • Cidade: {tenant.city || 'UF'}/{tenant.state || 'UF'}
            </p>
          </div>

          {/* Alert Message */}
          <div className="p-3 bg-rose-950/40 border border-rose-900/50 rounded-2xl flex items-start gap-2.5 text-xs text-rose-200">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <p className="leading-relaxed">
              <strong className="text-rose-300">Atenção:</strong> Esta ação exclui permanentemente o cadastro da empresa no banco de dados Firestore.
            </p>
          </div>

          {/* Validation Error */}
          {errorMsg && (
            <div className="p-3 bg-rose-500/20 border border-rose-500/40 rounded-2xl text-xs text-rose-300 font-bold flex items-center gap-2 animate-shake">
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Step 1: Confirmation Word */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-300 block">
              1. Para confirmar, digite <span className="text-rose-400 font-black">EXCLUIR</span>:
            </label>
            <input
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="Digite EXCLUIR"
              required
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-rose-500 font-bold tracking-wider"
            />
          </div>

          {/* Step 2: Security PIN */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-300 block flex items-center gap-1.5">
              <KeyRound className="w-3.5 h-3.5 text-amber-400" />
              <span>2. Insira seu PIN de Administrador (4 dígitos):</span>
            </label>
            <div className="relative">
              <input
                type="password"
                maxLength={4}
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value.replace(/\D/g, ''))}
                placeholder="••••"
                required
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-center font-mono text-base tracking-[0.5em] text-amber-400 font-bold focus:outline-none focus:border-amber-500"
              />
              <Lock className="w-4 h-4 text-slate-500 absolute right-3.5 top-1/2 -translate-y-1/2" />
            </div>
            <p className="text-[10px] text-slate-500">
              Autorização do usuário: <strong className="text-slate-300">{currentUser?.name || 'Administrador'}</strong>
            </p>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-2.5 pt-2">
            <button
              type="button"
              onClick={handleClose}
              className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl text-xs transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-5 py-2.5 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-xl text-xs shadow-lg shadow-rose-950/60 flex items-center gap-2 transition-all cursor-pointer"
            >
              <Trash2 className="w-4 h-4" />
              <span>Confirmar Exclusão</span>
            </button>
          </div>

        </form>
      </div>
    </div>
  );
};
