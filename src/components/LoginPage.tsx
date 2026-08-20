import React, { useState } from 'react';
import {
  Lock,
  Mail,
  CheckCircle2,
  AlertCircle,
  LogIn,
  X,
  ShieldCheck,
} from 'lucide-react';
import { useStock } from '../context/StockContext';
import { auth, googleAuthProvider } from '../lib/firebase';
import {
  signInWithEmailAndPassword,
  signInWithPopup,
} from 'firebase/auth';
import { syncUserWithPostgres } from '../utils/apiAuth';

interface LoginPageProps {
  isOpen?: boolean;
  onCancel?: () => void;
  onOpenSaaSModal?: () => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({
  isOpen: propIsOpen,
  onCancel,
}) => {
  const {
    currentUser,
    isAuthenticated,
    isAuthModalOpen,
    closeAuthModal,
  } = useStock();

  const isOpen = propIsOpen !== undefined ? propIsOpen : (!isAuthenticated || isAuthModalOpen);
  const isSwitchMode = isAuthenticated;

  // Form Fields
  const [emailInput, setEmailInput] = useState<string>(currentUser?.email || '');
  const [passwordInput, setPasswordInput] = useState<string>('');

  // Status & Feedback
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isShaking, setIsShaking] = useState(false);

  if (!isOpen) return null;

  const handleGoogleLogin = async () => {
    setErrorMessage(null);
    setSuccessMessage(null);
    setIsLoading(true);

    try {
      const result = await signInWithPopup(auth, googleAuthProvider);
      if (result.user) {
        await syncUserWithPostgres({
          uid: result.user.uid,
          email: result.user.email,
          displayName: result.user.displayName,
        });
        setSuccessMessage(`Autenticado com sucesso via Google!`);
        setTimeout(() => {
          setIsLoading(false);
          closeAuthModal();
        }, 500);
      }
    } catch (err: any) {
      console.error('Erro no login Google:', err);
      setIsLoading(false);
      setErrorMessage(err.message || 'Falha ao autenticar com a conta Google.');
      setIsShaking(true);
      setTimeout(() => setIsShaking(false), 500);
    }
  };

  const handleEmailPasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    const email = emailInput.trim();
    const password = passwordInput.trim();

    if (!email) {
      setErrorMessage('Informe seu e-mail de acesso.');
      return;
    }

    if (!password) {
      setErrorMessage('Informe sua senha.');
      return;
    }

    setIsLoading(true);

    try {
      const userCred = await signInWithEmailAndPassword(auth, email, password);
      if (userCred.user) {
        await syncUserWithPostgres({
          uid: userCred.user.uid,
          email: userCred.user.email,
          displayName: userCred.user.displayName,
        });
        setSuccessMessage(`Bem-vindo(a)! Login realizado com sucesso.`);
        setIsLoading(false);
        setPasswordInput('');
        setTimeout(() => {
          closeAuthModal();
        }, 400);
      }
    } catch (err: any) {
      console.error('Erro no login por e-mail/senha:', err);
      setIsLoading(false);
      let msg = 'E-mail ou senha incorretos.';
      if (err.code === 'auth/user-not-found') {
        msg = 'Usuário não cadastrado no Firebase Auth.';
      } else if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        msg = 'Senha incorreta.';
      } else if (err.code === 'auth/invalid-email') {
        msg = 'Formato de e-mail inválido.';
      }
      setErrorMessage(msg);
      setIsShaking(true);
      setTimeout(() => setIsShaking(false), 500);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-xl flex items-center justify-center p-4 overflow-y-auto animate-fadeIn">
      <div
        className={`w-full max-w-md bg-slate-900 border border-slate-800 text-white rounded-3xl shadow-2xl overflow-hidden my-auto transition-all duration-300 ${
          isShaking ? 'animate-bounce' : ''
        }`}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-900 via-slate-850 to-slate-900 p-6 border-b border-slate-800/80 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-rose-600 text-white rounded-2xl flex items-center justify-center font-black text-xl shadow-md">
              F
            </div>
            <div>
              <h1 className="text-xl font-black text-white tracking-tight">FINI ERP</h1>
              <p className="text-xs text-slate-400 font-medium">Autenticação Segura Firebase</p>
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

        <div className="p-6 space-y-5">
          {/* Botão Google Login */}
          <button
            type="button"
            onClick={handleGoogleLogin}
            disabled={isLoading}
            className="w-full py-3.5 px-4 bg-white hover:bg-slate-100 disabled:bg-slate-300 text-slate-900 font-bold rounded-2xl shadow-md transition-all text-xs sm:text-sm flex items-center justify-center gap-3 cursor-pointer border border-slate-200"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"
              />
              <path
                fill="#34A853"
                d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.35 24 12 24z"
              />
              <path
                fill="#FBBC05"
                d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.99 0 12s.45 3.82 1.25 5.42l4.03-3.15z"
              />
              <path
                fill="#EA4335"
                d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.35 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
              />
            </svg>
            <span>Entrar com Conta Google</span>
          </button>

          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-slate-800" />
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              ou com e-mail corporativo
            </span>
            <div className="flex-1 h-px bg-slate-800" />
          </div>

          {/* Formulário E-mail / Senha */}
          <form onSubmit={handleEmailPasswordLogin} className="space-y-4">
            {/* CAMPO 1: E-mail */}
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1.5 uppercase tracking-wider flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5 text-rose-500" />
                <span>E-mail</span>
              </label>
              <input
                type="email"
                required
                value={emailInput}
                onChange={(e) => {
                  setEmailInput(e.target.value);
                  setErrorMessage(null);
                }}
                placeholder="seu.email@finifriburgo.com.br"
                className="w-full bg-slate-950 border border-slate-700 focus:border-rose-500 text-white text-xs sm:text-sm py-3 px-3.5 rounded-2xl outline-none font-medium transition-all placeholder:text-slate-600"
              />
            </div>

            {/* CAMPO 2: Senha */}
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1.5 uppercase tracking-wider flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-rose-500" />
                <span>Senha</span>
              </label>
              <input
                type="password"
                required
                value={passwordInput}
                onChange={(e) => {
                  setPasswordInput(e.target.value);
                  setErrorMessage(null);
                }}
                placeholder="••••••••"
                className="w-full bg-slate-950 border border-slate-700 focus:border-rose-500 text-white text-xs sm:text-sm py-3 px-3.5 rounded-2xl outline-none transition-all placeholder:text-slate-600 font-mono"
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

            {/* Botão de Entrar */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3.5 bg-rose-600 hover:bg-rose-500 disabled:bg-slate-800 text-white font-bold rounded-2xl shadow-lg transition-all text-xs sm:text-sm flex items-center justify-center gap-2 cursor-pointer mt-2"
            >
              <LogIn className="w-4 h-4" />
              <span>{isLoading ? 'Autenticando...' : 'Entrar com E-mail'}</span>
            </button>
          </form>

          {/* Segurança Banner */}
          <div className="p-3 bg-slate-950/60 rounded-2xl border border-slate-800/80 flex items-center gap-2.5 text-[11px] text-slate-400">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>Autenticação protegida via Firebase Auth e RBAC no PostgreSQL.</span>
          </div>
        </div>
      </div>
    </div>
  );
};
