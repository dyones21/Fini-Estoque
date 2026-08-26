import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertOctagon, RotateCcw, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallbackTitle?: string;
  fallbackMessage?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  showDetails: boolean;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      showDetails: false,
    };
  }

  public static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    // Atualiza o state para que a próxima renderização mostre a UI alternativa
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // Registra o erro detalhado no console do navegador para diagnóstico completo
    console.error('======================================================');
    console.error('🛑 [ErrorBoundary] FALHA DE RENDERIZAÇÃO DETECTADA:');
    console.error('Erro:', error.name, '-', error.message);
    console.error('Stack trace do Erro:', error.stack);
    console.error('Component Stack:', errorInfo.componentStack);
    console.error('======================================================');

    this.setState({
      error,
      errorInfo,
    });
  }

  private handleReset = (): void => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      showDetails: false,
    });
  };

  private handleReload = (): void => {
    window.location.reload();
  };

  private toggleDetails = (): void => {
    this.setState((prev) => ({ showDetails: !prev.showDetails }));
  };

  public render(): ReactNode {
    if (this.state.hasError) {
      const { error, errorInfo, showDetails } = this.state;
      const title = this.props.fallbackTitle || 'Ops! Ocorreu um problema ao carregar este módulo';
      const message =
        this.props.fallbackMessage ||
        'Não se preocupe: seus dados salvos continuam seguros. Um erro inesperado impediu a exibição desta tela no momento.';

      return (
        <div className="w-full py-8 px-4 flex items-center justify-center">
          <div className="w-full max-w-2xl bg-white rounded-3xl border border-rose-200/80 shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            {/* Header com gradiente */}
            <div className="bg-gradient-to-r from-rose-600 to-rose-700 p-6 text-white flex items-start gap-4">
              <div className="p-3 bg-white/20 rounded-2xl shrink-0 backdrop-blur-xs">
                <AlertOctagon className="w-8 h-8 text-white" />
              </div>
              <div className="flex-1">
                <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-white/20 text-white inline-block mb-1">
                  Proteção de Renderização (ErrorBoundary)
                </span>
                <h2 className="text-lg sm:text-xl font-black leading-tight text-white">
                  {title}
                </h2>
                <p className="text-xs sm:text-sm text-rose-100 mt-1 leading-relaxed">
                  {message}
                </p>
              </div>
            </div>

            {/* Ações amigáveis */}
            <div className="p-6 bg-slate-50 border-b border-slate-200 space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={this.handleReload}
                  className="flex items-center justify-center gap-2 bg-rose-600 hover:bg-rose-700 text-white font-bold px-4 py-2.5 rounded-xl text-xs shadow-md transition-all flex-1 sm:flex-none"
                >
                  <RefreshCw className="w-4 h-4" />
                  <span>Recarregar Página</span>
                </button>

                <button
                  type="button"
                  onClick={this.handleReset}
                  className="flex items-center justify-center gap-2 bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 font-bold px-4 py-2.5 rounded-xl text-xs shadow-xs transition-all flex-1 sm:flex-none"
                >
                  <RotateCcw className="w-4 h-4 text-slate-500" />
                  <span>Tentar Novamente</span>
                </button>
              </div>

              {/* Botão de ver detalhes técnicos para diagnóstico */}
              <button
                type="button"
                onClick={this.toggleDetails}
                className="text-xs font-semibold text-slate-500 hover:text-slate-800 flex items-center gap-1.5 transition-colors"
              >
                <span>{showDetails ? 'Ocultar' : 'Ver'} detalhes técnicos do erro</span>
                {showDetails ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>
            </div>

            {/* Painel retrátil de diagnóstico técnico */}
            {showDetails && (
              <div className="p-6 bg-slate-900 text-slate-100 text-xs font-mono overflow-x-auto space-y-3 max-h-80 overflow-y-auto">
                <div>
                  <p className="text-rose-400 font-bold mb-1">
                    {error?.name}: {error?.message}
                  </p>
                  {error?.stack && (
                    <pre className="text-[11px] text-slate-300 whitespace-pre-wrap leading-relaxed">
                      {error.stack}
                    </pre>
                  )}
                </div>
                {errorInfo?.componentStack && (
                  <div className="pt-3 border-t border-slate-800">
                    <p className="text-amber-400 font-bold mb-1">Component Hierarchy Stack:</p>
                    <pre className="text-[10px] text-slate-400 whitespace-pre-wrap leading-relaxed">
                      {errorInfo.componentStack}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
