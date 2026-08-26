import React, { useState, useEffect, useRef } from 'react';
import { Lock, UserCheck, AlertCircle, KeyRound } from 'lucide-react';
import { UserProfile } from '../types';
import { useStock } from '../context/StockContext';
import { UserAvatar } from './UserAvatar';

interface PinAuthModalProps {
  isOpen?: boolean;
  users?: UserProfile[];
  currentUser?: UserProfile;
  onAuthenticate?: (user: UserProfile, pin: string) => boolean;
  onCancel?: () => void;
  isSwitchMode?: boolean;
}

export const PinAuthModal: React.FC<PinAuthModalProps> = (props) => {
  const stockContext = useStock();

  const isOpen = props.isOpen !== undefined ? props.isOpen : stockContext.isAuthModalOpen;
  const users = props.users || stockContext.users;
  const currentUser = props.currentUser || stockContext.currentUser;
  const onAuthenticate = props.onAuthenticate || ((u, pin) => stockContext.loginWithPin(u.id, pin));
  const onCancel = props.onCancel || stockContext.closeAuthModal;
  const isSwitchMode = props.isSwitchMode !== undefined ? props.isSwitchMode : stockContext.isAuthenticated;

  const [selectedUser, setSelectedUser] = useState<UserProfile>(currentUser || users[0]);
  const [pin, setPin] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isShaking, setIsShaking] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (currentUser) {
      setSelectedUser(currentUser);
    } else if (users.length > 0) {
      setSelectedUser(users[0]);
    }
    setPin('');
    setErrorMessage(null);
  }, [currentUser, users, isOpen]);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    }
  }, [isOpen, selectedUser]);

  if (!isOpen) return null;

  const verifyPin = (pinToTest: string) => {
    const success = onAuthenticate(selectedUser, pinToTest);
    if (!success) {
      setErrorMessage('PIN incorreto. Tente novamente.');
      setIsShaking(true);
      setTimeout(() => setIsShaking(false), 500);
      setPin('');
      inputRef.current?.focus();
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pin.length === 4) {
      verifyPin(pin);
    }
  };

  const getRoleLabel = (role: string) => {
    switch (role) {
      case 'admin':
        return 'Administrador (Acesso Total)';
      case 'gerente_loja':
        return 'Gerente da Loja';
      case 'operador_deposito':
        return 'Operador do Depósito';
      case 'caixa':
        return 'Operador de Caixa / Vendas';
      default:
        return 'Usuário GummyStock';
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 focus:outline-none animate-fadeIn">
      <div
        className={`w-full max-w-md bg-slate-900 border border-slate-800 text-white rounded-3xl shadow-2xl overflow-hidden transition-all duration-300 ${
          isShaking ? 'animate-bounce' : ''
        }`}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-rose-900 via-slate-900 to-rose-950 p-6 text-center border-b border-slate-800 relative">
          {isSwitchMode && onCancel && (
            <button
              onClick={onCancel}
              className="absolute top-4 right-4 text-slate-400 hover:text-white text-xs font-semibold px-2 py-1 bg-slate-800 rounded-lg hover:bg-slate-700 transition-colors"
            >
              Cancelar
            </button>
          )}

          <div className="w-14 h-14 bg-rose-600/20 text-rose-400 border border-rose-500/30 rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-inner">
            <Lock className="w-7 h-7" />
          </div>

          <h2 className="text-xl font-black tracking-tight">GummyStock</h2>
          <p className="text-xs text-rose-300 font-medium mt-0.5">
            {isSwitchMode ? 'Troca de Usuário - Controle de Acesso' : 'Autenticação por PIN de Segurança'}
          </p>
        </div>

        <div className="p-6 space-y-6">
          {/* User Selection List */}
          <div className="space-y-2">
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 text-left">
              Selecione o Usuário Operador:
            </label>
            <div className="grid grid-cols-2 gap-2">
              {users.map((u) => {
                const isSelected = selectedUser.id === u.id;
                return (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => {
                      setSelectedUser(u);
                      setPin('');
                      setErrorMessage(null);
                    }}
                    className={`p-2.5 rounded-2xl border text-left flex items-center gap-2.5 transition-all ${
                      isSelected
                        ? 'bg-rose-950/60 border-rose-500/80 text-white shadow-md ring-2 ring-rose-500/30'
                        : 'bg-slate-800/60 border-slate-700/60 text-slate-300 hover:bg-slate-800 hover:text-white'
                    }`}
                  >
                    <UserAvatar
                      avatarUrl={u.avatarUrl}
                      name={u.name}
                      className="w-9 h-9 rounded-xl shadow-xs"
                      iconClassName="w-4 h-4"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold truncate leading-tight">{u.name}</p>
                      <p className="text-[10px] text-slate-400 truncate">
                        {u.role === 'admin' ? 'Admin' : u.role === 'gerente_loja' ? 'Gerente' : u.role === 'operador_deposito' ? 'Depósito' : 'Caixa'}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* User Details & Role */}
          <div className="bg-slate-950/60 rounded-2xl p-3 border border-slate-800/80 flex items-center gap-3">
            <UserAvatar
              avatarUrl={selectedUser.avatarUrl}
              name={selectedUser.name}
              className="w-10 h-10 rounded-xl border border-slate-700"
            />
            <div className="text-left min-w-0 flex-1">
              <p className="text-xs font-black text-white truncate">{selectedUser.name}</p>
              <p className="text-[11px] text-rose-400 font-semibold">{getRoleLabel(selectedUser.role)}</p>
            </div>
          </div>

          {/* Direct PIN Input Form (No virtual keypad grid) */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label className="block text-xs text-slate-300 font-semibold text-center">
                Digite o PIN de 4 dígitos:
              </label>
              
              <div className="relative max-w-xs mx-auto">
                <input
                  ref={inputRef}
                  type="password"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={4}
                  value={pin}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, '').slice(0, 4);
                    setPin(val);
                    setErrorMessage(null);
                    if (val.length === 4) {
                      verifyPin(val);
                    }
                  }}
                  placeholder="••••"
                  className="w-full bg-slate-950 border-2 border-slate-700 focus:border-rose-500 text-center text-2xl tracking-[0.6em] font-black text-white py-3 px-4 rounded-2xl outline-none transition-all placeholder:text-slate-700 placeholder:tracking-normal"
                />
              </div>

              {errorMessage && (
                <div className="flex items-center justify-center gap-1.5 text-rose-400 text-xs font-bold animate-pulse pt-1">
                  <AlertCircle className="w-4 h-4" />
                  <span>{errorMessage}</span>
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={pin.length < 4}
              className="w-full py-3 bg-rose-600 hover:bg-rose-500 disabled:bg-slate-800 disabled:text-slate-500 text-white font-bold rounded-2xl shadow-lg transition-all text-sm flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed"
            >
              <Lock className="w-4 h-4" />
              <span>Confirmar e Entrar</span>
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
