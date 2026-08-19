import React, { useState, useEffect, useRef } from 'react';
import {
  Lock,
  User,
  Building2,
  CheckCircle2,
  AlertCircle,
  LogIn,
  X,
  KeyRound,
} from 'lucide-react';
import { UserProfile, Tenant } from '../types';
import { useStock } from '../context/StockContext';
import { auth } from '../lib/firebase';
import { signInWithEmailAndPassword } from 'firebase/auth';

interface LoginPageProps {
  isOpen?: boolean;
  onCancel?: () => void;
  onOpenSaaSModal?: () => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({
  isOpen: propIsOpen,
  onCancel,
  onOpenSaaSModal,
}) => {
  const {
    users,
    allUsers,
    currentUser,
    isAuthenticated,
    isAuthModalOpen,
    loginWithPin,
    closeAuthModal,
    tenants,
    currentTenant,
    setCurrentTenantId,
  } = useStock();

  const isOpen = propIsOpen !== undefined ? propIsOpen : (!isAuthenticated || isAuthModalOpen);
  const isSwitchMode = isAuthenticated;

  // Form Fields
  const [companyInput, setCompanyInput] = useState<string>(currentTenant?.code || '');
  const [userInput, setUserInput] = useState<string>(currentUser?.email || currentUser?.name || '');
  const [passwordInput, setPasswordInput] = useState<string>('');

  // Status & Feedback
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isShaking, setIsShaking] = useState(false);

  const companyRef = useRef<HTMLInputElement>(null);
  const userRef = useRef<HTMLInputElement>(null);
  const passRef = useRef<HTMLInputElement>(null);

  // Sync default values when context changes
  useEffect(() => {
    if (currentTenant) {
      setCompanyInput(currentTenant.code);
    }
  }, [currentTenant]);

  // Dynamic Company Matching
  const matchedTenant = React.useMemo(() => {
    if (!companyInput.trim()) return null;
    const query = companyInput.trim().toLowerCase();
    return tenants.find(
      (t) =>
        t.code.toLowerCase() === query ||
        t.name.toLowerCase() === query ||
        t.id.toLowerCase() === query ||
        (query === 'master' && (t.isMaster || t.code.toUpperCase() === 'MASTER'))
    ) || tenants.find(
      (t) =>
        t.code.toLowerCase().includes(query) ||
        t.name.toLowerCase().includes(query)
    );
  }, [companyInput, tenants]);

