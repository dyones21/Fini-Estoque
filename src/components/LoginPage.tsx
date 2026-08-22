import React, { useState } from 'react';
import {
  ShieldCheck,
  AlertCircle,
  CheckCircle2,
  X,
  Lock,
  KeyRound,
} from 'lucide-react';
import { useStock } from '../context/StockContext';
import { signInWithGoogle, isFirebaseConfigured } from '../lib/firebase';

interface LoginPageProps {
  isOpen?: boolean;
  onCancel?: () => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({
  isOpen: propIsOpen,
  onCancel,
}) => {
  const {
    isAuthenticated,
    isAuthModalOpen,
    closeAuthModal,
  } = useStock();

  const isOpen = propIsOpen !== undefined ? propIsOpen : (!isAuthenticated || isAuthModalOpen);
  const isSwitchMode = isAuthenticated;

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
      if (!isFirebaseConfigured) {
        throw new Error(
          'Configuração do Firebase ausente no ambiente. Por favor, adicione as variáveis VITE_FIREBASE_API_KEY e VITE_FIREBASE_PROJECT_ID no painel de Secrets / Variáveis de Ambiente.'
        );
      }

      setSuccessMessage('Autenticando com sua Conta Google...');
      const user = await signInWithGoogle();

      if (user) {
        setSuccessMessage(`Bem-vindo(a), ${user.displayName || user.email}! Acesso autorizado.`);
        setTimeout(() => {
          setIsLoading(false);
          closeAuthModal();
        }, 600);
      }
    } catch (err: any) {
      console.error('Erro ao autenticar com o Google (Firebase):', err);
      setIsLoading(false);

      let msg = 'Falha ao autenticar com a Conta Google. Tente novamente.';
      if (err?.code === 'auth/popup-closed-by-user') {
        msg = 'O popup de login foi fechado antes de concluir a autenticação.';
      } else if (err?.code === 'auth/cancelled-popup-request') {
        msg = 'Solicitação de login cancelada.';
      } else if (err?.code === 'auth/invalid-api-key' || err?.message?.includes('api-key')) {
        msg = 'Chave do Firebase inválida. Verifique o valor de VITE_FIREBASE_API_KEY nas variáveis de ambiente.';
      } else if (err?.message) {
        msg = err.message;
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
              <p className="text-xs text-slate-400 font-medium">Gestão de Estoque & Vendas</p>
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

        <div className="p-8 space-y-6">
          <div className="text-center space-y-2">
            <div className="inline-flex p-3 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 mb-1">
              <Lock className="w-6 h-6" />
            </div>
            <h2 className="text-lg font-bold text-white">Autenticação Obrigatória</h2>
            <p className="text-xs text-slate-400 max-w-xs mx-auto">
              Acesse o sistema com sua conta autorizada para gerenciar estoque, vendas e relatórios.
            </p>
          </div>

          {!isFirebaseConfigured && (
            <div className="p-4 bg-amber-950/50 border border-amber-800/80 text-amber-200 text-xs rounded-2xl space-y-2">
              <div className="flex items-center gap-2 font-bold text-amber-300">
                <KeyRound className="w-4 h-4 text-amber-400 shrink-0" />
                <span>Configuração do Firebase Necessária</span>
              </div>
              <p className="text-[11px] leading-relaxed text-amber-200/90">
                Para autenticar via Google, configure as chaves <code className="bg-amber-900/60 px-1 py-0.5 rounded text-amber-100 font-mono">VITE_FIREBASE_API_KEY</code> e <code className="bg-amber-900/60 px-1 py-0.5 rounded text-amber-100 font-mono">VITE_FIREBASE_PROJECT_ID</code> no painel de ambiente do AI Studio.
              </p>
            </div>
          )}

          {/* Botão Google Login (Principal) */}
          <button
            type="button"
            onClick={handleGoogleLogin}
            disabled={isLoading}
            className="w-full py-4 px-5 bg-white hover:bg-slate-100 disabled:bg-slate-300 text-slate-900 font-bold rounded-2xl shadow-lg transition-all text-sm flex items-center justify-center gap-3 cursor-pointer border border-slate-200 hover:scale-[1.01] active:scale-[0.99]"
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
            <span>{isLoading ? 'Conectando ao Google...' : 'Entrar com Conta Google'}</span>
          </button>

          {/* Feedback Messages */}
          {errorMessage && (
            <div className="p-3.5 bg-rose-950/80 border border-rose-800 text-rose-300 text-xs font-semibold rounded-2xl flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {successMessage && (
            <div className="p-3.5 bg-emerald-950/80 border border-emerald-800 text-emerald-300 text-xs font-semibold rounded-2xl flex items-center gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{successMessage}</span>
            </div>
          )}

          {/* Security Info */}
          <div className="p-3.5 bg-slate-950/70 rounded-2xl border border-slate-800/80 flex items-center gap-2.5 text-[11px] text-slate-400">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>Validação de assinatura criptográfica com Firebase Admin SDK.</span>
          </div>
        </div>
      </div>
    </div>
  );
};
