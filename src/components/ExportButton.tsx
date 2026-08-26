import React, { useState, useRef, useEffect } from 'react';
import { Download, FileSpreadsheet, FileText, ChevronDown } from 'lucide-react';

interface ExportButtonProps {
  onExportExcel: () => void;
  onExportCSV: () => void;
  disabled?: boolean;
  label?: string;
  size?: 'sm' | 'md';
  className?: string;
}

export const ExportButton: React.FC<ExportButtonProps> = ({
  onExportExcel,
  onExportCSV,
  disabled = false,
  label = 'Exportar',
  size = 'md',
  className = '',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className={`relative inline-block text-left ${className}`} ref={dropdownRef}>
      <div className="flex items-center rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs transition-all overflow-hidden">
        <button
          type="button"
          disabled={disabled}
          onClick={onExportExcel}
          className={`flex items-center gap-2 font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
            size === 'sm' ? 'px-3 py-1.5 text-xs' : 'px-3.5 py-2.5 text-xs h-10'
          }`}
          title="Exportar dados filtrados diretamente para Excel (.xlsx)"
        >
          <FileSpreadsheet className="w-4 h-4 text-emerald-100 shrink-0" />
          <span>{label}</span>
        </button>

        <button
          type="button"
          disabled={disabled}
          onClick={() => setIsOpen((prev) => !prev)}
          className={`border-l border-emerald-500/80 hover:bg-emerald-800/60 flex items-center justify-center transition-all ${
            size === 'sm' ? 'px-1.5 py-1.5' : 'px-2 py-2.5 h-10'
          }`}
          title="Escolher formato de exportação (.xlsx ou .csv)"
          aria-expanded={isOpen}
        >
          <ChevronDown className={`w-3.5 h-3.5 text-emerald-100 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {isOpen && (
        <div className="absolute right-0 mt-1.5 w-48 rounded-xl bg-white p-1.5 shadow-xl border border-slate-200 z-50 animate-in fade-in zoom-in-95 duration-100">
          <div className="px-2 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
            Formato do Arquivo
          </div>
          <button
            type="button"
            onClick={() => {
              setIsOpen(false);
              onExportExcel();
            }}
            className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-semibold text-slate-700 hover:bg-emerald-50 hover:text-emerald-800 transition-all text-left"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-600 shrink-0" />
            <div>
              <span className="font-bold block text-slate-900">Excel (.xlsx)</span>
              <span className="text-[10px] text-slate-500 block">Planilha formatada</span>
            </div>
          </button>

          <button
            type="button"
            onClick={() => {
              setIsOpen(false);
              onExportCSV();
            }}
            className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition-all text-left"
          >
            <FileText className="w-4 h-4 text-slate-500 shrink-0" />
            <div>
              <span className="font-bold block text-slate-900">CSV (.csv)</span>
              <span className="text-[10px] text-slate-500 block">Compatível c/ UTF-8</span>
            </div>
          </button>
        </div>
      )}
    </div>
  );
};
