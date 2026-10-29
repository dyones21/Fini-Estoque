import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';

interface DismissibleInfoCardProps {
  storageKey: string;
  className?: string;
  children: React.ReactNode;
}

/**
 * Componente que exibe uma caixa explicativa ou informativa no primeiro acesso.
 * Ao clicar no ícone discreto 'X' no canto superior direito, ela é ocultada
 * permanentemente através do localStorage, reaparecendo apenas se o cache/armazenamento
 * for limpo pelo usuário.
 */
export const DismissibleInfoCard: React.FC<DismissibleInfoCardProps> = ({
  storageKey,
  className = '',
  children,
}) => {
  // Inicialização segura com verificação de localStorage
  const [isVisible, setIsVisible] = useState<boolean>(() => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        return localStorage.getItem(storageKey) !== 'true';
      }
    } catch {
      // Fallback em caso de modo restrito
      return true;
    }
    return true;
  });

  const handleDismiss = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsVisible(false);
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.setItem(storageKey, 'true');
      }
    } catch {
      // Silenciar falhas de quota ou navegação restrita
    }
  };

  if (!isVisible) {
    return null;
  }

  return (
    <div className={`relative group animate-in fade-in duration-200 ${className}`}>
      {/* Conteúdo principal */}
      <div className="flex-1 pr-6 min-w-0">
        {children}
      </div>

      {/* Botão X discreto no canto superior direito */}
      <button
        type="button"
        onClick={handleDismiss}
        className="absolute top-2.5 right-2.5 p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-black/5 active:scale-95 transition-all cursor-pointer shrink-0 z-10"
        title="Ocultar esta explicação permanentemente"
        aria-label="Ocultar informação permanentemente"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};
