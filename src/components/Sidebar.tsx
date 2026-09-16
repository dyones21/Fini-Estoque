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
  Sparkles,
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
  | 'sugestao_compra'
  | 'relatorios'
  | 'curva_abc_ranking'
  | 'empresa'
  | 'backup'
  | 'usuarios';

interface SidebarProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  onOpenNFModal: () => void;
  onOpenTransferModal: () => void;
  onOpenSaleModal?: () => void;
  isMobileOpen?: boolean;
  onCloseMobile?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  onOpenNFModal,
  onOpenTransferModal,
  onOpenSaleModal,
  isMobileOpen = false,
  onCloseMobile,
}) => {
  const { setActiveLocation, currentUser, checkPermission, openSwitchUserModal } = useStock();
  const [isCollapsed, setIsCollapsed] = useState<boolean>(() => {
    return localStorage.getItem('FINI_SIDEBAR_COLLAPSED') === 'true';
  });

  const [isConfigOpen, setIsConfigOpen] = useState<boolean>(() => {
    return activeTab === 'backup' || activeTab === 'usuarios' || activeTab === 'empresa';
  });

  useEffect(() => {
    if (activeTab === 'backup' || activeTab === 'usuarios' || activeTab === 'empresa') {
      setIsConfigOpen(true);
    }
  }, [activeTab]);

  const toggleCollapse = () => {
    setIsCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem('FINI_SIDEBAR_COLLAPSED', String(next));
      return next;
    });
  };

  const handleTabClick = (tab: ActiveTab) => {
    setActiveTab(tab);
    if (tab === 'estoque_geral') setActiveLocation('geral');
    if (onCloseMobile) onCloseMobile();
  };

  const mainNavItems = [
    ...(checkPermission('canViewDashboard')
      ? [
          {
            id: 'dashboard',
            label: 'Dashboard',
            icon: LayoutDashboard,
            badge: null,
          },
        ]
      : []),
    ...(checkPermission('canViewStock')
      ? [
          {
            id: 'estoque_geral',
            label: 'Estoque & Depósitos',
            icon: Boxes,
            badge: null,
          },
        ]
      : []),
    ...(checkPermission('canAddNFEntries') || checkPermission('canDeleteNFEntries')
      ? [
          {
            id: 'notas_fiscais',
            label: 'Notas Fiscais Lançadas',
            icon: Receipt,
            badge: null,
          },
        ]
      : []),
    ...(checkPermission('canViewDashboard') || checkPermission('canManageProducts')
      ? [
          {
            id: 'sugestao_compra',
            label: 'Sugestão de Compra',
            icon: ShoppingCart,
            badge: null,
          },
        ]
      : []),
    ...(checkPermission('canViewDashboard') || checkPermission('canViewStock')
      ? [
          {
            id: 'relatorios',
            label: 'Relatórios Operacionais',
            icon: FileBarChart,
            badge: null,
          },
        ]
      : []),
    ...(checkPermission('canViewDashboard')
      ? [
          {
            id: 'curva_abc_ranking',
            label: 'Curva ABC & Ranking',
            icon: TrendingUp,
            badge: null,
          },
        ]
      : []),
  ];

  const configNavItems = [
    ...(checkPermission('canManageBackup') || checkPermission('canManageUsers') || checkPermission('canManageCompany')
      ? [
          {
            id: 'empresa',
            label: 'Dados da Empresa',
            icon: Building2,
            badge: null,
          },
        ]
      : []),
    ...(checkPermission('canManageBackup')
      ? [
          {
            id: 'backup',
            label: 'Backup em Nuvem',
            icon: Cloud,
            badge: null,
          },
        ]
      : []),
    ...(checkPermission('canManageUsers')
      ? [
          {
            id: 'usuarios',
            label: 'Permissões & Usuários',
            icon: ShieldCheck,
            badge: null,
          },
        ]
      : []),
  ];

  return (
    <>
      {/* ================= DESKTOP SIDEBAR ================= */}
      <aside
        className={`hidden lg:flex ${
          isCollapsed ? 'lg:w-20' : 'lg:w-64'
        } bg-slate-900 text-slate-300 shrink-0 border-r border-slate-800 flex-col transition-all duration-300 rounded-3xl overflow-hidden shadow-xl self-start sticky top-20 h-[calc(100vh-6rem)] max-h-[calc(100vh-6rem)]`}
      >
        {/* Header / Toggle Collapse (Fixo no topo) */}
        <div className="p-3 sm:p-4 pb-2.5 border-b border-slate-800 flex items-center justify-between shrink-0 bg-slate-900">
          {!isCollapsed && (
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 px-1">
              Painel de Navegação
            </span>
          )}
          <button
            onClick={toggleCollapse}
            title={isCollapsed ? 'Expandir Menu Lateral' : 'Recolher / Minimizar Menu Lateral'}
            className="flex items-center gap-1.5 p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-all border border-slate-700 text-xs font-semibold ml-auto"
          >
            {isCollapsed ? (
              <PanelLeftOpen className="w-4 h-4 text-rose-400" />
            ) : (
              <>
                <PanelLeftClose className="w-4 h-4 text-rose-400" />
                <span className="text-[11px]">Minimizar</span>
              </>
            )}
          </button>
        </div>

        {/* Área de Navegação Roolável Flexível */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-4 custom-scrollbar">
          {/* Quick Actions */}
          {(checkPermission('canRegisterMovements') || checkPermission('canTransferStock')) && (
            <div className="space-y-2">
              {!isCollapsed && (
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-1 text-left">
                  Operações Rápidas
                </p>
              )}

              {onOpenSaleModal && checkPermission('canRegisterMovements') && (
                <button
                  onClick={onOpenSaleModal}
                  title="Baixa para Baleiro / Pacote Aberto"
                  className={`w-full flex items-center justify-start gap-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold ${
                    isCollapsed ? 'p-3 justify-center' : 'py-2.5 px-3'
                  } rounded-xl text-xs shadow-md shadow-emerald-950/40 transition-all hover:scale-[1.01] active:scale-[0.99] text-left`}
                >
                  <ShoppingBag className="w-4 h-4 shrink-0" />
                  {!isCollapsed && <span className="text-left truncate">Baixa para Baleiro</span>}
                </button>
              )}

              {checkPermission('canTransferStock') && (
                <button
                  onClick={onOpenTransferModal}
                  title="Transferir do Depósito para a Loja"
                  className={`w-full flex items-center justify-start gap-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-semibold ${
                    isCollapsed ? 'p-2.5 justify-center' : 'py-2 px-3'
                  } rounded-xl text-xs transition-colors text-left`}
                >
                  <ArrowRightLeft className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  {!isCollapsed && <span className="text-left truncate">Transferir p/ Loja</span>}
                </button>
              )}
            </div>
          )}

          {/* Navigation List */}
          <div className="space-y-1">
            {!isCollapsed && (
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-1 mb-2 text-left">
                Navegação Principal
              </p>
            )}

            {mainNavItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;

              return (
                <button
                  key={item.id}
                  onClick={() => handleTabClick(item.id as ActiveTab)}
                  title={isCollapsed ? item.label : undefined}
                  className={`w-full flex items-center ${
                    isCollapsed ? 'justify-center p-3' : 'justify-between px-3 py-2.5'
                  } rounded-xl text-xs font-semibold transition-all ${
                    isActive
                      ? 'bg-rose-600/20 text-rose-400 border border-rose-500/30 font-bold'
                      : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/60'
                  }`}
                >
                  <div className="flex items-center gap-3 text-left">
                    <Icon
                      className={`w-4 h-4 shrink-0 ${
                        isActive ? 'text-rose-400' : 'text-slate-400'
                      }`}
                    />
                    {!isCollapsed && <span className="text-left truncate">{item.label}</span>}
                  </div>

                  {!isCollapsed && item.badge && (
                    <span
                      className={`text-[9px] px-1.5 py-0.2 rounded font-bold uppercase shrink-0 ${
                        isActive
                          ? 'bg-rose-500 text-white'
                          : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}

            {/* Configurações Accordion Submenu at the bottom */}
            <div className="pt-2 border-t border-slate-800/80 mt-2 space-y-1">
              <button
                onClick={() => {
                  if (isCollapsed) toggleCollapse();
                  setIsConfigOpen((prev) => !prev);
                }}
                title={isCollapsed ? 'Configurações' : undefined}
                className={`w-full flex items-center ${
                  isCollapsed ? 'justify-center p-3' : 'justify-between px-3 py-2.5'
                } rounded-xl text-xs font-bold transition-all text-slate-300 hover:text-white bg-slate-800/40 hover:bg-slate-800 border border-slate-800/60`}
              >
                <div className="flex items-center gap-3 text-left">
                  <Settings className="w-4 h-4 text-slate-400 shrink-0" />
                  {!isCollapsed && <span className="text-left font-bold truncate">Configurações</span>}
                </div>
                {!isCollapsed && (
                  isConfigOpen ? (
                    <ChevronUp className="w-3.5 h-3.5 text-slate-400" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                  )
                )}
              </button>

              {/* Submenu Items */}
              {(isConfigOpen || isCollapsed) && (
                <div className={`${isCollapsed ? 'space-y-1' : 'pl-3 border-l-2 border-rose-500/40 ml-4 space-y-1 my-1'}`}>
                  {configNavItems.map((item) => {
                    const Icon = item.icon;
                    const isActive = activeTab === item.id;

                    return (
                      <button
                        key={item.id}
                        onClick={() => handleTabClick(item.id as ActiveTab)}
                        title={isCollapsed ? item.label : undefined}
                        className={`w-full flex items-center ${
                          isCollapsed ? 'justify-center p-2.5' : 'justify-between px-3 py-2'
                        } rounded-xl text-xs font-semibold transition-all ${
                          isActive
                            ? 'bg-rose-600/20 text-rose-300 border border-rose-500/30 font-bold'
                            : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/60'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 text-left">
                          <Icon
                            className={`w-3.5 h-3.5 shrink-0 ${
                              isActive ? 'text-rose-400' : 'text-slate-400'
                            }`}
                          />
                          {!isCollapsed && <span className="text-left truncate">{item.label}</span>}
                        </div>

                        {!isCollapsed && item.badge && (
                          <span
                            className={`text-[9px] px-1.5 py-0.2 rounded font-bold uppercase shrink-0 ${
                              isActive
                                ? 'bg-rose-500 text-white'
                                : 'bg-slate-800 text-slate-400'
                            }`}
                          >
                            {item.badge}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Desktop Footer (Fixo no rodapé) */}
        <div className="p-3 border-t border-slate-800 text-[11px] text-slate-500 space-y-2 text-left shrink-0 bg-slate-900">
          <button
            onClick={openSwitchUserModal}
            title="Trocar Operador ou Bloquear com PIN"
            className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-rose-300 font-bold border border-slate-700 transition-colors text-xs text-left"
          >
            <KeyRound className="w-4 h-4 text-rose-400 shrink-0" />
            {!isCollapsed && <span>Trocar Operador (PIN)</span>}
          </button>

          {!isCollapsed ? (
            <>
              <div className="flex items-center justify-between pt-1">
                <span className="font-semibold text-slate-400">GummyStock</span>
                <span className="text-[9px] bg-slate-800 px-1.5 py-0.5 rounded text-emerald-400 border border-slate-700 font-bold">
                  v1.4 PIN System
                </span>
              </div>
              <p className="text-[10px] text-slate-500 text-left truncate">
                Ativo: <strong className="text-slate-300">{currentUser.name}</strong>
              </p>
            </>
          ) : (
            <div className="flex justify-center" title={`GummyStock - Perfil: ${currentUser.name}`}>
              <div className="w-8 h-8 rounded-lg bg-rose-950/60 text-rose-400 flex items-center justify-center font-bold text-xs border border-rose-800/50">
                {currentUser.name.charAt(0)}
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* ================= MOBILE DRAWER (SLEEK OVERLAY) ================= */}
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
                <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-rose-600 to-pink-500 flex items-center justify-center shadow-md font-black text-white text-base">
                  G
                </div>
                <div className="text-left">
                  <h3 className="text-sm font-extrabold text-white leading-tight">GummyStock</h3>
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

            {/* Drawer Scrollable Content */}
            <div className="flex-1 overflow-y-auto p-4 space-y-6 custom-scrollbar">
              
              {/* Quick Actions Card Block */}
              {(checkPermission('canRegisterMovements') || checkPermission('canTransferStock')) && (
                <div className="space-y-2">
                  <p className="text-[11px] font-extrabold uppercase tracking-wider text-rose-400 px-1 text-left flex items-center gap-1">
                    <span>⚡ Operações Rápidas</span>
                  </p>

                  <div className="grid grid-cols-1 gap-2">
                    {onOpenSaleModal && checkPermission('canRegisterMovements') && (
                      <button
                        onClick={() => {
                          if (onCloseMobile) onCloseMobile();
                          onOpenSaleModal();
                        }}
                        className="w-full flex items-center gap-3 p-3 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 active:scale-[0.98] text-white font-extrabold text-xs shadow-lg shadow-emerald-950/40 text-left transition-all"
                      >
                        <div className="p-2 rounded-xl bg-white/10 shrink-0">
                          <ShoppingBag className="w-4 h-4 text-white" />
                        </div>
                        <div>
                          <span className="block text-xs font-bold leading-tight">Baixa para Baleiro</span>
                          <span className="text-[10px] font-normal text-emerald-100 opacity-90">Registrar baixa de pacotes abertos</span>
                        </div>
                      </button>
                    )}

                    {checkPermission('canTransferStock') && (
                      <button
                        onClick={() => {
                          if (onCloseMobile) onCloseMobile();
                          onOpenTransferModal();
                        }}
                        className="w-full flex items-center gap-3 p-2.5 rounded-2xl bg-slate-800 hover:bg-slate-750 border border-slate-700/80 active:scale-[0.98] text-slate-200 font-bold text-xs text-left transition-all"
                      >
                        <div className="p-2 rounded-xl bg-amber-500/10 shrink-0">
                          <ArrowRightLeft className="w-4 h-4 text-amber-400" />
                        </div>
                        <div>
                          <span className="block text-xs font-bold leading-tight text-slate-100">Transferir p/ Loja</span>
                          <span className="text-[10px] font-normal text-slate-400">Movimentar lote entre estoques</span>
                        </div>
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Navigation Modules */}
              <div className="space-y-1.5">
                <p className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400 px-1 mb-2 text-left">
                  Módulos do Sistema
                </p>

                {mainNavItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeTab === item.id;

                  return (
                    <button
                      key={item.id}
                      onClick={() => handleTabClick(item.id as ActiveTab)}
                      className={`w-full flex items-center justify-between p-3 rounded-2xl text-xs font-bold transition-all text-left ${
                        isActive
                          ? 'bg-rose-600/20 text-rose-300 border border-rose-500/40 shadow-sm'
                          : 'text-slate-300 hover:text-white bg-slate-800/40 hover:bg-slate-800 border border-transparent'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`p-2 rounded-xl ${
                            isActive
                              ? 'bg-rose-600 text-white'
                              : 'bg-slate-800 text-slate-400'
                          }`}
                        >
                          <Icon className="w-4 h-4 shrink-0" />
                        </div>
                        <span className="text-xs font-bold">{item.label}</span>
                      </div>

                      {item.badge && (
                        <span
                          className={`text-[9px] px-2 py-0.5 rounded-md font-extrabold uppercase ${
                            isActive
                              ? 'bg-rose-500 text-white'
                              : 'bg-slate-800 text-slate-400 border border-slate-700'
                          }`}
                        >
                          {item.badge}
                        </span>
                      )}
                    </button>
                  );
                })}

                {/* Configurações Submenu in Mobile Drawer */}
                <div className="pt-3 border-t border-slate-800/80 mt-3 space-y-1.5">
                  <button
                    onClick={() => setIsConfigOpen((prev) => !prev)}
                    className="w-full flex items-center justify-between p-3 rounded-2xl text-xs font-bold text-slate-300 bg-slate-800/60 border border-slate-700/60 text-left transition-all"
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-xl bg-slate-800 text-slate-300">
                        <Settings className="w-4 h-4 shrink-0" />
                      </div>
                      <span className="text-xs font-extrabold">Configurações</span>
                    </div>
                    {isConfigOpen ? (
                      <ChevronUp className="w-4 h-4 text-slate-400" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-slate-400" />
                    )}
                  </button>

                  {isConfigOpen && (
                    <div className="pl-3 border-l-2 border-rose-500/40 space-y-1.5 ml-3 pt-1">
                      {configNavItems.map((item) => {
                        const Icon = item.icon;
                        const isActive = activeTab === item.id;

                        return (
                          <button
                            key={item.id}
                            onClick={() => handleTabClick(item.id as ActiveTab)}
                            className={`w-full flex items-center justify-between p-2.5 rounded-xl text-xs font-bold transition-all text-left ${
                              isActive
                                ? 'bg-rose-600/20 text-rose-300 border border-rose-500/40'
                                : 'text-slate-300 hover:text-white bg-slate-800/30 hover:bg-slate-800'
                            }`}
                          >
                            <div className="flex items-center gap-2.5">
                              <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-rose-400' : 'text-slate-400'}`} />
                              <span>{item.label}</span>
                            </div>

                            {item.badge && (
                              <span
                                className={`text-[9px] px-1.5 py-0.5 rounded font-extrabold uppercase ${
                                  isActive ? 'bg-rose-500 text-white' : 'bg-slate-800 text-slate-400 border border-slate-700'
                                }`}
                              >
                                {item.badge}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Drawer Bottom User Footer */}
            <div className="p-4 bg-slate-950/80 border-t border-slate-800 space-y-3 shrink-0 text-left">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-rose-950 text-rose-300 flex items-center justify-center font-black text-xs border border-rose-800/60">
                    {currentUser.name.charAt(0)}
                  </div>
                  <div className="text-left">
                    <span className="block text-xs font-bold text-white leading-tight">
                      {currentUser.name}
                    </span>
                    <span className="text-[10px] text-slate-400 uppercase font-semibold">
                      Operador: {currentUser.role}
                    </span>
                  </div>
                </div>

                <span className="text-[9px] bg-emerald-950 text-emerald-400 px-2 py-0.5 rounded font-bold border border-emerald-800/60">
                  ONLINE
                </span>
              </div>

              <button
                onClick={() => {
                  if (onCloseMobile) onCloseMobile();
                  openSwitchUserModal();
                }}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl bg-rose-950/80 hover:bg-rose-900 text-rose-300 font-bold border border-rose-800/80 transition-all text-xs active:scale-95 text-left"
              >
                <KeyRound className="w-4 h-4 text-rose-400 shrink-0" />
                <span>Trocar Operador / Bloquear (PIN)</span>
              </button>
            </div>
          </aside>
        </div>
      )}
    </>
  );
};

