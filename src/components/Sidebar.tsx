import React, { useState, useEffect } from 'react';
import {
  LayoutDashboard,
  Boxes,
  Store,
  Warehouse,
  FileSpreadsheet,
  FileBarChart,
  ArrowRightLeft,
  TrendingUp,
  Cloud,
  ShoppingBag,
  ShoppingCart,
  Receipt,
  PanelLeftClose,
  PanelLeftOpen,
  ChevronLeft,
  ChevronDown,
  ChevronUp,
  ShieldCheck,
  KeyRound,
  Settings,
  Building2,
  DollarSign,
  Users,
} from 'lucide-react';
import { useStock } from '../context/StockContext';
import { LocationType } from '../types';

export type ActiveTab =
  | 'dashboard'
  | 'estoque_geral'
  | 'estoque_loja'
  | 'estoque_deposito'
  | 'entrada_nf'
  | 'notas_fiscais'
  | 'contas_a_pagar'
  | 'fornecedores'
  | 'sugestao_compra'
  | 'relatorios'
  | 'curva_abc_ranking'
  | 'empresa'
  | 'backup'
  | 'usuarios';

export type NavGroupKey = 'estoque' | 'financeiro' | 'relatorios' | 'config';

export function getGroupForTab(tab: ActiveTab): NavGroupKey | null {
  switch (tab) {
    case 'estoque_geral':
    case 'estoque_loja':
    case 'estoque_deposito':
    case 'entrada_nf':
    case 'notas_fiscais':
      return 'estoque';
    case 'contas_a_pagar':
    case 'fornecedores':
      return 'financeiro';
    case 'sugestao_compra':
    case 'relatorios':
    case 'curva_abc_ranking':
      return 'relatorios';
    case 'empresa':
    case 'backup':
    case 'usuarios':
      return 'config';
    default:
      return null;
  }
}

