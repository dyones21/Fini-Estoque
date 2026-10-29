import React from 'react';
import { Filter, ChevronDown, ChevronUp, X, Sparkles } from 'lucide-react';

interface FilterCollapseBarProps {
  isOpen: boolean;
  onToggle: () => void;
  activeCount?: number;
  onClear?: () => void;
  label?: string;
  children: React.ReactNode;
  className?: string;
}

export const FilterCollapseBar: React.FC<FilterCollapseBarProps> = ({
  isOpen,
  onToggle,
  activeCount = 0,
  onClear,
  label = 'Opções de Filtros & Busca',
  children,
  className = '',
}) => {
  return (
    <div className={`bg-white rounded-2xl border border-slate-200 shadow-xs transition-all duration-200 ${className}`}>
      {/* Collapsed / Header Bar */}
      <div className="flex items-center justify-between p-2.5 sm:p-3 gap-2">
        <button
          type="button"
          onClick={onToggle}
          className="flex items-center gap-2.5 text-left flex-1 min-w-0 group cursor-pointer hover:opacity-90 transition-opacity"
        >
          <div className={`p-2 rounded-xl transition-colors shrink-0 ${
            activeCount > 0
              ? 'bg-rose-50 text-rose-600 border border-rose-200'
              : 'bg-slate-100 text-slate-600 group-hover:bg-slate-200'
          }`}>
            <Filter className="w-4 h-4" />
          </div>

          <div className="flex items-center gap-2 flex-wrap min-w-0">
            <span className="text-xs font-bold text-slate-800 tracking-tight truncate">
              {label}
            </span>

            {activeCount > 0 ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-rose-500 text-white shadow-2xs">
                <span>{activeCount} {activeCount === 1 ? 'filtro ativo' : 'filtros ativos'}</span>
              </span>
            ) : (
              <span className="text-[11px] text-slate-400 font-medium hidden sm:inline">
                {isOpen ? 'Clique para recolher' : 'Clique para abrir as opções de busca'}
              </span>
            )}
          </div>
        </button>

        <div className="flex items-center gap-1.5 shrink-0">
          {activeCount > 0 && onClear && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onClear();
              }}
              className="flex items-center gap-1 text-[11px] font-bold text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 px-2.5 py-1.5 rounded-xl transition-colors cursor-pointer"
              title="Limpar todos os filtros ativos"
            >
              <X className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Limpar</span>
            </button>
          )}

          <button
            type="button"
            onClick={onToggle}
            className="p-1.5 rounded-xl text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors cursor-pointer"
            title={isOpen ? 'Recolher opções de filtros' : 'Expandir opções de filtros'}
          >
            {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Expanded Filter Panel */}
      {isOpen && (
        <div className="p-3.5 sm:p-4 pt-1 sm:pt-2 border-t border-slate-100 animate-in fade-in duration-150">
          {children}
        </div>
      )}
    </div>
  );
};
