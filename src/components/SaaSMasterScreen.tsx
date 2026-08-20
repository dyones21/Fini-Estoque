/**
 * NOTA ARQUITETURAL - EXPANSÃO SAAS MULTI-TENANT:
 * Este componente (SaaSMasterScreen) está preservado para a fase futura de expansão SaaS.
 * Na fase atual, o ERP opera como Single-Tenant dedicado para "Fini Nova Friburgo".
 * A reativação desta tela ocorrerá quando o PostgreSQL receber colunas 'tenant_id' com particionamento/isolamento por empresa.
 */

import React, { useState } from 'react';
import {
  Building2,
  Plus,
  ShieldCheck,
  CheckCircle2,
  X,
  Database,
  Users,
  Boxes,
  KeyRound,
  Download,
  Upload,
  RefreshCw,
  TrendingUp,
  Globe,
  Sparkles,
  LogOut,
  Search,
  Lock,
  UserPlus,
  Activity,
  Check,
  AlertTriangle,
  Server,
  Layers,
  Pencil,
  Trash2,
} from 'lucide-react';
import { useStock } from '../context/StockContext';
import { Tenant, UserProfile, UserRole } from '../types';
import { getRolePermissions } from '../utils/permissionUtils';
import { DeleteTenantModal } from './DeleteTenantModal';

interface SaaSMasterScreenProps {
  onSwitchToERP?: () => void;
}

