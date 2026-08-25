import React, { useState, useRef, useEffect } from 'react';
import {
  Store,
  Warehouse,
  Boxes,
  Bell,
  CloudCheck,
  RefreshCw,
  User,
  Check,
  AlertTriangle,
  Clock,
  Shield,
  ChevronDown,
  ShoppingBag,
  Lock,
  KeyRound,
  Users,
  ShieldCheck,
  Menu,
  X,
  Camera,
  Building2,
  Wifi,
  WifiOff,
  BellRing,
  Send,
  LogOut,
} from 'lucide-react';
import { useStock } from '../context/StockContext';
import { LocationType, UserRole } from '../types';
import { formatDateTime } from '../utils/inventoryUtils';
import { ActiveTab } from './Sidebar';
import {
  requestNotificationPermission,
  getNotificationPermission,
  notifyLowStock,
  notifyNewNFEntry,
} from '../utils/notificationService';
import { StockFilterOptions } from './Dashboard';
import { UserAvatar } from './UserAvatar';
import { AvatarPickerModal } from './AvatarPickerModal';

interface HeaderProps {
  activeTab?: ActiveTab;
  setActiveTab?: (tab: ActiveTab) => void;
  onOpenSaleModal?: () => void;
  onToggleMobileMenu?: () => void;
  isMobileMenuOpen?: boolean;
  onNavigateToStock?: (filters: StockFilterOptions) => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  onOpenSaleModal,
  onToggleMobileMenu,
  isMobileMenuOpen = false,
  onNavigateToStock,
}) => {
  const {
    activeLocation,
    setActiveLocation,
    currentUser,
    notifications,
    unreadNotificationCount,
    markNotificationRead,
    markAllNotificationsRead,
    cloudInfo,
    triggerCloudSync,
    openSwitchUserModal,
    logoutAndLock,
    checkPermission,
    products,
    updateUser,
    companyInfo,
  } = useStock();

  const [showNotifications, setShowNotifications] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [isAvatarModalOpen, setIsAvatarModalOpen] = useState(false);
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [pushPerm, setPushPerm] = useState<NotificationPermission>(
    typeof window !== 'undefined' ? getNotificationPermission() : 'default'
  );

  const handleEnablePush = async () => {
    const res = await requestNotificationPermission();
    setPushPerm(res);
  };

  const handleTestPushAlert = async () => {
    if (pushPerm !== 'granted') {
      const res = await requestNotificationPermission();
      setPushPerm(res);
      if (res !== 'granted') return;
    }
    // Fire test notifications
    await notifyLowStock('Bala Fini Dentaduras 500g', 3, 15, 'Depósito');
  };

  const handleTestNFAlert = async () => {
    if (pushPerm !== 'granted') {
      const res = await requestNotificationPermission();
      setPushPerm(res);
      if (res !== 'granted') return;
    }
    await notifyNewNFEntry('NF-98421', 'Fini Distribuidora S.A.', 12, 1450.80);
  };

  const notificationRef = useRef<HTMLDivElement | null>(null);
  const userMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        notificationRef.current &&
        !notificationRef.current.contains(event.target as Node)
      ) {
        setShowNotifications(false);
      }
      if (
        userMenuRef.current &&
        !userMenuRef.current.contains(event.target as Node)
      ) {
        setShowUserMenu(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleNotificationClick = (item: (typeof notifications)[0]) => {
    markNotificationRead(item.id);
    setShowNotifications(false);

    let targetProduct = item.productId
      ? products.find((p) => p.id === item.productId)
      : undefined;

    if (!targetProduct) {
      targetProduct = products.find(
        (p) => item.title.includes(p.name) || item.message.includes(p.name)
      );
    }

    if (targetProduct) {
      if (onNavigateToStock) {
        onNavigateToStock({ searchQuery: targetProduct.name });
      } else if (setActiveTab) {
        setActiveTab('estoque_geral');
      }
    } else if (setActiveTab) {
      setActiveTab('estoque_geral');
    }
  };

  const handleLocationSelect = (loc: LocationType) => {
    setActiveLocation(loc);
    if (setActiveTab) {
      setActiveTab('estoque_geral');
    }
  };

  const getRoleBadge = (role: UserRole) => {
    switch (role) {
      case 'super_admin':
        return { label: 'Proprietário SaaS', bg: 'bg-purple-100 text-purple-800 border-purple-200' };
      case 'admin':
        return { label: 'Administrador', bg: 'bg-rose-100 text-rose-800 border-rose-200' };
      case 'gerente_loja':
        return { label: 'Gerente da Loja', bg: 'bg-amber-100 text-amber-800 border-amber-200' };
      case 'operador_deposito':
        return { label: 'Operador Depósito', bg: 'bg-sky-100 text-sky-800 border-sky-200' };
      case 'caixa':
        return { label: 'Caixa / Vendas', bg: 'bg-emerald-100 text-emerald-800 border-emerald-200' };
      default:
        return { label: 'Operador', bg: 'bg-slate-100 text-slate-800 border-slate-200' };
    }
  };

  const roleInfo = getRoleBadge(currentUser.role);

  return (
    <header className="sticky top-0 z-30 bg-white border-b border-slate-200 shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-2 sm:gap-4">
          
          {/* Logo, Brand & Mobile Menu Trigger */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {onToggleMobileMenu && (
              <button
                onClick={onToggleMobileMenu}
                className="lg:hidden p-2 rounded-xl text-slate-700 hover:bg-slate-100 hover:text-slate-900 transition-colors border border-slate-200 shrink-0"
                title="Abrir Menu de Navegação"
              >
                {isMobileMenuOpen ? (
                  <X className="w-5 h-5 text-rose-600" />
                ) : (
                  <Menu className="w-5 h-5" />
                )}
              </button>
            )}

            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-tr from-rose-600 via-pink-500 to-amber-400 p-0.5 flex items-center justify-center shadow-md shrink-0">
              <div className="w-full h-full bg-white rounded-[10px] flex items-center justify-center font-black text-rose-600 text-lg sm:text-xl tracking-tighter">
                F
              </div>
            </div>
            <div className="text-left hidden xs:block">
              <div className="flex items-center gap-1.5 sm:gap-2">
                <span className="font-extrabold text-slate-900 tracking-tight text-base sm:text-lg text-left">
                  FINI ERP
                </span>
                {companyInfo?.name && (
                  <span className="text-[10px] sm:text-xs font-semibold px-1.5 sm:px-2 py-0.5 rounded-md bg-rose-50 text-rose-600 border border-rose-200/60 text-left hidden sm:inline max-w-48 truncate">
                    {companyInfo.tradeName || companyInfo.name}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 hidden md:block text-left">
                Gestão de Estoque Unificada
              </p>
            </div>
          </div>

          {/* Right Section: Online Status + Sale Button + Master SaaS Button + Notifications + User Menu */}
          <div className="flex items-center gap-2 sm:gap-3">
            
            {/* Online / Offline Status Badge */}
            {!isOnline ? (
              <div
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-amber-500/15 text-amber-800 border border-amber-300 text-[11px] font-bold animate-pulse"
                title="Sistema operando offline com cache local ativado"
              >
                <WifiOff className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                <span className="hidden sm:inline">Offline</span>
              </div>
            ) : (
              <div
                className="hidden xl:flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-emerald-50 text-emerald-800 border border-emerald-200 text-[10px] font-bold"
                title="Sistema conectado e operacional"
              >
                <Wifi className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>Online</span>
              </div>
            )}

            {onOpenSaleModal && checkPermission('canRegisterMovements') && (
              <button
                onClick={onOpenSaleModal}
                title="Baixa para Baleiro (Pacote Aberto)"
                className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs transition-all text-left"
              >
                <ShoppingBag className="w-4 h-4 shrink-0" />
                <span className="text-left">Baixa para Baleiro</span>
              </button>
            )}

            {/* Notification Bell Dropdown */}
            <div ref={notificationRef} className="relative text-left">
              <button
                onClick={() => {
                  setShowNotifications(!showNotifications);
                  setShowUserMenu(false);
                }}
                className="relative p-2 rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors"
                title="Notificações do Estoque"
              >
                <Bell className="w-5 h-5" />
                {unreadNotificationCount > 0 && (
                  <span className="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-rose-600 text-[10px] font-bold text-white shadow-xs">
                    {unreadNotificationCount}
                  </span>
                )}
              </button>

              {/* Notifications Popover */}
              {showNotifications && (
                <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white rounded-2xl shadow-xl border border-slate-200 z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150 text-left">
                  <div className="p-3.5 border-b border-slate-100 flex items-center justify-between bg-slate-50/80 text-left">
                    <div className="flex items-center gap-2 text-left">
                      <Bell className="w-4 h-4 text-rose-600 shrink-0" />
                      <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider text-left">
                        Notificações de Estoque ({unreadNotificationCount})
                      </h4>
                    </div>
                    {unreadNotificationCount > 0 && (
                      <button
                        onClick={markAllNotificationsRead}
                        className="text-[11px] text-rose-600 font-semibold hover:underline text-left"
                      >
                        Marcar todas lidas
                      </button>
                    )}
                  </div>

                  {/* Service Worker Push Banner */}
                  <div className="p-3 bg-slate-900 border-b border-slate-800 text-white space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <BellRing className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                        <span className="text-[11px] font-bold text-slate-200">Push via Service Worker</span>
                      </div>
                      <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${
                        pushPerm === 'granted'
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                          : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                      }`}>
                        {pushPerm === 'granted' ? 'Ativado' : 'Pendente'}
                      </span>
                    </div>

                    {pushPerm !== 'granted' ? (
                      <button
                        onClick={handleEnablePush}
                        className="w-full py-1.5 px-3 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-xl text-[11px] flex items-center justify-center gap-1.5 transition-all shadow-xs cursor-pointer"
                      >
                        <BellRing className="w-3.5 h-3.5" />
                        <span>Permitir Notificações Push</span>
                      </button>
                    ) : (
                      <div className="flex items-center gap-2 pt-0.5">
                        <button
                          onClick={handleTestPushAlert}
                          className="flex-1 py-1 px-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white rounded-lg text-[10px] font-bold border border-slate-700 flex items-center justify-center gap-1 transition-colors cursor-pointer"
                          title="Simular disparo de alerta de estoque baixo pelo SW"
                        >
                          <Send className="w-3 h-3 text-amber-400" />
                          <span>Testar Estoque Baixo</span>
                        </button>
                        <button
                          onClick={handleTestNFAlert}
                          className="flex-1 py-1 px-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white rounded-lg text-[10px] font-bold border border-slate-700 flex items-center justify-center gap-1 transition-colors cursor-pointer"
                          title="Simular disparo de alerta de nova NF pelo SW"
                        >
                          <Send className="w-3 h-3 text-sky-400" />
                          <span>Testar Nova NF</span>
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="max-h-80 overflow-y-auto divide-y divide-slate-100 text-left">
                    {notifications.length === 0 ? (
                      <div className="p-6 text-center text-xs text-slate-500">
                        Nenhum alerta de estoque ou validade no momento.
                      </div>
                    ) : (
                      notifications.map((item) => (
                        <div
                          key={item.id}
                          onClick={() => handleNotificationClick(item)}
                          className={`p-3.5 text-xs transition-all cursor-pointer hover:bg-rose-50/80 flex gap-2.5 items-start text-left border-l-4 group ${
                            !item.read
                              ? 'bg-rose-50/40 font-medium border-rose-500'
                              : 'text-slate-600 border-transparent hover:border-slate-300'
                          }`}
                        >
                          {item.type === 'expiration' ? (
                            <Clock className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                          ) : (
                            <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                          )}
                          <div className="flex-1 text-left min-w-0">
                            <div className="flex items-center justify-between text-left gap-1">
                              <p className="font-bold text-slate-900 text-xs text-left truncate">{item.title}</p>
                              {!item.read && (
                                <span className="w-2 h-2 rounded-full bg-rose-500 shrink-0" />
                              )}
                            </div>
                            <p className="text-[11px] text-slate-600 mt-0.5 leading-snug text-left">
                              {item.message}
                            </p>
                            <div className="mt-2 flex items-center justify-between text-[10px] text-rose-700 font-extrabold group-hover:text-rose-600">
                              <span className="flex items-center gap-1 bg-white/80 group-hover:bg-rose-100/80 px-2 py-0.5 rounded-md border border-rose-200/60 shadow-2xs transition-colors">
                                <span>🔍 Localizar produto no estoque</span>
                                <span className="group-hover:translate-x-0.5 transition-transform">→</span>
                              </span>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* User Profile Menu */}
            <div ref={userMenuRef} className="relative text-left">
              <button
                onClick={() => {
                  setShowUserMenu(!showUserMenu);
                  setShowNotifications(false);
                }}
                className="flex items-center justify-start text-left gap-2 p-1.5 pl-2.5 rounded-xl border border-slate-200 hover:border-slate-300 hover:bg-slate-50 transition-all"
              >
                <div className="hidden sm:block text-left">
                  <p className="text-xs font-bold text-slate-800 leading-none text-left">
                    {currentUser.name.split(' ')[0]}
                  </p>
                  <span
                    className={`inline-block text-[10px] font-semibold px-1.5 py-0.2 mt-0.5 rounded border text-left ${roleInfo.bg}`}
                  >
                    {roleInfo.label}
                  </span>
                </div>
                <UserAvatar
                  avatarUrl={currentUser.avatarUrl}
                  name={currentUser.name}
                  className="w-8 h-8 rounded-lg shadow-2xs"
                  iconClassName="w-4 h-4"
                />
                <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              </button>

              {/* User Menu Popover */}
              {showUserMenu && (
                <div className="absolute right-0 mt-2 w-72 bg-white rounded-2xl shadow-xl border border-slate-200 z-50 overflow-hidden p-2 text-left">
                  <div className="p-3 border-b border-slate-100 text-left bg-slate-50 rounded-xl mb-1 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-black text-slate-900 text-left truncate">{currentUser.name}</p>
                      <p className="text-[11px] text-slate-500 truncate text-left">{currentUser.email}</p>
                      <div className="mt-1 flex items-center gap-1.5 text-[11px] font-mono text-slate-700">
                        <span>Cargo: <strong>{roleInfo.label}</strong></span>
                      </div>
                    </div>
                    <UserAvatar avatarUrl={currentUser.avatarUrl} name={currentUser.name} className="w-10 h-10 rounded-xl" />
                  </div>

                  <div className="space-y-1 pt-1 text-left">
                    <button
                      onClick={() => {
                        setShowUserMenu(false);
                        setIsAvatarModalOpen(true);
                      }}
                      className="w-full flex items-center justify-between p-2.5 rounded-xl text-xs font-bold text-amber-900 bg-amber-50 hover:bg-amber-100/80 border border-amber-200/80 transition-colors text-left group"
                    >
                      <div className="flex items-center gap-2 text-left">
                        <Camera className="w-4 h-4 text-amber-600 shrink-0 group-hover:scale-110 transition-transform" />
                        <span className="text-left">Alterar Minha Foto / Emoji</span>
                      </div>
                      <span className="text-[10px] bg-amber-600 text-white font-extrabold px-2 py-0.5 rounded shadow-2xs">
                        📸 Alterar
                      </span>
                    </button>

                    <button
                      onClick={() => {
                        setShowUserMenu(false);
                        openSwitchUserModal();
                      }}
                      className="w-full flex items-center justify-between p-2.5 rounded-xl text-xs font-bold text-slate-800 hover:bg-slate-100 transition-colors text-left"
                    >
                      <div className="flex items-center gap-2 text-left">
                        <Lock className="w-4 h-4 text-rose-600 shrink-0" />
                        <span className="text-left">Trocar Operador (PIN)</span>
                      </div>
                      <span className="text-[10px] bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded font-mono">
                        Bloquear
                      </span>
                    </button>

                    {checkPermission('canManageUsers') && (
                      <button
                        onClick={() => {
                          setShowUserMenu(false);
                          if (setActiveTab) setActiveTab('usuarios');
                        }}
                        className="w-full flex items-center justify-between p-2.5 rounded-xl text-xs font-bold text-rose-700 hover:bg-rose-50 transition-colors text-left border border-rose-100"
                      >
                        <div className="flex items-center gap-2 text-left">
                          <ShieldCheck className="w-4 h-4 text-rose-600 shrink-0" />
                          <span className="text-left">Gerenciar Usuários & PINs</span>
                        </div>
                        <span className="text-[10px] bg-rose-600 text-white font-bold px-1.5 py-0.5 rounded">
                          Admin
                        </span>
                      </button>
                    )}

                    <button
                      onClick={async () => {
                        setShowUserMenu(false);
                        logoutAndLock();
                      }}
                      className="w-full flex items-center justify-between p-2.5 rounded-xl text-xs font-bold text-red-600 hover:bg-red-50 transition-colors text-left border-t border-slate-100 mt-1 cursor-pointer"
                    >
                      <div className="flex items-center gap-2 text-left">
                        <LogOut className="w-4 h-4 text-red-600 shrink-0" />
                        <span className="text-left">Sair da Conta (Logout)</span>
                      </div>
                    </button>
                  </div>
                </div>
              )}
            </div>

          </div>
        </div>
      </div>

      {/* Avatar / Photo Picker Modal for logged-in user */}
      <AvatarPickerModal
        isOpen={isAvatarModalOpen}
        onClose={() => setIsAvatarModalOpen(false)}
        currentAvatarUrl={currentUser.avatarUrl}
        userName={currentUser.name}
        onSelectAvatar={(newAvatarUrl) => {
          updateUser({
            ...currentUser,
            avatarUrl: newAvatarUrl,
          });
        }}
      />
    </header>
  );
};