interface SidebarProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  onOpenNFModal: () => void;
  onOpenTransferModal: () => void;
  onOpenSaleModal?: () => void;
  isMobileOpen?: boolean;
  onCloseMobile?: () => void;
  isCollapsed?: boolean;
  onCollapseChange?: (collapsed: boolean) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  onOpenNFModal,
  onOpenTransferModal,
  onOpenSaleModal,
  isMobileOpen = false,
  onCloseMobile,
  isCollapsed: controlledIsCollapsed,
  onCollapseChange,
}) => {
  const { setActiveLocation, currentUser, checkPermission, openSwitchUserModal, companyInfo } = useStock();

  const [internalIsCollapsed, setInternalIsCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem('FINI_SIDEBAR_COLLAPSED') === 'true';
    } catch {
      return false;
    }
  });

  const isCollapsed = controlledIsCollapsed !== undefined ? controlledIsCollapsed : internalIsCollapsed;

  // Gerenciamento dos 4 grupos sanfona (accordion): apenas 1 grupo aberto por vez para não ter rolagem
  const [openGroup, setOpenGroup] = useState<NavGroupKey | null>(() => getGroupForTab(activeTab) || 'estoque');

  // Sincroniza o grupo aberto automaticamente quando a activeTab muda
  useEffect(() => {
    const matchingGroup = getGroupForTab(activeTab);
    if (matchingGroup) {
      setOpenGroup(matchingGroup);
    }
  }, [activeTab]);

  const toggleCollapse = () => {
    const next = !isCollapsed;
    setInternalIsCollapsed(next);
    try {
      localStorage.setItem('FINI_SIDEBAR_COLLAPSED', String(next));
    } catch {
      // Ignora falhas de storage
    }
    if (onCollapseChange) {
      onCollapseChange(next);
    }
  };

  const handleTabClick = (tab: ActiveTab) => {
    setActiveTab(tab);
    if (tab === 'estoque_geral') setActiveLocation('geral');
    if (onCloseMobile) onCloseMobile();
  };

  const handleGroupToggle = (groupKey: NavGroupKey) => {
    if (isCollapsed) {
      // Se estiver colapsado, expande o sidebar e abre aquele grupo
      toggleCollapse();
      setOpenGroup(groupKey);
      return;
    }
    // Comportamento sanfona: clica no mesmo fecha, clica em outro fecha os demais e abre o selecionado
    setOpenGroup((prev) => (prev === groupKey ? null : groupKey));
  };

  // 1. Dashboard direto
  const hasDashboard = checkPermission('canViewDashboard');

  // 2. Grupo Estoque & Operações
  const estoqueItems = [
    ...(checkPermission('canViewStock')
      ? [
          {
            id: 'estoque_geral' as ActiveTab,
            label: 'Estoque & Depósitos',
            icon: Boxes,
          },
        ]
      : []),
    ...(checkPermission('canAddNFEntries') || checkPermission('canDeleteNFEntries')
      ? [
          {
            id: 'notas_fiscais' as ActiveTab,
            label: 'Notas Fiscais (NF-e)',
            icon: Receipt,
          },
        ]
      : []),
  ];

  // 3. Grupo Financeiro
  const financeiroItems = [
    ...(checkPermission('canManagePayables')
      ? [
          {
            id: 'contas_a_pagar' as ActiveTab,
            label: 'Contas a Pagar',
            icon: DollarSign,
          },
          {
            id: 'fornecedores' as ActiveTab,
            label: 'Fornecedores',
            icon: Building2,
          },
        ]
      : []),
  ];

  // 4. Grupo Relatórios & Giro
  const relatoriosItems = [
    ...(checkPermission('canViewReports')
      ? [
          {
            id: 'sugestao_compra' as ActiveTab,
            label: 'Sugestão de Compra',
            icon: ShoppingCart,
          },
          {
            id: 'relatorios' as ActiveTab,
            label: 'Relatórios Operacionais',
            icon: FileBarChart,
          },
          {
            id: 'curva_abc_ranking' as ActiveTab,
            label: 'Curva ABC & Ranking',
            icon: TrendingUp,
          },
        ]
      : []),
  ];

  // 5. Grupo Configurações
  const configItems = [
    ...(checkPermission('canManageBackup') || checkPermission('canManageUsers') || checkPermission('canManageCompany')
      ? [
          {
            id: 'empresa' as ActiveTab,
            label: 'Dados da Empresa',
            icon: Building2,
          },
        ]
      : []),
    ...(checkPermission('canManageBackup')
      ? [
          {
            id: 'backup' as ActiveTab,
            label: 'Backup em Nuvem',
            icon: Cloud,
          },
        ]
      : []),
    ...(checkPermission('canManageUsers')
      ? [
          {
            id: 'usuarios' as ActiveTab,
            label: 'Permissões & Usuários',
            icon: ShieldCheck,
          },
        ]
      : []),
  ];

  const hasEstoqueOps = checkPermission('canRegisterMovements') || checkPermission('canTransferStock');

  return (
    <>
      {/* ================= DESKTOP SIDEBAR (FIXO NA VIEWPORT DE PONTA A PONTA COM LOGO NO TOPO) ================= */}
      <aside
        className={`hidden lg:flex fixed top-0 left-0 bottom-0 ${
          isCollapsed ? 'w-16' : 'w-[220px]'
        } bg-slate-900 text-slate-300 shrink-0 border-r border-slate-800 flex-col transition-all duration-300 overflow-hidden shadow-2xl z-40 justify-between select-none`}
      >
        {/* Bloco 1: Logotipo Fixo no Topo do Sidebar (h-16 = 64px, perfeitamente alinhado com o cabeçalho) */}
        <div className="h-16 border-b border-slate-800 flex items-center justify-center shrink-0 bg-slate-950/90 px-2">
          {companyInfo?.logoUrl ? (
            <img
              src={companyInfo.logoUrl}
              alt={companyInfo.tradeName || companyInfo.name || 'Logotipo da Empresa'}
              className="w-10 h-10 object-contain rounded-xl shadow-xs"
            />
          ) : (
            <div
              className="w-10 h-10 rounded-xl bg-gradient-to-tr from-rose-600 via-pink-500 to-amber-400 p-0.5 flex items-center justify-center shadow-md shrink-0 cursor-pointer"
              onClick={() => handleTabClick('dashboard')}
              title="GummyStock • Dashboard"
            >
              <div className="w-full h-full bg-slate-950 rounded-[10px] flex items-center justify-center font-black text-rose-500 text-lg tracking-tighter">
                G
              </div>
            </div>
          )}
        </div>

        {/* Sub-faixa de Controle / Botão Minimizar */}
        <div className="px-2 py-1 border-b border-slate-800/60 flex items-center justify-between shrink-0 bg-slate-950/40">
          {!isCollapsed && (
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 px-1">
              Navegação
            </span>
          )}
          <button
            onClick={toggleCollapse}
            title={isCollapsed ? 'Expandir Menu • Salvar preferência' : 'Minimizar Menu • Salvar preferência'}
            className={`flex items-center gap-1.5 p-1 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white transition-all border border-slate-700/70 text-xs font-semibold ${
              isCollapsed ? 'mx-auto' : 'ml-auto'
            } cursor-pointer`}
          >
            {isCollapsed ? (
              <PanelLeftOpen className="w-3.5 h-3.5 text-rose-400" />
            ) : (
              <>
                <PanelLeftClose className="w-3.5 h-3.5 text-rose-400" />
                <span className="text-[10px] font-bold">Minimizar</span>
              </>
            )}
          </button>
        </div>

        {/* Corpo de Navegação com 4 Grupos Sanfona (100% sem scrollbar) */}
        <div className="flex-1 flex flex-col justify-start overflow-hidden p-2 space-y-1.5">
          {/* 1. Dashboard (Item Direto de Topo) */}
          {hasDashboard && (
            <button
              onClick={() => handleTabClick('dashboard')}
              title={isCollapsed ? 'Dashboard Geral' : undefined}
              className={`w-full flex items-center ${
                isCollapsed ? 'justify-center p-2.5' : 'justify-start px-2.5 py-2'
              } rounded-xl text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'dashboard'
                  ? 'bg-rose-600/25 text-rose-300 border border-rose-500/40 shadow-xs'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800/70 border border-transparent'
              }`}
            >
              <LayoutDashboard
                className={`w-4 h-4 shrink-0 ${
                  activeTab === 'dashboard' ? 'text-rose-400' : 'text-slate-400'
                }`}
              />
              {!isCollapsed && <span className="ml-2.5 truncate">Dashboard</span>}
            </button>
          )}

          {/* 2. Grupo Estoque (Sanfona) */}
          {estoqueItems.length > 0 && (
            <div className="space-y-1">
              <button
                onClick={() => handleGroupToggle('estoque')}
                title={isCollapsed ? 'Estoque & Operações' : undefined}
                className={`w-full flex items-center ${
                  isCollapsed ? 'justify-center p-2.5' : 'justify-between px-2.5 py-1.5'
                } rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  openGroup === 'estoque' || getGroupForTab(activeTab) === 'estoque'
                    ? 'bg-slate-800 text-slate-100 border border-slate-700/80 shadow-xs'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40 border border-transparent'
                }`}
              >
                <div className="flex items-center gap-2.5 truncate">
                  <Boxes className="w-4 h-4 text-emerald-400 shrink-0" />
                  {!isCollapsed && <span className="truncate">Estoque</span>}
                </div>
                {!isCollapsed && (
                  openGroup === 'estoque' ? (
                    <ChevronUp className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  )
                )}
              </button>

              {/* Subitens de Estoque (Apenas quando expandido e grupo ativo) */}
              {!isCollapsed && openGroup === 'estoque' && (
                <div className="pl-2 border-l border-emerald-500/30 ml-3.5 space-y-1 animate-in fade-in duration-150">
                  {estoqueItems.map((item) => {
                    const Icon = item.icon;
                    const isActive = activeTab === item.id;
                    return (
                      <button
                        key={item.id}
                        onClick={() => handleTabClick(item.id)}
                        className={`w-full flex items-center px-2 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                          isActive
                            ? 'bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30'
                            : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/50'
                        }`}
                      >
                        <Icon className={`w-3.5 h-3.5 shrink-0 ${isActive ? 'text-emerald-400' : 'text-slate-500'}`} />
                        <span className="ml-2 truncate text-left">{item.label}</span>
                      </button>
                    );
                  })}

                  {/* Operações Rápidas compactas dentro do grupo Estoque */}
                  {hasEstoqueOps && (
                    <div className="pt-1 flex gap-1">
                      {onOpenSaleModal && checkPermission('canRegisterMovements') && (
                        <button
                          onClick={onOpenSaleModal}
                          title="Baixa para Baleiro"
                          className="flex-1 flex items-center justify-center gap-1 py-1 px-1.5 rounded-lg bg-emerald-600/30 hover:bg-emerald-600 text-emerald-200 hover:text-white border border-emerald-500/40 text-[10px] font-bold transition-all cursor-pointer"
                        >
                          <ShoppingBag className="w-3 h-3 shrink-0" />
                          <span className="truncate">Baleiro</span>
                        </button>
                      )}
                      {checkPermission('canTransferStock') && (
                        <button
                          onClick={onOpenTransferModal}
                          title="Transferir para Loja"
                          className="flex-1 flex items-center justify-center gap-1 py-1 px-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 text-[10px] font-bold transition-all cursor-pointer"
                        >
                          <ArrowRightLeft className="w-3 h-3 shrink-0" />
                          <span className="truncate">Transferir</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* 3. Grupo Financeiro (Sanfona) */}
          {financeiroItems.length > 0 && (
            <div className="space-y-1">
              <button
                onClick={() => handleGroupToggle('financeiro')}
                title={isCollapsed ? 'Financeiro' : undefined}
                className={`w-full flex items-center ${
                  isCollapsed ? 'justify-center p-2.5' : 'justify-between px-2.5 py-1.5'
                } rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  openGroup === 'financeiro' || getGroupForTab(activeTab) === 'financeiro'
                    ? 'bg-slate-800 text-slate-100 border border-slate-700/80 shadow-xs'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40 border border-transparent'
                }`}
              >
                <div className="flex items-center gap-2.5 truncate">
                  <DollarSign className="w-4 h-4 text-sky-400 shrink-0" />
                  {!isCollapsed && <span className="truncate">Financeiro</span>}
                </div>
                {!isCollapsed && (
                  openGroup === 'financeiro' ? (
                    <ChevronUp className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  )
                )}
              </button>

              {!isCollapsed && openGroup === 'financeiro' && (
                <div className="pl-2 border-l border-sky-500/30 ml-3.5 space-y-1 animate-in fade-in duration-150">
                  {financeiroItems.map((item) => {
                    const Icon = item.icon;
                    const isActive = activeTab === item.id;
                    return (
                      <button
                        key={item.id}
                        onClick={() => handleTabClick(item.id)}
                        className={`w-full flex items-center px-2 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                          isActive
                            ? 'bg-sky-500/20 text-sky-300 font-bold border border-sky-500/30'
                            : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/50'
                        }`}
                      >
                        <Icon className={`w-3.5 h-3.5 shrink-0 ${isActive ? 'text-sky-400' : 'text-slate-500'}`} />
                        <span className="ml-2 truncate text-left">{item.label}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* 4. Grupo Relatórios (Sanfona) */}
          {relatoriosItems.length > 0 && (
            <div className="space-y-1">
              <button
                onClick={() => handleGroupToggle('relatorios')}
                title={isCollapsed ? 'Relatórios & Inteligência' : undefined}
                className={`w-full flex items-center ${
                  isCollapsed ? 'justify-center p-2.5' : 'justify-between px-2.5 py-1.5'
                } rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  openGroup === 'relatorios' || getGroupForTab(activeTab) === 'relatorios'
                    ? 'bg-slate-800 text-slate-100 border border-slate-700/80 shadow-xs'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40 border border-transparent'
                }`}
              >
                <div className="flex items-center gap-2.5 truncate">
                  <FileBarChart className="w-4 h-4 text-amber-400 shrink-0" />
                  {!isCollapsed && <span className="truncate">Relatórios</span>}
                </div>
                {!isCollapsed && (
                  openGroup === 'relatorios' ? (
                    <ChevronUp className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  )
                )}
              </button>

              {!isCollapsed && openGroup === 'relatorios' && (
                <div className="pl-2 border-l border-amber-500/30 ml-3.5 space-y-1 animate-in fade-in duration-150">
                  {relatoriosItems.map((item) => {
                    const Icon = item.icon;
                    const isActive = activeTab === item.id;
                    return (
                      <button
                        key={item.id}
                        onClick={() => handleTabClick(item.id)}
                        className={`w-full flex items-center px-2 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                          isActive
                            ? 'bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30'
                            : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/50'
                        }`}
                      >
                        <Icon className={`w-3.5 h-3.5 shrink-0 ${isActive ? 'text-amber-400' : 'text-slate-500'}`} />
                        <span className="ml-2 truncate text-left">{item.label}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* 5. Grupo Configurações (Sanfona) */}
          {configItems.length > 0 && (
            <div className="space-y-1">
              <button
                onClick={() => handleGroupToggle('config')}
                title={isCollapsed ? 'Configurações do Sistema' : undefined}
                className={`w-full flex items-center ${
                  isCollapsed ? 'justify-center p-2.5' : 'justify-between px-2.5 py-1.5'
                } rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  openGroup === 'config' || getGroupForTab(activeTab) === 'config'
                    ? 'bg-slate-800 text-slate-100 border border-slate-700/80 shadow-xs'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40 border border-transparent'
                }`}
              >
                <div className="flex items-center gap-2.5 truncate">
                  <Settings className="w-4 h-4 text-purple-400 shrink-0" />
                  {!isCollapsed && <span className="truncate">Configurações</span>}
                </div>
                {!isCollapsed && (
                  openGroup === 'config' ? (
                    <ChevronUp className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  )
                )}
              </button>

              {!isCollapsed && openGroup === 'config' && (
                <div className="pl-2 border-l border-purple-500/30 ml-3.5 space-y-1 animate-in fade-in duration-150">
                  {configItems.map((item) => {
                    const Icon = item.icon;
                    const isActive = activeTab === item.id;
                    return (
                      <button
                        key={item.id}
                        onClick={() => handleTabClick(item.id)}
                        className={`w-full flex items-center px-2 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                          isActive
                            ? 'bg-purple-500/20 text-purple-300 font-bold border border-purple-500/30'
                            : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/50'
                        }`}
                      >
                        <Icon className={`w-3.5 h-3.5 shrink-0 ${isActive ? 'text-purple-400' : 'text-slate-500'}`} />
                        <span className="ml-2 truncate text-left">{item.label}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Desktop Footer (Fixo no rodapé inferior) */}
        <div className="p-2.5 border-t border-slate-800 text-[11px] text-slate-500 space-y-1.5 text-left shrink-0 bg-slate-950/80">
          <button
            onClick={openSwitchUserModal}
            title="Trocar Operador ou Bloquear com PIN"
            className="w-full flex items-center justify-center gap-2 py-1.5 px-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-rose-300 font-bold border border-slate-700 transition-colors text-xs text-left cursor-pointer"
          >
            <KeyRound className="w-4 h-4 text-rose-400 shrink-0" />
            {!isCollapsed && <span className="truncate">Trocar Operador</span>}
          </button>

          {!isCollapsed ? (
            <div className="pt-0.5 space-y-0.5">
              <div className="flex items-center justify-between text-[10px]">
                <span className="font-bold text-slate-400">GummyStock</span>
                <span className="text-[9px] bg-slate-800 px-1 py-0.2 rounded text-emerald-400 border border-slate-700 font-mono">
                  v1.4 PIN
                </span>
              </div>
              <p className="text-[10px] text-slate-500 text-left truncate">
                Operador: <strong className="text-slate-300">{currentUser.name}</strong>
              </p>
            </div>
          ) : (
            <div className="flex justify-center" title={`Operador: ${currentUser.name}`}>
              <div className="w-7 h-7 rounded-lg bg-rose-950/60 text-rose-400 flex items-center justify-center font-bold text-xs border border-rose-800/50">
                {currentUser.name.charAt(0)}
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* ================= MOBILE DRAWER ================= */}
      {isMobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          {/* Backdrop Blur Overlay */}
          <div
            className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm transition-opacity animate-in fade-in duration-200"
            onClick={onCloseMobile}
          />

          {/* Mobile Drawer Body */}
          <aside className="relative w-80 max-w-[85vw] bg-slate-900 border-r border-slate-800/80 text-slate-200 h-full shadow-2xl flex flex-col justify-between z-10 animate-in slide-in-from-left duration-300 ease-out overflow-hidden">
            {/* Drawer Top Header */}
            <div className="p-4 bg-slate-950/60 border-b border-slate-800 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                {companyInfo?.logoUrl ? (
                  <img
                    src={companyInfo.logoUrl}
                    alt={companyInfo.tradeName || companyInfo.name || 'Logotipo'}
                    className="w-9 h-9 object-contain rounded-xl shadow-xs shrink-0"
                  />
                ) : (
                  <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-rose-600 to-pink-500 flex items-center justify-center shadow-md font-black text-white text-base shrink-0">
                    G
                  </div>
                )}
                <div className="text-left">
                  <h3 className="text-sm font-extrabold text-white leading-tight">
                    {companyInfo?.tradeName || companyInfo?.name || 'GummyStock'}
                  </h3>
                  <span className="text-[10px] font-semibold text-rose-400">Gestão de Estoque</span>
                </div>
              </div>

              {onCloseMobile && (
                <button
                  onClick={onCloseMobile}
                  className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700/80 transition-all active:scale-90"
                  title="Fechar Menu"
                >
                  <ChevronLeft className="w-5 h-5 text-rose-400" />
                </button>
              )}
            </div>

            {/* Drawer Content com os mesmos 4 grupos organizados */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
              {/* Dashboard */}
              {hasDashboard && (
                <button
                  onClick={() => handleTabClick('dashboard')}
                  className={`w-full flex items-center p-3 rounded-2xl text-xs font-bold transition-all text-left ${
                    activeTab === 'dashboard'
                      ? 'bg-rose-600/25 text-rose-300 border border-rose-500/40 shadow-sm'
                      : 'text-slate-300 hover:text-white bg-slate-800/40 border border-transparent'
                  }`}
                >
                  <LayoutDashboard className="w-4 h-4 mr-3 text-rose-400" />
                  <span>Dashboard</span>
                </button>
              )}

              {/* Estoque */}
              {estoqueItems.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-400 px-1 text-left">
                    Estoque & Operações
                  </p>
                  {estoqueItems.map((item) => {
                    const Icon = item.icon;
                    const isActive = activeTab === item.id;
                    return (
                      <button
                        key={item.id}
                        onClick={() => handleTabClick(item.id)}
                        className={`w-full flex items-center p-2.5 rounded-xl text-xs font-bold transition-all text-left ${
                          isActive
                            ? 'bg-emerald-600/20 text-emerald-300 border border-emerald-500/40'
                            : 'text-slate-300 bg-slate-800/40'
                        }`}
                      >
                        <Icon className="w-4 h-4 mr-2.5 text-emerald-400" />
                        <span>{item.label}</span>
                      </button>
                    );
                  })}

                  {hasEstoqueOps && (
                    <div className="grid grid-cols-2 gap-2 pt-1">
                      {onOpenSaleModal && checkPermission('canRegisterMovements') && (
                        <button
                          onClick={() => {
                            if (onCloseMobile) onCloseMobile();
                            onOpenSaleModal();
                          }}
                          className="flex items-center justify-center gap-1.5 p-2 rounded-xl bg-emerald-600/30 text-emerald-200 border border-emerald-500/40 text-xs font-bold"
                        >
                          <ShoppingBag className="w-3.5 h-3.5 text-white" />
                          <span>Baixa Baleiro</span>
                        </button>
                      )}
                      {checkPermission('canTransferStock') && (
                        <button
                          onClick={() => {
                            if (onCloseMobile) onCloseMobile();
                            onOpenTransferModal();
                          }}
                          className="flex items-center justify-center gap-1.5 p-2 rounded-xl bg-slate-800 text-amber-300 border border-slate-700 text-xs font-bold"
                        >
                          <ArrowRightLeft className="w-3.5 h-3.5 text-amber-400" />
                          <span>Transferir</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Financeiro */}
              {financeiroItems.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-[10px] font-extrabold uppercase tracking-wider text-sky-400 px-1 text-left">
                    Financeiro
                  </p>
                  {financeiroItems.map((item) => {
                    const Icon = item.icon;
                    const isActive = activeTab === item.id;
                    return (
                      <button
                        key={item.id}
                        onClick={() => handleTabClick(item.id)}
                        className={`w-full flex items-center p-2.5 rounded-xl text-xs font-bold transition-all text-left ${
                          isActive
                            ? 'bg-sky-600/20 text-sky-300 border border-sky-500/40'
                            : 'text-slate-300 bg-slate-800/40'
                        }`}
                      >
                        <Icon className="w-4 h-4 mr-2.5 text-sky-400" />
                        <span>{item.label}</span>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Relatórios */}
              {relatoriosItems.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-[10px] font-extrabold uppercase tracking-wider text-amber-400 px-1 text-left">
                    Relatórios & Inteligência
                  </p>
                  {relatoriosItems.map((item) => {
                    const Icon = item.icon;
                    const isActive = activeTab === item.id;
                    return (
                      <button
                        key={item.id}
                        onClick={() => handleTabClick(item.id)}
                        className={`w-full flex items-center p-2.5 rounded-xl text-xs font-bold transition-all text-left ${
                          isActive
                            ? 'bg-amber-600/20 text-amber-300 border border-amber-500/40'
                            : 'text-slate-300 bg-slate-800/40'
                        }`}
                      >
                        <Icon className="w-4 h-4 mr-2.5 text-amber-400" />
                        <span>{item.label}</span>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Configurações */}
              {configItems.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-[10px] font-extrabold uppercase tracking-wider text-purple-400 px-1 text-left">
                    Configurações
                  </p>
                  {configItems.map((item) => {
                    const Icon = item.icon;
                    const isActive = activeTab === item.id;
                    return (
                      <button
                        key={item.id}
                        onClick={() => handleTabClick(item.id)}
                        className={`w-full flex items-center p-2.5 rounded-xl text-xs font-bold transition-all text-left ${
                          isActive
                            ? 'bg-purple-600/20 text-purple-300 border border-purple-500/40'
                            : 'text-slate-300 bg-slate-800/40'
                        }`}
                      >
                        <Icon className="w-4 h-4 mr-2.5 text-purple-400" />
                        <span>{item.label}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Mobile Footer */}
            <div className="p-4 bg-slate-950/80 border-t border-slate-800/80 space-y-2 shrink-0">
              <button
                onClick={() => {
                  if (onCloseMobile) onCloseMobile();
                  openSwitchUserModal();
                }}
                className="w-full flex items-center justify-center gap-2 p-3 rounded-2xl bg-slate-800 hover:bg-slate-700 text-rose-300 font-bold border border-slate-700 text-xs"
              >
                <KeyRound className="w-4 h-4 text-rose-400" />
                <span>Trocar Operador (PIN)</span>
              </button>
              <p className="text-[11px] text-slate-500 text-center">
                Ativo: <strong className="text-slate-300">{currentUser.name}</strong>
              </p>
            </div>
          </aside>
        </div>
      )}
    </>
  );
};