  // Focus company field on load
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        if (!companyInput) {
          companyRef.current?.focus();
        } else {
          userRef.current?.focus();
        }
      }, 150);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    const compText = companyInput.trim();
    const userText = userInput.trim();
    const passText = passwordInput.trim();

    if (!compText) {
      setErrorMessage('Informe o código da empresa.');
      companyRef.current?.focus();
      return;
    }

    if (!userText) {
      setErrorMessage('Informe o usuário ou e-mail.');
      userRef.current?.focus();
      return;
    }

    if (!passText) {
      setErrorMessage('Informe a senha ou PIN.');
      passRef.current?.focus();
      return;
    }

    // 1. Check if user is Super Admin (Master Owner)
    const normalizedUser = userText.toLowerCase();
    const userPool = allUsers && allUsers.length > 0 ? allUsers : users;

    const globalSuperAdmin = userPool.find(
      (u) =>
        u.role === 'super_admin' &&
        (u.email.toLowerCase() === normalizedUser ||
         u.name.toLowerCase().includes(normalizedUser) ||
         u.id.toLowerCase() === normalizedUser)
    );

    let targetTenant = matchedTenant;
    if (!targetTenant) {
      // Fallback search
      targetTenant = tenants.find((t) =>
        t.code.toLowerCase() === compText.toLowerCase() ||
        t.name.toLowerCase().includes(compText.toLowerCase())
      );
    }

    // If global super admin is logging in, auto-bind to master or first tenant if not found
    if (!targetTenant && globalSuperAdmin) {
      targetTenant = tenants.find((t) => t.isMaster) || tenants[0];
    }

    if (!targetTenant) {
      setErrorMessage('Empresa não localizada. Verifique o nome/código digitado.');
      setIsShaking(true);
      setTimeout(() => setIsShaking(false), 500);
      return;
    }

    setIsLoading(true);

    // 2. Set Active Tenant
    setCurrentTenantId(targetTenant.id);

    // 3. Match User within Tenant (or Master Admin)
    const tenantEligibleUsers = userPool.filter((u) => {
      if (!u.tenantIds || u.tenantIds.length === 0 || u.tenantIds.includes('all')) return true;
      return u.tenantIds.includes(targetTenant!.id);
    });

    const targetUser = globalSuperAdmin || tenantEligibleUsers.find(
      (u) =>
        u.email.toLowerCase() === normalizedUser ||
        u.name.toLowerCase().includes(normalizedUser) ||
        u.id.toLowerCase() === normalizedUser
    ) || userPool.find(
      (u) =>
        u.email.toLowerCase() === normalizedUser ||
        u.name.toLowerCase().includes(normalizedUser)
    );

    if (!targetUser) {
      setIsLoading(false);
      setErrorMessage('Usuário não encontrado para esta empresa.');
      setIsShaking(true);
      setTimeout(() => setIsShaking(false), 500);
      return;
    }

    // 4. Verify Credentials (PIN or Password)
    if (passText === targetUser.pin) {
      const success = loginWithPin(targetUser.id, targetUser.pin);
      if (success) {
        setSuccessMessage(`Bem-vindo(a), ${targetUser.name}!`);
        setIsLoading(false);
        setPasswordInput('');
        setTimeout(() => {
          closeAuthModal();
        }, 400);
        return;
      }
    }

    // Attempt Firebase Email Auth fallback
    try {
      if (targetUser.email) {
        await signInWithEmailAndPassword(auth, targetUser.email, passText);
        loginWithPin(targetUser.id, targetUser.pin);
        setSuccessMessage(`Bem-vindo(a), ${targetUser.name}!`);
        setIsLoading(false);
        setPasswordInput('');
        setTimeout(() => {
          closeAuthModal();
        }, 400);
        return;
      }
    } catch (err) {
      // Ignore firebase error and proceed to pin check error
    }

    setIsLoading(false);
    setErrorMessage('Senha ou PIN incorreto.');
    setIsShaking(true);
    setTimeout(() => setIsShaking(false), 500);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-xl flex items-center justify-center p-4 overflow-y-auto animate-fadeIn">
      <div
        className={`w-full max-w-md bg-slate-900 border border-slate-800 text-white rounded-3xl shadow-2xl overflow-hidden my-auto transition-all duration-300 ${
          isShaking ? 'animate-bounce' : ''
        }`}
      >
        {/* Header Limpo */}
        <div className="bg-gradient-to-r from-slate-900 via-slate-850 to-slate-900 p-6 border-b border-slate-800/80 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-rose-600 text-white rounded-2xl flex items-center justify-center font-black text-xl shadow-md">
              F
            </div>
            <div>
              <h1 className="text-xl font-black text-white tracking-tight">FINI ERP</h1>
              <p className="text-xs text-slate-400 font-medium">Acesso ao Sistema</p>
            </div>
          </div>

          {isSwitchMode && (
            <button
              onClick={onCancel || closeAuthModal}
              className="flex items-center gap-1 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl text-xs font-bold transition-colors cursor-pointer border border-slate-700/60"
            >
              <X className="w-4 h-4" />
              <span>Voltar</span>
            </button>
          )}
        </div>

        {/* Formulário de Acesso Direto */}
        <form onSubmit={handleLoginSubmit} className="p-6 space-y-4">
          
          {/* CAMPO 1: Nome/Código da Empresa */}
          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1.5 uppercase tracking-wider flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-rose-500" />
                <span>Empresa / Unidade</span>
              </span>
              {matchedTenant && (
                <span className="text-[10px] text-emerald-400 font-bold flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" />
                  Localizada
                </span>
              )}
            </label>
            <input
              ref={companyRef}
              type="text"
              required
              value={companyInput}
              onChange={(e) => {
                setCompanyInput(e.target.value);
                setErrorMessage(null);
              }}
              placeholder="Digite o código ou nome da empresa..."
              className="w-full bg-slate-950 border border-slate-700 focus:border-rose-500 text-white text-xs sm:text-sm py-3 px-3.5 rounded-2xl outline-none font-medium transition-all placeholder:text-slate-600"
            />
          </div>

          {/* CAMPO 2: Usuário / E-mail */}
          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1.5 uppercase tracking-wider flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-rose-500" />
              <span>Usuário ou E-mail</span>
            </label>
            <input
              ref={userRef}
              type="text"
              required
              value={userInput}
              onChange={(e) => {
                setUserInput(e.target.value);
                setErrorMessage(null);
              }}
              placeholder="Digite seu e-mail ou nome de usuário..."
              className="w-full bg-slate-950 border border-slate-700 focus:border-rose-500 text-white text-xs sm:text-sm py-3 px-3.5 rounded-2xl outline-none font-medium transition-all placeholder:text-slate-600"
            />
          </div>

          {/* CAMPO 3: Senha ou PIN */}
          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1.5 uppercase tracking-wider flex items-center gap-1.5">
              <KeyRound className="w-3.5 h-3.5 text-rose-500" />
              <span>Senha ou PIN</span>
            </label>
            <input
              ref={passRef}
              type="password"
              required
              value={passwordInput}
              onChange={(e) => {
                setPasswordInput(e.target.value);
                setErrorMessage(null);
              }}
              placeholder="••••••••"
              className="w-full bg-slate-950 border border-slate-700 focus:border-rose-500 text-white text-xs sm:text-sm py-3 px-3.5 rounded-2xl outline-none transition-all placeholder:text-slate-600 font-mono tracking-widest"
            />
          </div>

          {/* Mensagens de Feedback */}
          {errorMessage && (
            <div className="p-3 bg-rose-950/80 border border-rose-800 text-rose-300 text-xs font-bold rounded-2xl flex items-center justify-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {successMessage && (
            <div className="p-3 bg-emerald-950/80 border border-emerald-800 text-emerald-300 text-xs font-bold rounded-2xl flex items-center justify-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{successMessage}</span>
            </div>
          )}

          {/* Botão Principal de Login */}
          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-3.5 bg-rose-600 hover:bg-rose-500 disabled:bg-slate-800 text-white font-bold rounded-2xl shadow-lg transition-all text-xs sm:text-sm flex items-center justify-center gap-2 cursor-pointer mt-2"
          >
            <LogIn className="w-4 h-4" />
            <span>{isLoading ? 'Autenticando...' : 'Entrar no Sistema'}</span>
          </button>
        </form>
      </div>
    </div>
  );
};