export const SaaSMasterScreen: React.FC<SaaSMasterScreenProps> = ({ onSwitchToERP }) => {
  const {
    tenants,
    addTenant,
    updateTenant,
    deleteTenant,
    setCurrentTenantId,
    users,
    allUsers,
    addUser,
    updateUser,
    deleteUser,
    products,
    movements,
    currentUser,
    logoutAndLock,
    triggerCloudSync,
    cloudInfo,
  } = useStock();

  const [activeTab, setActiveTab] = useState<'tenants' | 'new_company' | 'users' | 'database'>('tenants');
  const [tenantToDelete, setTenantToDelete] = useState<Tenant | null>(null);

  // Search filters
  const [tenantSearch, setTenantSearch] = useState('');
  const [userSearch, setUserSearch] = useState('');

  // Edit Tenant State & Handler
  const [editingTenant, setEditingTenant] = useState<Tenant | null>(null);
  const [editTenantCode, setEditTenantCode] = useState('');
  const [editTenantName, setEditTenantName] = useState('');
  const [editTenantCNPJ, setEditTenantCNPJ] = useState('');
  const [editTenantCity, setEditTenantCity] = useState('');
  const [editTenantState, setEditTenantState] = useState('');
  const [editTenantActive, setEditTenantActive] = useState(true);

  const openEditTenant = (tenant: Tenant) => {
    setEditingTenant(tenant);
    setEditTenantCode(tenant.code);
    setEditTenantName(tenant.name);
    setEditTenantCNPJ(tenant.cnpj || '');
    setEditTenantCity(tenant.city || '');
    setEditTenantState(tenant.state || '');
    setEditTenantActive(tenant.active);
  };

  const handleSaveTenantEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTenant) return;

    updateTenant({
      ...editingTenant,
      code: editTenantCode.toUpperCase().replace(/\s+/g, '-'),
      name: editTenantName,
      cnpj: editTenantCNPJ || '00.000.000/0001-00',
      city: editTenantCity || 'Cidade',
      state: editTenantState.toUpperCase() || 'UF',
      active: editTenantActive,
    });

    setEditingTenant(null);
  };

  // Edit User State & Handlers
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [editUserName, setEditUserName] = useState('');
  const [editUserEmail, setEditUserEmail] = useState('');
  const [editUserRole, setEditUserRole] = useState<UserRole>('operador_deposito');
  const [editUserPin, setEditUserPin] = useState('');
  const [editUserTenantIds, setEditUserTenantIds] = useState<string[]>(['all']);
  const [editUserActive, setEditUserActive] = useState(true);
  const [editUserAvatarUrl, setEditUserAvatarUrl] = useState('emoji:👤');

  const openEditUser = (user: UserProfile) => {
    setEditingUser(user);
    setEditUserName(user.name);
    setEditUserEmail(user.email);
    setEditUserRole(user.role);
    setEditUserPin(user.pin);
    setEditUserTenantIds(user.tenantIds || ['all']);
    setEditUserActive(user.active !== false);
    setEditUserAvatarUrl(user.avatarUrl || 'emoji:👤');
  };

  const handleSaveUserEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;

    const basePerms = getRolePermissions(editUserRole);
    const updatedPerms = editingUser.role === editUserRole && editingUser.permissions
      ? editingUser.permissions
      : basePerms;

    const updated: UserProfile = {
      ...editingUser,
      name: editUserName,
      email: editUserEmail,
      role: editUserRole,
      pin: editUserPin,
      tenantIds: editUserTenantIds,
      active: editUserActive,
      avatarUrl: editUserAvatarUrl,
      permissions: updatedPerms,
    };

    updateUser(updated);
    setEditingUser(null);
  };

  const handleDeleteUserSaaS = (userId: string) => {
    if (confirm('Tem certeza que deseja excluir permanentemente este usuário do SaaS?')) {
      deleteUser(userId);
      setEditingUser(null);
    }
  };

  // New Company Form State
  const [newCompanyCode, setNewCompanyCode] = useState('');
  const [newCompanyName, setNewCompanyName] = useState('');
  const [newCompanyCNPJ, setNewCompanyCNPJ] = useState('');
  const [newCompanyCity, setNewCompanyCity] = useState('');
  const [newCompanyState, setNewCompanyState] = useState('');
  const [adminName, setAdminName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPin, setAdminPin] = useState('');
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // New User Form State for Tab 3
  const [isAddingUser, setIsAddingUser] = useState(false);
  const [newUserName, setNewUserName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPin, setNewUserPin] = useState('');
  const [newUserTenantId, setNewUserTenantId] = useState(tenants[0]?.id || 'all');
  const [newUserRole, setNewUserRole] = useState<UserRole>('admin');

  // Filtered tenants and users
  const filteredTenants = tenants.filter(
    (t) =>
      t.name.toLowerCase().includes(tenantSearch.toLowerCase()) ||
      t.code.toLowerCase().includes(tenantSearch.toLowerCase()) ||
      (t.cnpj && t.cnpj.includes(tenantSearch))
  );

  const userListToDisplay = allUsers && allUsers.length > 0 ? allUsers : users;

  const filteredUsers = userListToDisplay.filter(
    (u) =>
      u.name.toLowerCase().includes(userSearch.toLowerCase()) ||
      u.email.toLowerCase().includes(userSearch.toLowerCase())
  );

  const handleCreateCompany = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCompanyCode || !newCompanyName) return;

    // Create Tenant
    const createdTenant = addTenant({
      code: newCompanyCode.toUpperCase().replace(/\s+/g, '-'),
      name: newCompanyName,
      cnpj: newCompanyCNPJ || '00.000.000/0001-00',
      city: newCompanyCity || 'Cidade',
      state: newCompanyState.toUpperCase() || 'UF',
      active: true,
      isMaster: false,
    });

    // Create Initial Admin User for this Company
    if (adminName && adminEmail) {
      const newAdmin: UserProfile = {
        id: `user-${Date.now()}`,
        name: adminName,
        email: adminEmail,
        role: 'admin',
        pin: adminPin.trim() || undefined,
        active: true,
        tenantIds: [createdTenant.id],
        avatarUrl: 'emoji:🏢',
        permissions: {
          canViewDashboard: true,
          canViewStock: true,
          canManageProducts: true,
          canAddNFEntries: true,
          canTransferStock: true,
          canRegisterMovements: true,
          canManageUsers: true,
          canManageBackup: true,
        },
      };
      addUser(newAdmin);
    }

    setSuccessMsg(
      `Empresa "${newCompanyName}" cadastrada com sucesso! Código de Acesso: ${createdTenant.code}`
    );

    // Reset Form
    setNewCompanyCode('');
    setNewCompanyName('');
    setNewCompanyCNPJ('');
    setNewCompanyCity('');
    setNewCompanyState('');
    setAdminName('');
    setAdminEmail('');
    setAdminPin('');

    setTimeout(() => {
      setSuccessMsg(null);
      setActiveTab('tenants');
    }, 2000);
  };

  const handleCreateGlobalUser = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUserName || !newUserEmail) return;

    const createdUser: UserProfile = {
      id: `user-${Date.now()}`,
      name: newUserName,
      email: newUserEmail,
      role: newUserRole,
      pin: newUserPin.trim() || undefined,
      active: true,
      tenantIds: [newUserTenantId],
      avatarUrl: 'emoji:👤',
      permissions: getRolePermissions(newUserRole),
    };

    addUser(createdUser);
    setIsAddingUser(false);
    setNewUserName('');
    setNewUserEmail('');
    setNewUserPin('');
  };

  const handleExportDatabase = () => {
    const fullBackup = {
      timestamp: new Date().toISOString(),
      tenants,
      users,
      productsCount: products.length,
      movementsCount: movements.length,
      products,
      movements,
    };

    const blob = new Blob([JSON.stringify(fullBackup, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `SAAS_MASTER_FULL_BACKUP_${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans antialiased selection:bg-purple-600 selection:text-white">
      
      {/* SaaS Master Top Header Navigation */}
      <header className="bg-slate-900/95 backdrop-blur-md border-b border-slate-800/80 sticky top-0 z-40 shadow-2xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between gap-4">
          
          {/* Brand & Master Status */}
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 bg-gradient-to-tr from-purple-600 via-indigo-600 to-rose-500 text-white rounded-2xl flex items-center justify-center font-black text-xl shadow-lg shadow-purple-950/60 shrink-0">
              👑
            </div>
            <div>
              <h1 className="text-lg sm:text-xl font-black text-white tracking-tight leading-none">
                Painel SaaS Master
              </h1>
              <p className="text-xs text-slate-400 font-medium mt-1">
                Gestão Global Multi-Empresas
              </p>
            </div>
          </div>

          {/* Center/Right Indicators & User Control */}
          <div className="flex items-center gap-3 sm:gap-4">
            
            {/* Server Status Pill */}
            <div className="hidden md:flex items-center gap-2 bg-slate-950/80 border border-slate-800/80 px-3 py-1.5 rounded-xl text-xs shadow-inner">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span className="text-slate-300 font-bold">Servidor Online</span>
            </div>

            {/* Cloud Sync Status Pill */}
            <div className="hidden lg:flex items-center gap-1.5 bg-slate-950/80 border border-slate-800/80 px-3 py-1.5 rounded-xl text-xs text-emerald-400 font-bold">
              <Database className="w-3.5 h-3.5 text-emerald-400" />
              <span>Nuvem Ativa</span>
            </div>

            {/* User Profile Card */}
            <div className="flex items-center gap-3 pl-3 border-l border-slate-800/80">
              <div className="text-right hidden sm:block">
                <p className="text-xs font-bold text-white">{currentUser?.name || 'Dyones'}</p>
                <p className="text-[10px] text-purple-400 font-mono font-medium">{currentUser?.email || 'master@saas.com'}</p>
              </div>

              {onSwitchToERP && (
                <button
                  onClick={onSwitchToERP}
                  className="px-3.5 py-2.5 bg-indigo-950/90 hover:bg-indigo-900 text-indigo-200 border border-indigo-700/80 font-bold rounded-xl text-xs flex items-center gap-2 transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer shadow-md shadow-indigo-950/40 shrink-0"
                  title="Acessar o ERP de Estoque Geral"
                >
                  <Boxes className="w-4 h-4 text-indigo-400" />
                  <span className="hidden sm:inline">Ver Painel ERP</span>
                </button>
              )}

              <button
                onClick={logoutAndLock}
                className="px-3.5 py-2.5 bg-rose-950/70 hover:bg-rose-900 text-rose-200 border border-rose-800/70 font-bold rounded-xl text-xs flex items-center gap-2 transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer shadow-md shadow-rose-950/40 shrink-0"
                title="Sair do Painel Master"
              >
                <LogOut className="w-4 h-4 text-rose-400" />
                <span className="hidden sm:inline">Sair do Master</span>
              </button>
            </div>

          </div>
        </div>
      </header>

      {/* Main SaaS Portal Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        
        {/* Top Summary Metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          
          <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl shadow-lg relative overflow-hidden group hover:border-purple-500/50 transition-colors">
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
              <Building2 className="w-16 h-16 text-purple-400" />
            </div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Empresas Clientes</p>
            <div className="flex items-baseline gap-2 mt-2">
              <p className="text-3xl font-black text-white">{tenants.length}</p>
              <span className="text-xs font-bold text-emerald-400">
                ({tenants.filter((t) => t.active).length} ativas)
              </span>
            </div>
            <p className="text-[11px] text-slate-500 mt-2">Licenciadas no Sistema ERP Multi-Empresas</p>
          </div>

          <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl shadow-lg relative overflow-hidden group hover:border-indigo-500/50 transition-colors">
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
              <Users className="w-16 h-16 text-indigo-400" />
            </div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Usuários Globais</p>
            <p className="text-3xl font-black text-indigo-400 mt-2">{users.length}</p>
            <p className="text-[11px] text-slate-500 mt-2">Cadastrados nas diversas unidades</p>
          </div>

          <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl shadow-lg relative overflow-hidden group hover:border-rose-500/50 transition-colors">
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
              <Boxes className="w-16 h-16 text-rose-400" />
            </div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Produtos em Estoques</p>
            <p className="text-3xl font-black text-rose-400 mt-2">{products.length}</p>
            <p className="text-[11px] text-slate-500 mt-2">Cadastros totais gerenciados</p>
          </div>

          <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl shadow-lg relative overflow-hidden group hover:border-emerald-500/50 transition-colors">
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
              <Database className="w-16 h-16 text-emerald-400" />
            </div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Banco de Dados Cloud</p>
            <div className="flex items-center gap-2 mt-2">
              <span className="w-3 h-3 rounded-full bg-emerald-500"></span>
              <p className="text-xl font-black text-white">Sincronizado</p>
            </div>
            <p className="text-[11px] text-slate-500 mt-2">Log de movimentações: {movements.length}</p>
          </div>

        </div>

        {/* Tab Navigation Menu */}
        <div className="bg-slate-900 p-2 rounded-2xl border border-slate-800 flex items-center gap-2 overflow-x-auto shadow-md">
          
          <button
            onClick={() => setActiveTab('tenants')}
            className={`py-2.5 px-5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 shrink-0 cursor-pointer ${
              activeTab === 'tenants'
                ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-lg shadow-purple-950/50'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Building2 className="w-4 h-4" />
            <span>Empresas Clientes ({tenants.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('new_company')}
            className={`py-2.5 px-5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 shrink-0 cursor-pointer ${
              activeTab === 'new_company'
                ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-lg shadow-purple-950/50'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Plus className="w-4 h-4" />
            <span>+ Cadastrar Nova Empresa</span>
          </button>

          <button
            onClick={() => setActiveTab('users')}
            className={`py-2.5 px-5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 shrink-0 cursor-pointer ${
              activeTab === 'users'
                ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-lg shadow-purple-950/50'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Gestão Global de Usuários ({users.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('database')}
            className={`py-2.5 px-5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 shrink-0 cursor-pointer ${
              activeTab === 'database'
                ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-lg shadow-purple-950/50'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Database className="w-4 h-4" />
            <span>Banco de Dados & Backup</span>
          </button>

        </div>

        {/* Tab 1: Tenant Companies List */}
        {activeTab === 'tenants' && (
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-6 shadow-xl">
            
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
              <div>
                <h2 className="text-lg font-black text-white">Empresas Cadastradas no SaaS</h2>
                <p className="text-xs text-slate-400">
                  Gerencie o status de licença e permissão de acesso de cada cliente
                </p>
              </div>

              <div className="flex items-center gap-3 w-full sm:w-auto">
                <div className="relative flex-1 sm:w-64">
                  <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Buscar empresa por nome ou código..."
                    value={tenantSearch}
                    onChange={(e) => setTenantSearch(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 text-white text-xs pl-9 pr-3 py-2 rounded-xl outline-none focus:border-purple-500"
                  />
                </div>

                <button
                  onClick={() => setActiveTab('new_company')}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 transition-colors cursor-pointer shrink-0"
                >
                  <Plus className="w-4 h-4" />
                  <span>Nova Empresa</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredTenants.map((t) => {
                const companyUsers = userListToDisplay.filter(
                  (u) => u.tenantIds?.includes(t.id) || u.tenantIds?.includes('all')
                );
                const companyProducts = products.filter((p) => p.tenantId === t.id);

                return (
                  <div
                    key={t.id}
                    className="bg-slate-950 border border-slate-800/80 p-5 rounded-2xl flex flex-col justify-between space-y-4 hover:border-slate-700 transition-all group"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="text-sm font-black text-white group-hover:text-purple-300 transition-colors">
                              {t.name}
                            </h3>
                            {t.isMaster && (
                              <span className="bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[9px] font-black px-1.5 py-0.2 rounded">
                                MATRIZ SAAS
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-purple-400 font-mono font-bold mt-1">
                            Código de Login: <span className="bg-purple-950/80 px-1.5 py-0.5 rounded border border-purple-800/50 text-purple-200">{t.code}</span>
                          </p>
                        </div>

                        <span
                          className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${
                            t.active
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                              : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                          }`}
                        >
                          {t.active ? 'Ativa / Liberada' : 'Bloqueada'}
                        </span>
                      </div>

                      <p className="text-[11px] text-slate-400 mt-2">
                        CNPJ: {t.cnpj || 'Não Informado'} • {t.city || 'Cidade'}/{t.state || 'UF'}
                      </p>
                    </div>

                    <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400 font-medium">
                      <div className="flex items-center gap-3">
                        <span title="Usuários Ativos">👥 {companyUsers.length} usu.</span>
                        <span title="Produtos Cadastrados">📦 {companyProducts.length} prod.</span>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            setCurrentTenantId(t.id);
                            if (onSwitchToERP) onSwitchToERP();
                          }}
                          className="px-2.5 py-1 text-xs font-bold text-emerald-300 bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-800/60 rounded-lg flex items-center gap-1 transition-colors cursor-pointer"
                          title="Entrar no Painel de Estoque desta Empresa"
                        >
                          <Boxes className="w-3.5 h-3.5 text-emerald-400" />
                          <span>Acessar ERP</span>
                        </button>

                        <button
                          onClick={() => openEditTenant(t)}
                          className="px-2.5 py-1 text-xs font-bold text-purple-300 bg-purple-950/80 hover:bg-purple-900 border border-purple-800/60 rounded-lg flex items-center gap-1 transition-colors cursor-pointer"
                          title="Editar Cadastro da Empresa"
                        >
                          <Pencil className="w-3.5 h-3.5 text-purple-400" />
                          <span>Editar</span>
                        </button>

                        <button
                          onClick={() => {
                            updateTenant({ ...t, active: !t.active });
                          }}
                          className={`text-xs font-bold px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
                            t.active
                              ? 'text-amber-400 hover:bg-amber-950/60 border border-amber-900/40'
                              : 'text-emerald-400 hover:bg-emerald-950/60 border border-emerald-900/40'
                          }`}
                        >
                          {t.active ? 'Bloquear' : 'Ativar'}
                        </button>

                        {!t.isMaster && (
                          <button
                            onClick={() => setTenantToDelete(t)}
                            className="p-1.5 text-xs font-bold text-rose-400 bg-rose-950/80 hover:bg-rose-900 hover:text-white border border-rose-800/60 rounded-lg flex items-center justify-center transition-colors cursor-pointer"
                            title="Excluir Empresa Permanentemente com PIN"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                  </div>
                );
              })}
            </div>

          </div>
        )}

        {/* Tab 2: Create New Company Form */}
        {activeTab === 'new_company' && (
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-2xl mx-auto shadow-xl space-y-6">
            
            <div className="border-b border-slate-800 pb-4">
              <h2 className="text-lg font-black text-white flex items-center gap-2">
                <Building2 className="w-5 h-5 text-purple-400" />
                Cadastrar Nova Empresa Cliente
              </h2>
              <p className="text-xs text-slate-400">
                Gere um novo acesso exclusivo para uma empresa cliente utilizar seu ERP
              </p>
            </div>

            <form onSubmit={handleCreateCompany} className="space-y-5">
              
              <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800/80 space-y-4">
                <h3 className="text-xs font-bold text-purple-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5" />
                  1. Dados da Empresa Cliente
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-300 mb-1">
                      Código de Login Curto*:
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Ex: EMPRESA01, LOJA-SP"
                      value={newCompanyCode}
                      onChange={(e) => setNewCompanyCode(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 text-white text-xs py-2.5 px-3 rounded-xl outline-none focus:border-purple-500 uppercase font-mono font-bold"
                    />
                    <p className="text-[10px] text-slate-500 mt-1">Utilizado pelos funcionários na tela de login</p>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-300 mb-1">
                      Nome da Empresa / Razão Social*:
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Nome da empresa cliente"
                      value={newCompanyName}
                      onChange={(e) => setNewCompanyName(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 text-white text-xs py-2.5 px-3 rounded-xl outline-none focus:border-purple-500 font-medium"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-300 mb-1">CNPJ:</label>
                    <input
                      type="text"
                      placeholder="00.000.000/0001-00"
                      value={newCompanyCNPJ}
                      onChange={(e) => setNewCompanyCNPJ(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 text-white text-xs py-2.5 px-3 rounded-xl outline-none focus:border-purple-500 font-mono"
                    />
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <div className="col-span-2">
                      <label className="block text-xs font-bold text-slate-300 mb-1">Cidade:</label>
                      <input
                        type="text"
                        placeholder="Cidade"
                        value={newCompanyCity}
                        onChange={(e) => setNewCompanyCity(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 text-white text-xs py-2.5 px-3 rounded-xl outline-none focus:border-purple-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-300 mb-1">UF:</label>
                      <input
                        type="text"
                        maxLength={2}
                        placeholder="RJ"
                        value={newCompanyState}
                        onChange={(e) => setNewCompanyState(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 text-white text-xs py-2.5 px-3 rounded-xl outline-none focus:border-purple-500 uppercase font-bold text-center"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800/80 space-y-4">
                <h3 className="text-xs font-bold text-indigo-400 uppercase tracking-wider flex items-center gap-1.5">
                  <UserPlus className="w-3.5 h-3.5" />
                  2. Credenciais do Administrador da Empresa
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-300 mb-1">Nome do Gerente:</label>
                    <input
                      type="text"
                      placeholder="Nome do responsável"
                      value={adminName}
                      onChange={(e) => setAdminName(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 text-white text-xs py-2.5 px-3 rounded-xl outline-none focus:border-purple-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-300 mb-1">E-mail de Login:</label>
                    <input
                      type="email"
                      placeholder="admin@empresa.com"
                      value={adminEmail}
                      onChange={(e) => setAdminEmail(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 text-white text-xs py-2.5 px-3 rounded-xl outline-none focus:border-purple-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-300 mb-1">PIN Inicial (4 dígitos):</label>
                    <input
                      type="text"
                      maxLength={4}
                      placeholder="1234"
                      value={adminPin}
                      onChange={(e) => setAdminPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                      className="w-full bg-slate-900 border border-slate-700 text-white text-xs py-2.5 px-3 rounded-xl outline-none focus:border-purple-500 font-mono text-center font-bold"
                    />
                  </div>
                </div>
              </div>

              {successMsg && (
                <div className="p-3.5 bg-emerald-950/80 border border-emerald-800 text-emerald-300 text-xs font-bold rounded-xl flex items-center justify-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>{successMsg}</span>
                </div>
              )}

              <button
                type="submit"
                className="w-full py-3.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold rounded-2xl shadow-xl transition-all text-xs sm:text-sm flex items-center justify-center gap-2 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Salvar & Liberar Empresa Cliente</span>
              </button>

            </form>
          </div>
        )}

        {/* Tab 3: Global Users Management */}
        {activeTab === 'users' && (
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-6 shadow-xl">
            
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
              <div>
                <h2 className="text-lg font-black text-white">Usuários em Todo o Sistema SaaS</h2>
                <p className="text-xs text-slate-400">Visualização global de contas e controle de permissões</p>
              </div>

              <div className="flex items-center gap-3 w-full sm:w-auto">
                <div className="relative flex-1 sm:w-64">
                  <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Buscar usuário por nome ou e-mail..."
                    value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 text-white text-xs pl-9 pr-3 py-2 rounded-xl outline-none focus:border-purple-500"
                  />
                </div>

                <button
                  onClick={() => setIsAddingUser(!isAddingUser)}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 transition-colors cursor-pointer shrink-0"
                >
                  <UserPlus className="w-4 h-4" />
                  <span>{isAddingUser ? 'Fechar Formulário' : 'Novo Usuário'}</span>
                </button>
              </div>
            </div>

            {/* Quick Add User Form */}
            {isAddingUser && (
              <form onSubmit={handleCreateGlobalUser} className="bg-slate-950 p-4 rounded-2xl border border-indigo-900/50 space-y-4">
                <h3 className="text-xs font-bold text-indigo-400 uppercase tracking-wider">Cadastrar Novo Usuário no SaaS</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                  <input
                    type="text"
                    required
                    placeholder="Nome completo *"
                    value={newUserName}
                    onChange={(e) => setNewUserName(e.target.value)}
                    className="bg-slate-900 border border-slate-700 text-white text-xs py-2 px-3 rounded-xl outline-none focus:border-indigo-500 font-bold"
                  />
                  <input
                    type="email"
                    required
                    placeholder="E-mail de login *"
                    value={newUserEmail}
                    onChange={(e) => setNewUserEmail(e.target.value)}
                    className="bg-slate-900 border border-slate-700 text-white text-xs py-2 px-3 rounded-xl outline-none focus:border-indigo-500 font-mono"
                  />
                  <select
                    value={newUserRole}
                    onChange={(e) => setNewUserRole(e.target.value as UserRole)}
                    className="bg-slate-900 border border-slate-700 text-white text-xs py-2 px-3 rounded-xl outline-none focus:border-indigo-500 font-bold"
                  >
                    <option value="admin">Administrador / Gerente</option>
                    <option value="gerente_loja">Gerente de Loja</option>
                    <option value="operador_deposito">Operador de Depósito</option>
                    <option value="caixa">Operador de Caixa</option>
                    <option value="auditor">Auditor</option>
                    <option value="super_admin">Super Admin (Proprietário)</option>
                  </select>
                  <select
                    value={newUserTenantId}
                    onChange={(e) => setNewUserTenantId(e.target.value)}
                    className="bg-slate-900 border border-slate-700 text-white text-xs py-2 px-3 rounded-xl outline-none focus:border-indigo-500 font-bold"
                  >
                    <option value="all">Todas as Empresas (Global Master)</option>
                    {tenants.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} ({t.code})
                      </option>
                    ))}
                  </select>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      maxLength={4}
                      placeholder="PIN 1234"
                      value={newUserPin}
                      onChange={(e) => setNewUserPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                      className="w-20 bg-slate-900 border border-slate-700 text-purple-300 text-xs py-2 px-2 rounded-xl outline-none focus:border-indigo-500 font-mono text-center font-bold"
                    />
                    <button
                      type="submit"
                      className="flex-1 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-xs py-2 px-3 rounded-xl transition-all cursor-pointer shadow-md"
                    >
                      Cadastrar
                    </button>
                  </div>
                </div>
              </form>
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 font-bold uppercase text-[10px] tracking-wider">
                    <th className="pb-3 pl-2">Usuário</th>
                    <th className="pb-3">E-mail</th>
                    <th className="pb-3">Nível</th>
                    <th className="pb-3">Empresa Associada</th>
                    <th className="pb-3">PIN Acesso</th>
                    <th className="pb-3 pr-2 text-right">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {filteredUsers.map((u, idx) => {
                    const userTenantNames = u.tenantIds?.includes('all')
                      ? 'Todas as Unidades (Master)'
                      : tenants
                          .filter((t) => u.tenantIds?.includes(t.id))
                          .map((t) => t.name)
                          .join(', ') || 'Nenhuma';

                    return (
                      <tr key={`${u.id}-${idx}`} className="hover:bg-slate-950/60 transition-colors">
                        <td className="py-3 pl-2 font-bold text-white flex items-center gap-2">
                          <span className="text-base">{u.avatarUrl?.replace('emoji:', '') || '👤'}</span>
                          <span>{u.name}</span>
                        </td>
                        <td className="py-3 text-slate-300 font-mono">{u.email}</td>
                        <td className="py-3">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                              u.role === 'super_admin'
                                ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                                : u.role === 'admin'
                                ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                                : 'bg-slate-800 text-slate-300'
                            }`}
                          >
                            {u.role}
                          </span>
                        </td>
                        <td className="py-3 text-slate-400">{userTenantNames}</td>
                        <td className="py-3 font-mono text-purple-400 font-bold">{u.pin}</td>
                        <td className="py-3 pr-2 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => openEditUser(u)}
                              className="px-2.5 py-1 text-xs font-bold text-indigo-300 bg-indigo-950/80 hover:bg-indigo-900 border border-indigo-800/60 rounded-lg flex items-center gap-1 transition-colors cursor-pointer"
                              title="Editar Cadastro do Usuário"
                            >
                              <Pencil className="w-3.5 h-3.5 text-indigo-400" />
                              <span>Editar</span>
                            </button>

                            {u.role !== 'super_admin' && (
                              <>
                                <button
                                  onClick={() => updateUser({ ...u, active: !u.active })}
                                  className={`text-[11px] font-bold px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
                                    u.active
                                      ? 'text-rose-400 hover:bg-rose-950/50 border border-rose-900/40'
                                      : 'text-emerald-400 hover:bg-emerald-950/50 border border-emerald-900/40'
                                  }`}
                                >
                                  {u.active ? 'Bloquear' : 'Ativar'}
                                </button>

                                <button
                                  onClick={() => handleDeleteUserSaaS(u.id)}
                                  className="p-1.5 text-rose-400 bg-rose-950/60 hover:bg-rose-900/80 border border-rose-900/50 rounded-lg transition-colors cursor-pointer"
                                  title="Excluir Usuário de Teste / Definitivo"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

          </div>
        )}

        {/* Tab 4: Database & Infrastructure */}
        {activeTab === 'database' && (
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-6 shadow-xl">
            
            <div className="border-b border-slate-800 pb-4">
              <h2 className="text-lg font-black text-white flex items-center gap-2">
                <Database className="w-5 h-5 text-emerald-400" />
                Infraestrutura & Banco de Dados do SaaS
              </h2>
              <p className="text-xs text-slate-400">
                Monitoramento de dados globais, exportação de segurança e sincronização
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-slate-950 border border-slate-800 p-4 rounded-2xl">
                <p className="text-[11px] text-slate-400 font-bold uppercase">Empresas Cadastradas</p>
                <p className="text-2xl font-black text-purple-400 mt-1">{tenants.length}</p>
              </div>

              <div className="bg-slate-950 border border-slate-800 p-4 rounded-2xl">
                <p className="text-[11px] text-slate-400 font-bold uppercase">Usuários Ativos</p>
                <p className="text-2xl font-black text-white mt-1">{users.length}</p>
              </div>

              <div className="bg-slate-950 border border-slate-800 p-4 rounded-2xl">
                <p className="text-[11px] text-slate-400 font-bold uppercase">Produtos em Estoque</p>
                <p className="text-2xl font-black text-emerald-400 mt-1">{products.length}</p>
              </div>

              <div className="bg-slate-950 border border-slate-800 p-4 rounded-2xl">
                <p className="text-[11px] text-slate-400 font-bold uppercase">Registros de Histórico</p>
                <p className="text-2xl font-black text-amber-400 mt-1">{movements.length}</p>
              </div>
            </div>

            <div className="bg-slate-950 border border-slate-800 p-5 rounded-2xl space-y-4">
              <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                Ferramentas do Banco de Dados SaaS:
              </h3>

              <div className="flex flex-wrap gap-3">
                <button
                  onClick={handleExportDatabase}
                  className="py-3 px-5 bg-purple-950/80 hover:bg-purple-900 text-purple-200 text-xs font-bold rounded-xl flex items-center gap-2 border border-purple-800/60 cursor-pointer transition-colors shadow-md"
                >
                  <Download className="w-4 h-4 text-purple-400" />
                  <span>Exportar Backup Completo do Banco de Dados (JSON)</span>
                </button>

                <button
                  onClick={() => triggerCloudSync()}
                  className="py-3 px-5 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold rounded-xl flex items-center gap-2 border border-slate-700 cursor-pointer transition-colors"
                >
                  <RefreshCw className="w-4 h-4 text-emerald-400" />
                  <span>Forçar Sincronização em Nuvem</span>
                </button>
              </div>
            </div>

          </div>
        )}

      </main>

      {/* Edit Tenant Modal Overlay */}
      {editingTenant && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-lg w-full shadow-2xl space-y-5 animate-in fade-in zoom-in duration-200">
            
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="p-2.5 bg-purple-950/80 border border-purple-800/60 text-purple-300 rounded-2xl shadow-inner">
                  <Pencil className="w-5 h-5 text-purple-400" />
                </div>
                <div>
                  <h3 className="text-base font-black text-white">Editar Cadastro da Empresa</h3>
                  <p className="text-xs text-slate-400">Modifique os dados cadastrais da empresa no SaaS</p>
                </div>
              </div>

              <button
                onClick={() => setEditingTenant(null)}
                className="p-1.5 text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-xl transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveTenantEdit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">
                  Nome da Empresa / Razão Social*:
                </label>
                <input
                  type="text"
                  required
                  value={editTenantName}
                  onChange={(e) => setEditTenantName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 text-white text-xs py-2.5 px-3 rounded-xl outline-none focus:border-purple-500 font-medium"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">
                    Código de Login Curto*:
                  </label>
                  <input
                    type="text"
                    required
                    value={editTenantCode}
                    onChange={(e) => setEditTenantCode(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 text-white text-xs py-2.5 px-3 rounded-xl outline-none focus:border-purple-500 font-mono font-bold uppercase"
                  />
                  <p className="text-[10px] text-slate-500 mt-1">Utilizado para acesso no login</p>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">
                    CNPJ:
                  </label>
                  <input
                    type="text"
                    value={editTenantCNPJ}
                    onChange={(e) => setEditTenantCNPJ(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 text-white text-xs py-2.5 px-3 rounded-xl outline-none focus:border-purple-500 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2">
                  <label className="block text-xs font-bold text-slate-300 mb-1">Cidade:</label>
                  <input
                    type="text"
                    value={editTenantCity}
                    onChange={(e) => setEditTenantCity(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 text-white text-xs py-2.5 px-3 rounded-xl outline-none focus:border-purple-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">UF:</label>
                  <input
                    type="text"
                    maxLength={2}
                    value={editTenantState}
                    onChange={(e) => setEditTenantState(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 text-white text-xs py-2.5 px-3 rounded-xl outline-none focus:border-purple-500 uppercase font-bold text-center"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">Status do Acesso:</label>
                <div className="flex items-center gap-4 bg-slate-950 p-3 rounded-xl border border-slate-800">
                  <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-200">
                    <input
                      type="radio"
                      name="tenantStatus"
                      checked={editTenantActive}
                      onChange={() => setEditTenantActive(true)}
                      className="accent-emerald-500"
                    />
                    <span className="text-emerald-400">Ativa / Liberada</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-200">
                    <input
                      type="radio"
                      name="tenantStatus"
                      checked={!editTenantActive}
                      onChange={() => setEditTenantActive(false)}
                      className="accent-rose-500"
                    />
                    <span className="text-rose-400">Bloqueada</span>
                  </label>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditingTenant(null)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded-xl transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xs font-bold rounded-xl shadow-lg transition-all cursor-pointer flex items-center gap-1.5"
                >
                  <Check className="w-4 h-4" />
                  <span>Salvar Alterações</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit User Modal Overlay */}
      {editingUser && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-lg w-full shadow-2xl space-y-5 animate-in fade-in zoom-in duration-200">
            
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="p-2.5 bg-indigo-950/80 border border-indigo-800/60 text-indigo-300 rounded-2xl shadow-inner">
                  <Pencil className="w-5 h-5 text-indigo-400" />
                </div>
                <div>
                  <h3 className="text-base font-black text-white">Editar Usuário do Sistema</h3>
                  <p className="text-xs text-slate-400">Controle completo de perfil, acessos e permissões</p>
                </div>
              </div>

              <button
                onClick={() => setEditingUser(null)}
                className="p-1.5 text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-xl transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveUserEdit} className="space-y-4">
              
              {/* Avatar / Emoji Picker */}
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5">Ícone do Perfil / Avatar:</label>
                <div className="flex items-center gap-2">
                  {['emoji:👤', 'emoji:👑', 'emoji:👨‍💼', 'emoji:👩‍💼', 'emoji:⚡', 'emoji:🛡️', 'emoji:📦', 'emoji:🏬'].map((emoji) => {
                    const isSelected = editUserAvatarUrl === emoji;
                    return (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => setEditUserAvatarUrl(emoji)}
                        className={`p-2 text-lg rounded-xl border transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-indigo-950 border-indigo-500 scale-110 shadow-md shadow-indigo-950'
                            : 'bg-slate-950 border-slate-800 hover:border-slate-700 opacity-70 hover:opacity-100'
                        }`}
                      >
                        {emoji.replace('emoji:', '')}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Name & Email */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">
                    Nome Completo*:
                  </label>
                  <input
                    type="text"
                    required
                    value={editUserName}
                    onChange={(e) => setEditUserName(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 text-white text-xs py-2.5 px-3 rounded-xl outline-none focus:border-indigo-500 font-medium"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">
                    E-mail*:
                  </label>
                  <input
                    type="email"
                    required
                    value={editUserEmail}
                    onChange={(e) => setEditUserEmail(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 text-white text-xs py-2.5 px-3 rounded-xl outline-none focus:border-indigo-500 font-mono text-xs"
                  />
                </div>
              </div>

              {/* Role & PIN */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">Nível de Acesso (Função)*:</label>
                  <select
                    value={editUserRole}
                    onChange={(e) => setEditUserRole(e.target.value as UserRole)}
                    className="w-full bg-slate-950 border border-slate-700 text-white text-xs py-2.5 px-3 rounded-xl outline-none focus:border-indigo-500 font-bold"
                  >
                    <option value="super_admin">Super Admin (Proprietário SaaS)</option>
                    <option value="admin">Administrador (Gestor Matriz)</option>
                    <option value="gerente_loja">Gerente de Loja</option>
                    <option value="operador_deposito">Operador de Depósito</option>
                    <option value="caixa">Operador de Caixa</option>
                    <option value="auditor">Auditor / Leitura</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">PIN de Acesso (4 Dígitos)*:</label>
                  <input
                    type="text"
                    required
                    maxLength={4}
                    value={editUserPin}
                    onChange={(e) => setEditUserPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    className="w-full bg-slate-950 border border-slate-700 text-purple-400 text-xs py-2.5 px-3 rounded-xl outline-none focus:border-indigo-500 font-mono text-center font-black tracking-widest"
                  />
                </div>
              </div>

              {/* Tenant Assignment */}
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">Empresa / Unidades Permitidas:</label>
                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-2 max-h-36 overflow-y-auto">
                  <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-purple-300">
                    <input
                      type="checkbox"
                      checked={editUserTenantIds.includes('all')}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setEditUserTenantIds(['all']);
                        } else {
                          setEditUserTenantIds([tenants[0]?.id || 'tenant-friburgo']);
                        }
                      }}
                      className="accent-purple-500"
                    />
                    <span>Todas as Unidades / Acesso Global (Master SaaS)</span>
                  </label>

                  {!editUserTenantIds.includes('all') && (
                    <div className="pl-4 pt-1 space-y-1.5 border-t border-slate-900">
                      {tenants.map((t) => {
                        const isChecked = editUserTenantIds.includes(t.id);
                        return (
                          <label key={t.id} className="flex items-center gap-2 cursor-pointer text-xs text-slate-300">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setEditUserTenantIds([...editUserTenantIds, t.id]);
                                } else {
                                  const filtered = editUserTenantIds.filter((id) => id !== t.id);
                                  setEditUserTenantIds(filtered.length > 0 ? filtered : [t.id]);
                                }
                              }}
                              className="accent-indigo-500"
                            />
                            <span>{t.name} ({t.code})</span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* Account Status */}
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">Status da Conta:</label>
                <div className="flex items-center gap-4 bg-slate-950 p-3 rounded-xl border border-slate-800">
                  <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-200">
                    <input
                      type="radio"
                      name="userStatus"
                      checked={editUserActive}
                      onChange={() => setEditUserActive(true)}
                      className="accent-emerald-500"
                    />
                    <span className="text-emerald-400">Ativo / Liberado</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-200">
                    <input
                      type="radio"
                      name="userStatus"
                      checked={!editUserActive}
                      onChange={() => setEditUserActive(false)}
                      className="accent-rose-500"
                    />
                    <span className="text-rose-400">Bloqueado</span>
                  </label>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-800 flex items-center justify-between gap-2">
                {editingUser.role !== 'super_admin' ? (
                  <button
                    type="button"
                    onClick={() => handleDeleteUserSaaS(editingUser.id)}
                    className="px-3 py-2 bg-rose-950/80 hover:bg-rose-900 border border-rose-800/60 text-rose-300 text-xs font-bold rounded-xl transition-colors cursor-pointer flex items-center gap-1.5"
                  >
                    <Trash2 className="w-4 h-4 text-rose-400" />
                    <span>Excluir Usuário</span>
                  </button>
                ) : (
                  <div></div>
                )}

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setEditingUser(null)}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded-xl transition-colors cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xs font-bold rounded-xl shadow-lg transition-all cursor-pointer flex items-center gap-1.5"
                  >
                    <Check className="w-4 h-4" />
                    <span>Salvar Alterações</span>
                  </button>
                </div>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* Delete Tenant Modal with PIN Verification */}
      <DeleteTenantModal
        isOpen={!!tenantToDelete}
        tenant={tenantToDelete}
        currentUser={currentUser}
        onClose={() => setTenantToDelete(null)}
        onConfirmDelete={(tenantId) => deleteTenant(tenantId)}
      />

    </div>
  );
};
