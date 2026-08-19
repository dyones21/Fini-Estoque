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
  Trash2,
  Search,
  Pencil,
  UserPlus,
} from 'lucide-react';
import { useStock } from '../context/StockContext';
import { Tenant, UserProfile, UserRole } from '../types';
import { getRolePermissions } from '../utils/permissionUtils';
import { DeleteTenantModal } from './DeleteTenantModal';

interface SaaSManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SaaSManagementModal: React.FC<SaaSManagementModalProps> = ({
  isOpen,
  onClose,
}) => {
  const {
    tenants,
    addTenant,
    updateTenant,
    deleteTenant,
    users,
    allUsers,
    addUser,
    updateUser,
    deleteUser,
    products,
    movements,
    cloudInfo,
    triggerCloudSync,
    currentUser,
  } = useStock();

  const [activeTab, setActiveTab] = useState<'tenants' | 'users' | 'database' | 'new_company'>('tenants');
  const [tenantToDelete, setTenantToDelete] = useState<Tenant | null>(null);

  // SaaS User Management State
  const [userSearchTerm, setUserSearchTerm] = useState('');
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [isAddingUserSaaS, setIsAddingUserSaaS] = useState(false);
  const [saasUserName, setSaasUserName] = useState('');
  const [saasUserEmail, setSaasUserEmail] = useState('');
  const [saasUserPin, setSaasUserPin] = useState('1234');
  const [saasUserRole, setSaasUserRole] = useState<UserRole>('admin');
  const [saasUserTenantId, setSaasUserTenantId] = useState<string>('all');

  // New Company Form State
  const [newCompanyCode, setNewCompanyCode] = useState('');
  const [newCompanyName, setNewCompanyName] = useState('');
  const [newCompanyCNPJ, setNewCompanyCNPJ] = useState('');
  const [newCompanyCity, setNewCompanyCity] = useState('');
  const [newCompanyState, setNewCompanyState] = useState('');
  const [adminName, setAdminName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPin, setAdminPin] = useState('1234');
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  if (!isOpen) return null;

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
        pin: adminPin || '1234',
        active: true,
        tenantIds: [createdTenant.id],
        avatarUrl: 'emoji:🏢',
        permissions: getRolePermissions('admin'),
      };
      addUser(newAdmin);
    }

    setSuccessMsg(
      `Empresa "${newCompanyName}" criada com sucesso! Código de acesso: ${createdTenant.code}`
    );

    // Reset Form
    setNewCompanyCode('');
    setNewCompanyName('');
    setNewCompanyCNPJ('');
    setNewCompanyCity('');
    setNewCompanyState('');
    setAdminName('');
    setAdminEmail('');
    setAdminPin('1234');

    setTimeout(() => {
      setSuccessMsg(null);
      setActiveTab('tenants');
    }, 2000);
  };

  const handleExportDatabase = () => {
    const fullBackup = {
      timestamp: new Date().toISOString(),
      tenants,
      users: allUsers,
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
    link.download = `FINI_ERP_FULL_DATABASE_${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
  };

  const handleCreateSaasUser = (e: React.FormEvent) => {
    e.preventDefault();
    if (!saasUserName || !saasUserEmail) return;

    const newUser: UserProfile = {
      id: `user-${Date.now()}`,
      name: saasUserName.trim(),
      email: saasUserEmail.trim(),
      role: saasUserRole,
      pin: saasUserPin || '1234',
      active: true,
      tenantIds: [saasUserTenantId],
      avatarUrl: 'emoji:👤',
      permissions: getRolePermissions(saasUserRole),
    };

    addUser(newUser);
    setIsAddingUserSaaS(false);
    setSaasUserName('');
    setSaasUserEmail('');
    setSaasUserPin('1234');
  };

  const handleDeleteSaasUser = (userId: string, userName: string) => {
    if (confirm(`Tem certeza que deseja excluir permanentemente o usuário "${userName}" no Firestore?`)) {
      deleteUser(userId);
      if (editingUser?.id === userId) {
        setEditingUser(null);
      }
    }
  };

  const filteredUsers = allUsers.filter(
    (u) =>
      u.name.toLowerCase().includes(userSearchTerm.toLowerCase()) ||
      u.email.toLowerCase().includes(userSearchTerm.toLowerCase()) ||
      u.role.toLowerCase().includes(userSearchTerm.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 overflow-y-auto animate-fadeIn">
      <div className="w-full max-w-4xl bg-slate-900 border border-slate-800 text-white rounded-3xl shadow-2xl overflow-hidden my-auto">
        
        {/* Header Bar */}
        <div className="bg-gradient-to-r from-rose-950 via-slate-900 to-amber-950 p-5 sm:p-6 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-rose-600 text-white rounded-2xl flex items-center justify-center font-black text-2xl shadow-lg">
              👑
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl sm:text-2xl font-black text-white">Painel SaaS Master</h2>
                <span className="bg-rose-500/20 text-rose-300 border border-rose-500/30 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase">
                  Gestão Geral
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Controle do Banco de Dados & Cadastro de Novas Empresas Clientes
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="bg-slate-950/80 p-2 border-b border-slate-800 flex gap-2 overflow-x-auto">
          <button
            onClick={() => setActiveTab('tenants')}
            className={`py-2 px-4 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'tenants'
                ? 'bg-rose-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white hover:bg-slate-900'
            }`}
          >
            <Building2 className="w-4 h-4" />
            <span>Empresas Cadastradas ({tenants.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('users')}
            className={`py-2 px-4 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'users'
                ? 'bg-rose-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white hover:bg-slate-900'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Usuários SaaS ({allUsers.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('new_company')}
            className={`py-2 px-4 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'new_company'
                ? 'bg-rose-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white hover:bg-slate-900'
            }`}
          >
            <Plus className="w-4 h-4" />
            <span>+ Nova Empresa (Vender Acesso)</span>
          </button>

          <button
            onClick={() => setActiveTab('database')}
            className={`py-2 px-4 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'database'
                ? 'bg-rose-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white hover:bg-slate-900'
            }`}
          >
            <Database className="w-4 h-4" />
            <span>Controle do Banco de Dados</span>
          </button>
        </div>

        {/* Body Content */}
        <div className="p-6">
          
          {/* TAB 1: Companies List */}
          {activeTab === 'tenants' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-300">Todas as Empresas / Filiais no Sistema:</h3>
                <button
                  onClick={() => setActiveTab('new_company')}
                  className="px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Cadastrar Empresa</span>
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-96 overflow-y-auto pr-1">
                {tenants.map((t) => {
                  const companyUsers = users.filter(
                    (u) => u.tenantIds?.includes(t.id) || u.tenantIds?.includes('all')
                  );
                  const companyProducts = products.filter((p) => p.tenantId === t.id);

                  return (
                    <div
                      key={t.id}
                      className="bg-slate-950 border border-slate-800 p-4 rounded-2xl flex flex-col justify-between space-y-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="text-sm font-black text-white">{t.name}</h4>
                            {t.isMaster && (
                              <span className="bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[9px] font-black px-1.5 py-0.2 rounded">
                                MATRIZ
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-rose-400 font-mono font-bold mt-0.5">
                            Código de Login: {t.code}
                          </p>
                          <p className="text-[11px] text-slate-400 mt-1">
                            CNPJ: {t.cnpj} • {t.city}/{t.state}
                          </p>
                        </div>

                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            t.active
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                              : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                          }`}
                        >
                          {t.active ? 'Ativa' : 'Inativa'}
                        </span>
                      </div>

                      <div className="flex items-center justify-between pt-2 border-t border-slate-800/80 text-[11px] text-slate-400 font-medium">
                        <span>👥 {companyUsers.length} Usuários</span>
                        <span>📦 {companyProducts.length} Produtos</span>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => {
                              updateTenant({ ...t, active: !t.active });
                            }}
                            className="text-slate-300 hover:text-white font-bold bg-slate-900 px-2.5 py-1 rounded-lg border border-slate-800 transition-colors cursor-pointer"
                          >
                            {t.active ? 'Desativar' : 'Ativar'}
                          </button>
                          {!t.isMaster && (
                            <button
                              onClick={() => setTenantToDelete(t)}
                              className="p-1.5 bg-rose-950/60 hover:bg-rose-900 text-rose-400 hover:text-white border border-rose-900/50 rounded-lg transition-colors cursor-pointer"
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

          {/* TAB 2: Users Management SaaS */}
          {activeTab === 'users' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-slate-950 p-4 rounded-2xl border border-slate-800">
                <div className="relative flex-1 w-full">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={userSearchTerm}
                    onChange={(e) => setUserSearchTerm(e.target.value)}
                    placeholder="Buscar usuários por nome, e-mail ou cargo..."
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-4 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-rose-500"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-1 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px] font-bold rounded-full flex items-center gap-1">
                    <Sparkles className="w-3 h-3" />
                    <span>Firestore Real-Time</span>
                  </span>
                  <button
                    onClick={() => setIsAddingUserSaaS(!isAddingUserSaaS)}
                    className="px-3 py-2 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <UserPlus className="w-4 h-4" />
                    <span>Novo Usuário Global</span>
                  </button>
                </div>
              </div>

              {/* Form to Add User in SaaS */}
              {isAddingUserSaaS && (
                <form onSubmit={handleCreateSaasUser} className="bg-slate-950 p-4 rounded-2xl border border-rose-900/50 space-y-3 animate-fadeIn">
                  <h4 className="text-xs font-bold text-rose-400 uppercase tracking-wider">Cadastrar Novo Usuário no SaaS</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <input
                      type="text"
                      placeholder="Nome do Usuário"
                      value={saasUserName}
                      onChange={(e) => setSaasUserName(e.target.value)}
                      required
                      className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-rose-500"
                    />
                    <input
                      type="email"
                      placeholder="E-mail de acesso"
                      value={saasUserEmail}
                      onChange={(e) => setSaasUserEmail(e.target.value)}
                      required
                      className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-rose-500"
                    />
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="PIN (4 dígitos)"
                        maxLength={4}
                        value={saasUserPin}
                        onChange={(e) => setSaasUserPin(e.target.value.replace(/\D/g, ''))}
                        required
                        className="w-28 bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-center font-mono text-amber-400 font-bold focus:outline-none focus:border-rose-500"
                      />
                      <select
                        value={saasUserRole}
                        onChange={(e) => setSaasUserRole(e.target.value as UserRole)}
                        className="flex-1 bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-rose-500"
                      >
                        <option value="admin">Administrador (Total)</option>
                        <option value="gerente_loja">Gerente de Loja</option>
                        <option value="operador_deposito">Operador Depósito</option>
                        <option value="caixa">Caixa / Vendas</option>
                        <option value="auditor">Auditor</option>
                        <option value="super_admin">Super Admin Master</option>
                      </select>
                    </div>
                    <select
                      value={saasUserTenantId}
                      onChange={(e) => setSaasUserTenantId(e.target.value)}
                      className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-rose-500"
                    >
                      <option value="all">Acesso a Todas as Empresas (Global)</option>
                      {tenants.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name} ({t.code})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setIsAddingUserSaaS(false)}
                      className="px-3 py-1.5 bg-slate-800 text-slate-300 text-xs font-bold rounded-xl hover:bg-slate-700 cursor-pointer"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-1.5 bg-rose-600 text-white text-xs font-bold rounded-xl hover:bg-rose-500 shadow-md cursor-pointer"
                    >
                      Salvar Usuário
                    </button>
                  </div>
                </form>
              )}

              {/* Users List */}
              <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                {filteredUsers.map((u) => (
                  <div
                    key={u.id}
                    className="p-3 bg-slate-950 border border-slate-800/80 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 hover:border-slate-700 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-slate-900 border border-slate-800 rounded-xl flex items-center justify-center text-lg">
                        {u.avatarUrl?.startsWith('emoji:') ? u.avatarUrl.replace('emoji:', '') : '👤'}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-black text-white">{u.name}</span>
                          <span className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 text-[10px] font-bold uppercase border border-slate-700">
                            {u.role}
                          </span>
                          {u.active !== false ? (
                            <span className="text-[10px] font-bold text-emerald-400 bg-emerald-950/60 border border-emerald-800 px-2 py-0.5 rounded-full">
                              Ativo
                            </span>
                          ) : (
                            <span className="text-[10px] font-bold text-rose-400 bg-rose-950/60 border border-rose-800 px-2 py-0.5 rounded-full">
                              Inativo
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-400 mt-0.5">{u.email} • PIN: <span className="font-mono text-amber-400 font-bold">{u.pin}</span></p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-end sm:self-center">
                      <button
                        onClick={() => {
                          const updated = { ...u, active: u.active === false };
                          updateUser(updated);
                        }}
                        className="px-2.5 py-1 text-[11px] font-bold bg-slate-900 text-slate-300 hover:text-white border border-slate-800 rounded-lg transition-colors cursor-pointer"
                      >
                        {u.active !== false ? 'Desativar' : 'Ativar'}
                      </button>
                      <button
                        onClick={() => handleDeleteSaasUser(u.id, u.name)}
                        className="p-1.5 bg-rose-950/50 text-rose-400 hover:bg-rose-900 hover:text-white border border-rose-900/50 rounded-lg transition-colors cursor-pointer"
                        title="Excluir Usuário no Firestore em Tempo Real"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}

                {filteredUsers.length === 0 && (
                  <div className="text-center py-8 text-slate-500 text-xs font-bold">
                    Nenhum usuário encontrado.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: Create New Company Form */}
          {activeTab === 'new_company' && (
            <form onSubmit={handleCreateCompany} className="space-y-4 max-w-xl mx-auto">
              <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-3">
                <h3 className="text-xs font-bold text-rose-400 uppercase tracking-wider">
                  1. Dados da Nova Empresa / Unidade
                </h3>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-400 mb-1">
                      Código de Acesso Curto*:
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Ex: EMPRESA01, LOJA-SP"
                      value={newCompanyCode}
                      onChange={(e) => setNewCompanyCode(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 text-white text-xs py-2 px-3 rounded-xl outline-none focus:border-rose-500 uppercase font-mono font-bold"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-400 mb-1">
                      Nome da Empresa*:
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Razão Social / Nome Fantasia"
                      value={newCompanyName}
                      onChange={(e) => setNewCompanyName(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 text-white text-xs py-2 px-3 rounded-xl outline-none focus:border-rose-500 font-medium"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-400 mb-1">CNPJ:</label>
                    <input
                      type="text"
                      placeholder="00.000.000/0001-00"
                      value={newCompanyCNPJ}
                      onChange={(e) => setNewCompanyCNPJ(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 text-white text-xs py-2 px-3 rounded-xl outline-none focus:border-rose-500 font-mono"
                    />
                  </div>

                  <div className="grid grid-cols-3 gap-1">
                    <div className="col-span-2">
                      <label className="block text-[11px] font-bold text-slate-400 mb-1">Cidade:</label>
                      <input
                        type="text"
                        placeholder="Cidade"
                        value={newCompanyCity}
                        onChange={(e) => setNewCompanyCity(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 text-white text-xs py-2 px-3 rounded-xl outline-none focus:border-rose-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-400 mb-1">UF:</label>
                      <input
                        type="text"
                        maxLength={2}
                        placeholder="RJ"
                        value={newCompanyState}
                        onChange={(e) => setNewCompanyState(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 text-white text-xs py-2 px-3 rounded-xl outline-none focus:border-rose-500 uppercase font-bold text-center"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-3">
                <h3 className="text-xs font-bold text-rose-400 uppercase tracking-wider">
                  2. Administrador Inicial da Empresa
                </h3>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-400 mb-1">Nome do Admin:</label>
                    <input
                      type="text"
                      placeholder="Nome do Gerente"
                      value={adminName}
                      onChange={(e) => setAdminName(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 text-white text-xs py-2 px-3 rounded-xl outline-none focus:border-rose-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-400 mb-1">E-mail de Login:</label>
                    <input
                      type="email"
                      placeholder="admin@empresa.com"
                      value={adminEmail}
                      onChange={(e) => setAdminEmail(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 text-white text-xs py-2 px-3 rounded-xl outline-none focus:border-rose-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-400 mb-1">PIN Inicial (4 dígitos):</label>
                    <input
                      type="text"
                      maxLength={4}
                      placeholder="1234"
                      value={adminPin}
                      onChange={(e) => setAdminPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                      className="w-full bg-slate-900 border border-slate-700 text-white text-xs py-2 px-3 rounded-xl outline-none focus:border-rose-500 font-mono text-center font-bold"
                    />
                  </div>
                </div>
              </div>

              {successMsg && (
                <div className="p-3 bg-emerald-950/80 border border-emerald-800 text-emerald-300 text-xs font-bold rounded-xl flex items-center justify-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>{successMsg}</span>
                </div>
              )}

              <button
                type="submit"
                className="w-full py-3 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-2xl shadow-lg transition-all text-xs sm:text-sm flex items-center justify-center gap-2 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Salvar & Cadastrar Nova Empresa</span>
              </button>
            </form>
          )}

          {/* TAB 3: Global Database Metrics & Control */}
          {activeTab === 'database' && (
            <div className="space-y-5">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-slate-950 border border-slate-800 p-4 rounded-2xl">
                  <p className="text-[11px] text-slate-400 font-bold uppercase">Empresas Total</p>
                  <p className="text-2xl font-black text-rose-400 mt-1">{tenants.length}</p>
                </div>

                <div className="bg-slate-950 border border-slate-800 p-4 rounded-2xl">
                  <p className="text-[11px] text-slate-400 font-bold uppercase">Usuários Ativos</p>
                  <p className="text-2xl font-black text-white mt-1">{users.length}</p>
                </div>

                <div className="bg-slate-950 border border-slate-800 p-4 rounded-2xl">
                  <p className="text-[11px] text-slate-400 font-bold uppercase">Produtos Cadastrados</p>
                  <p className="text-2xl font-black text-emerald-400 mt-1">{products.length}</p>
                </div>

                <div className="bg-slate-950 border border-slate-800 p-4 rounded-2xl">
                  <p className="text-[11px] text-slate-400 font-bold uppercase">Movimentações Log</p>
                  <p className="text-2xl font-black text-amber-400 mt-1">{movements.length}</p>
                </div>
              </div>

              <div className="bg-slate-950 border border-slate-800 p-5 rounded-2xl space-y-4">
                <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                  Ações do Banco de Dados SaaS:
                </h3>

                <div className="flex flex-wrap gap-3">
                  <button
                    onClick={handleExportDatabase}
                    className="py-2.5 px-4 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold rounded-xl flex items-center gap-2 border border-slate-700 cursor-pointer transition-colors"
                  >
                    <Download className="w-4 h-4 text-rose-400" />
                    <span>Exportar Backup do Banco de Dados (JSON)</span>
                  </button>

                  <button
                    onClick={() => triggerCloudSync()}
                    className="py-2.5 px-4 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold rounded-xl flex items-center gap-2 border border-slate-700 cursor-pointer transition-colors"
                  >
                    <RefreshCw className="w-4 h-4 text-emerald-400" />
                    <span>Forçar Sincronização Geral</span>
                  </button>
                </div>
              </div>
            </div>
          )}

        </div>
      </div>

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
