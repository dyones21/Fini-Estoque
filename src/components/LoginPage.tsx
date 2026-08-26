import React, { useState } from 'react';
import {
  ShieldCheck,
  AlertCircle,
  CheckCircle2,
  X,
  Lock,
  Mail,
  Eye,
  EyeOff,
  KeyRound,
  ArrowRight,
  Send,
  UserCheck,
} from 'lucide-react';
import { useStock } from '../context/StockContext';
import {
  signInWithGoogle,
  signInEmail,
  sendPasswordReset,
  isFirebaseConfigured,
} from '../lib/firebase';
import { UserAvatar } from './UserAvatar';

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
    users,
    loginWithPin,
  } = useStock();

  const isOpen = propIsOpen !== undefined ? propIsOpen : (!isAuthenticated || isAuthModalOpen);
  const isSwitchMode = isAuthenticated;

  // Active Login Mode: 'credentials' (Email/Password & Google) | 'pin' (Operator PIN)
  const [activeMode, setActiveMode] = useState<'credentials' | 'pin'>('credentials');

  // Credentials Form State
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // PIN Form State
  const [selectedPinUser, setSelectedPinUser] = useState<string>(users[0]?.id || '');
  const [pinCode, setPinCode] = useState('');

  // Password reset flow
  const [isResettingPassword, setIsResettingPassword] = useState(false);
  const [resetSentSuccess, setResetSentSuccess] = useState(false);

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isLoadingGoogle, setIsLoadingGoogle] = useState<boolean>(false);
  const [isLoadingEmail, setIsLoadingEmail] = useState<boolean>(false);
  const [isShaking, setIsShaking] = useState(false);

  if (!isOpen) return null;

  const triggerErrorShake = (msg: string) => {
    setErrorMessage(msg);
    setIsShaking(true);
    setTimeout(() => setIsShaking(false), 500);
  };

  // Login com E-mail e Senha
  const handleEmailPasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    const cleanEmail = email.trim();
    if (!cleanEmail) {
      triggerErrorShake('Por favor, informe seu e-mail cadastrado.');
      return;
    }

    if (!password) {
      triggerErrorShake('Por favor, digite sua senha de acesso.');
      return;
    }

    setIsLoadingEmail(true);

    try {
      if (!isFirebaseConfigured) {
        throw new Error(
          'Configuração do Firebase ausente no ambiente. Por favor, verifique as variáveis no painel de Secrets.'
        );
      }

      setSuccessMessage('Verificando credenciais...');
      const user = await signInEmail(cleanEmail, password);

      if (user) {
        setSuccessMessage(`Acesso autorizado! Bem-vindo(a), ${user.displayName || user.email}.`);
        setTimeout(() => {
          setIsLoadingEmail(false);
          closeAuthModal();
        }, 500);
      }
    } catch (err: any) {
      console.error('Erro no login por e-mail/senha:', err);
      setIsLoadingEmail(false);

      let msg = 'Não foi possível autenticar. Verifique seus dados e tente novamente.';
      const code = err?.code || '';
      const errMsg = (err?.message || '').toLowerCase();

      if (
        code === 'auth/invalid-credential' ||
        code === 'auth/wrong-password' ||
        code === 'auth/user-not-found' ||
        code === 'auth/invalid-login-credentials' ||
        errMsg.includes('invalid-credential') ||
        errMsg.includes('wrong-password') ||
        errMsg.includes('user-not-found') ||
        errMsg.includes('invalid-login-credentials')
      ) {
        if (cleanEmail.toLowerCase().includes('gmail.com')) {
          msg = 'Credenciais não conferem. Como este é um e-mail do Google, clique no botão "Entrar com Conta Google" abaixo para autenticar instantaneamente.';
        } else {
          msg = 'E-mail ou senha incorretos. Verifique suas credenciais com o administrador ou redefina sua senha.';
        }
      } else if (code === 'auth/invalid-email' || errMsg.includes('invalid-email')) {
        msg = 'Endereço de e-mail inválido. Digite um e-mail válido (ex: nome@gummystock.com.br).';
      } else if (code === 'auth/user-disabled' || errMsg.includes('user-disabled')) {
        msg = 'Esta conta de usuário foi desativada pelo administrador.';
      } else if (code === 'auth/too-many-requests' || errMsg.includes('too-many-requests')) {
        msg = 'Muitas tentativas consecutivas. Por segurança, aguarde alguns instantes antes de tentar novamente.';
      } else if (code === 'auth/network-request-failed' || errMsg.includes('network')) {
        msg = 'Falha de conexão com os servidores de autenticação. Verifique sua internet.';
      } else if (err?.message) {
        msg = err.message;
      }

      triggerErrorShake(msg);
    }
  };

  // Login com Google
  const handleGoogleLogin = async () => {
    setErrorMessage(null);
    setSuccessMessage(null);
    setIsLoadingGoogle(true);

    try {
      if (!isFirebaseConfigured) {
        throw new Error(
          'Configuração do Firebase ausente no ambiente. Por favor, verifique as variáveis de ambiente.'
        );
      }

      setSuccessMessage('Conectando à sua Conta Google...');
      const user = await signInWithGoogle();

      if (user) {
        setSuccessMessage(`Bem-vindo(a), ${user.displayName || user.email}! Acesso autorizado.`);
        setTimeout(() => {
          setIsLoadingGoogle(false);
          closeAuthModal();
        }, 500);
      }
    } catch (err: any) {
      console.error('Erro ao autenticar com o Google:', err);
      setIsLoadingGoogle(false);

      let msg = 'Falha ao autenticar com a Conta Google. Tente novamente.';
      const code = err?.code || '';

      if (code === 'auth/popup-closed-by-user') {
        msg = 'A janela de autenticação do Google foi fechada antes de concluir.';
      } else if (code === 'auth/cancelled-popup-request') {
        msg = 'Solicitação de login cancelada.';
      } else if (code === 'auth/invalid-api-key' || err?.message?.includes('api-key')) {
        msg = 'Chave do Firebase inválida. Verifique VITE_FIREBASE_API_KEY no painel de Secrets.';
      } else if (err?.message) {
        msg = err.message;
      }

      triggerErrorShake(msg);
    }
  };

  // Envio de redefinição de senha por e-mail
  const handleForgotPassword = async () => {
    const cleanEmail = email.trim();
    if (!cleanEmail) {
      triggerErrorShake('Digite seu e-mail no campo acima antes de solicitar a redefinição de senha.');
      return;
    }

    setIsResettingPassword(true);
    setErrorMessage(null);

    try {
      await sendPasswordReset(cleanEmail);
      setResetSentSuccess(true);
      setSuccessMessage(`Link de redefinição de senha enviado para ${cleanEmail}. Verifique sua caixa de entrada.`);
    } catch (err: any) {
      console.error('Erro ao enviar e-mail de redefinição:', err);
      triggerErrorShake('Não foi possível enviar o e-mail de redefinição. Verifique se o e-mail está cadastrado.');
    } finally {
      setIsResettingPassword(false);
    }
  };

  // Login por PIN de Operador
  const handlePinLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const targetUserId = selectedPinUser || (users[0] ? users[0].id : '');
    if (!targetUserId) {
      triggerErrorShake('Selecione um operador na lista.');
      return;
    }

    if (!pinCode || pinCode.length < 4) {
      triggerErrorShake('Digite o PIN de segurança com 4 dígitos.');
      return;
    }

    const ok = loginWithPin(targetUserId, pinCode.trim());
    if (ok) {
      setSuccessMessage('Acesso via PIN autorizado!');
      setTimeout(() => {
        closeAuthModal();
      }, 400);
    } else {
      triggerErrorShake('PIN incorreto para este operador. Verifique o código digitado.');
      setPinCode('');
    }
  };

  const isBusy = isLoadingGoogle || isLoadingEmail || isResettingPassword;

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
              G
            </div>
            <div>
              <h1 className="text-xl font-black text-white tracking-tight">GummyStock</h1>
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

        {/* Mode Selector Tabs */}
        <div className="px-6 pt-5 pb-0">
          <div className="grid grid-cols-2 p-1 bg-slate-950/90 rounded-2xl border border-slate-800/80 text-xs font-bold">
            <button
              type="button"
              onClick={() => {
                setActiveMode('credentials');
                setErrorMessage(null);
              }}
              className={`py-2 px-3 rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                activeMode === 'credentials'
                  ? 'bg-rose-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Mail className="w-3.5 h-3.5" />
              <span>E-mail & Senha</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveMode('pin');
                setErrorMessage(null);
                if (!selectedPinUser && users.length > 0) {
                  setSelectedPinUser(users[0].id);
                }
              }}
              className={`py-2 px-3 rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                activeMode === 'pin'
                  ? 'bg-rose-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <KeyRound className="w-3.5 h-3.5" />
              <span>PIN Operador</span>
            </button>
          </div>
        </div>

        <div className="p-6 sm:p-7 space-y-5">
          {activeMode === 'credentials' ? (
            <>
              <div className="text-center space-y-1">
                <h2 className="text-base font-bold text-white tracking-tight">Identificação de Acesso</h2>
                <p className="text-xs text-slate-400 max-w-xs mx-auto">
                  Entre com sua conta Google ou digite seu e-mail e senha corporativa.
                </p>
              </div>

              {/* Formulário de E-mail e Senha */}
              <form onSubmit={handleEmailPasswordLogin} className="space-y-3.5">
                {/* Campo E-mail */}
                <div className="space-y-1.5 text-left">
                  <label className="block text-xs font-bold text-slate-300">
                    E-mail de Acesso:
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                      <Mail className="w-4 h-4" />
                    </div>
                    <input
                      type="email"
                      required
                      disabled={isBusy}
                      placeholder="usuario@gummystock.com.br"
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        if (errorMessage) setErrorMessage(null);
                      }}
                      className="w-full bg-slate-950/80 border border-slate-700/80 focus:border-rose-500 focus:ring-2 focus:ring-rose-500/20 rounded-2xl pl-10 pr-4 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none transition-all"
                    />
                  </div>
                </div>

                {/* Campo Senha */}
                <div className="space-y-1.5 text-left">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-bold text-slate-300">
                      Senha:
                    </label>
                    <button
                      type="button"
                      tabIndex={-1}
                      onClick={handleForgotPassword}
                      disabled={isBusy}
                      className="text-[11px] font-bold text-rose-400 hover:text-rose-300 transition-colors"
                    >
                      Esqueci a senha
                    </button>
                  </div>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                      <KeyRound className="w-4 h-4" />
                    </div>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      disabled={isBusy}
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        if (errorMessage) setErrorMessage(null);
                      }}
                      className="w-full bg-slate-950/80 border border-slate-700/80 focus:border-rose-500 focus:ring-2 focus:ring-rose-500/20 rounded-2xl pl-10 pr-11 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none transition-all font-mono"
                    />
                    <button
                      type="button"
                      tabIndex={-1}
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-200 transition-colors"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Botão Entrar (E-mail/Senha) */}
                <button
                  type="submit"
                  disabled={isBusy}
                  className="w-full py-3 px-4 bg-rose-600 hover:bg-rose-700 disabled:bg-slate-800 disabled:text-slate-500 text-white font-bold rounded-2xl shadow-lg shadow-rose-900/30 transition-all text-xs flex items-center justify-center gap-2 cursor-pointer active:scale-[0.99] mt-2 border border-rose-500/30"
                >
                  <span>{isLoadingEmail ? 'Entrando...' : 'Entrar com E-mail e Senha'}</span>
                  <ArrowRight className="w-4 h-4 shrink-0" />
                </button>
              </form>

              {/* Divisor "ou" */}
              <div className="relative flex items-center justify-center my-1">
                <div className="border-t border-slate-800 w-full" />
                <span className="bg-slate-900 px-3 text-[11px] font-bold text-slate-500 uppercase tracking-wider shrink-0">
                  ou
                </span>
                <div className="border-t border-slate-800 w-full" />
              </div>

              {/* Botão Google Login */}
              <button
                type="button"
                onClick={handleGoogleLogin}
                disabled={isBusy}
                className="w-full py-3 px-4 bg-slate-950 hover:bg-slate-850 disabled:bg-slate-900 text-white font-bold rounded-2xl border border-slate-700/80 hover:border-slate-600 transition-all text-xs flex items-center justify-center gap-3 cursor-pointer active:scale-[0.99]"
              >
                <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
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
                <span>{isLoadingGoogle ? 'Conectando ao Google...' : 'Entrar com Conta Google'}</span>
              </button>
            </>
          ) : (
            /* PIN Mode */
            <form onSubmit={handlePinLogin} className="space-y-4">
              <div className="text-center space-y-1">
                <h2 className="text-base font-bold text-white tracking-tight">Login Rápido com PIN</h2>
                <p className="text-xs text-slate-400 max-w-xs mx-auto">
                  Selecione o operador do turno e digite o código PIN de 4 dígitos.
                </p>
              </div>

              {/* Seleção do Usuário */}
              <div className="space-y-2 max-h-44 overflow-y-auto pr-1">
                {users.map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => {
                      setSelectedPinUser(u.id);
                      setErrorMessage(null);
                    }}
                    className={`w-full flex items-center justify-between p-2.5 rounded-2xl border text-left transition-all cursor-pointer ${
                      selectedPinUser === u.id
                        ? 'bg-rose-950/40 border-rose-500/80 shadow-xs'
                        : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <UserAvatar
                        avatarUrl={u.avatarUrl}
                        name={u.name}
                        className="w-8 h-8 rounded-xl shrink-0"
                      />
                      <div className="truncate">
                        <p className="text-xs font-bold text-white truncate">{u.name}</p>
                        <p className="text-[10px] text-slate-400 capitalize">{u.role.replace('_', ' ')}</p>
                      </div>
                    </div>
                    {selectedPinUser === u.id && (
                      <span className="w-2 h-2 rounded-full bg-rose-500 shrink-0 ml-2" />
                    )}
                  </button>
                ))}
              </div>

              {/* Campo PIN */}
              <div className="space-y-1.5 text-left">
                <label className="block text-xs font-bold text-slate-300">
                  PIN de Segurança (4 dígitos):
                </label>
                <input
                  type="password"
                  maxLength={4}
                  required
                  placeholder="••••"
                  value={pinCode}
                  onChange={(e) => {
                    setPinCode(e.target.value.replace(/\D/g, ''));
                    if (errorMessage) setErrorMessage(null);
                  }}
                  className="w-full bg-slate-950/80 border border-slate-700/80 focus:border-rose-500 focus:ring-2 focus:ring-rose-500/20 rounded-2xl px-4 py-2.5 text-center text-lg tracking-widest font-mono text-white focus:outline-none"
                />
              </div>

              <button
                type="submit"
                className="w-full py-3 px-4 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-2xl shadow-lg shadow-rose-900/30 transition-all text-xs flex items-center justify-center gap-2 cursor-pointer active:scale-[0.99]"
              >
                <UserCheck className="w-4 h-4 shrink-0" />
                <span>Confirmar PIN & Acessar</span>
              </button>
            </form>
          )}

          {/* Feedback Messages */}
          {errorMessage && (
            <div className="p-3 bg-rose-950/80 border border-rose-800 text-rose-300 text-xs font-semibold rounded-2xl flex items-start gap-2.5 text-left animate-fadeIn">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <span className="leading-relaxed block">{errorMessage}</span>
                {errorMessage.includes('Google') && (
                  <button
                    type="button"
                    onClick={handleGoogleLogin}
                    className="mt-1 text-[11px] font-bold text-white bg-rose-700 hover:bg-rose-600 px-3 py-1 rounded-xl transition-colors inline-flex items-center gap-1.5"
                  >
                    <span>Entrar com Conta Google</span>
                    <ArrowRight className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>
          )}

          {successMessage && (
            <div className="p-3 bg-emerald-950/80 border border-emerald-800 text-emerald-300 text-xs font-semibold rounded-2xl flex items-center gap-2.5 text-left animate-fadeIn">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{successMessage}</span>
            </div>
          )}

          {/* Security Info */}
          <div className="p-3 bg-slate-950/70 rounded-2xl border border-slate-800/80 flex items-center gap-2.5 text-[11px] text-slate-400">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>Acesso autenticado e verificado via Firebase Auth & RBAC.</span>
          </div>
        </div>
      </div>
    </div>
  );
};
