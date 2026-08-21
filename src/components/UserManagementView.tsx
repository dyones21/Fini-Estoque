import React, { useState } from 'react';
import {
  ShieldCheck,
  UserPlus,
  KeyRound,
  Eye,
  EyeOff,
  UserCheck,
  Lock,
  Edit,
  Trash2,
  CheckCircle2,
  XCircle,
  Shield,
  Save,
  RotateCcw,
  Sparkles,
  Info,
  X,
  AlertCircle,
  Wand2,
  Camera,
} from 'lucide-react';
import { useStock } from '../context/StockContext';
import { UserProfile, UserRole, UserPermissions } from '../types';
import { UserAvatar } from './UserAvatar';
import { AvatarPickerModal } from './AvatarPickerModal';
import { updateUserRoleViaApi } from '../utils/apiAuth';

export const UserManagementView: React.FC = () => {
  const { users, currentUser, updateUser, addUser, deleteUser, checkPermission } = useStock();

  if (!checkPermission('canManageUsers')) {
    return (
      <div className="bg-white rounded-3xl p-8 border border-slate-200 shadow-sm text-center max-w-lg mx-auto my-12 space-y-4">
        <div className="w-14 h-14 bg-rose-100 text-rose-600 rounded-2xl flex items-center justify-center mx-auto">
          <ShieldCheck className="w-8 h-8" />
        </div>
        <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight">Acesso Restrito ao Gestor</h3>
        <p className="text-xs font-semibold text-slate-600 leading-relaxed">
          Apenas administradores e gerentes autorizados podem gerenciar usuários e alterar permissões do sistema.
        </p>
      </div>
    );
  }

  const [selectedUser, setSelectedUser] = useState<UserProfile>(users[0] || currentUser);
  const [showPin, setShowPin] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Form State for editing existing user
  const [formData, setFormData] = useState<UserProfile>(selectedUser);

  // Sync selectedUser and formData with latest users list from StockContext
  React.useEffect(() => {
    const currentFromUsers = users.find((u) => u.id === selectedUser.id);
    if (currentFromUsers) {
      setSelectedUser(currentFromUsers);
      if (!isEditing) {
        setFormData(currentFromUsers);
      }
    }
  }, [users, selectedUser.id, isEditing]);

  // Modal State for creating new user
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newUserName, setNewUserName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserRole, setNewUserRole] = useState<UserRole>('operador_deposito');
  const [newUserPin, setNewUserPin] = useState('');
  const [newUserAvatarUrl, setNewUserAvatarUrl] = useState('emoji:🍬');
  const [showModalPin, setShowModalPin] = useState(true);
  const [modalError, setModalError] = useState('');

  // Avatar Picker Modal state
  const [isAvatarPickerOpen, setIsAvatarPickerOpen] = useState(false);
  const [avatarPickerTarget, setAvatarPickerTarget] = useState<'edit' | 'new'>('edit');
  const [newUserPermissions, setNewUserPermissions] = useState<UserPermissions>({
    canViewDashboard: true,
    canViewStock: true,
    canManageProducts: false,
    canAddNFEntries: true,
    canTransferStock: true,
    canRegisterMovements: true,
    canManageUsers: false,
    canManageBackup: false,
  });

  const getRolePermissions = (role: UserRole): UserPermissions => {
    switch (role) {
      case 'admin':
        return {
          canViewDashboard: true,
          canViewStock: true,
          canManageProducts: true,
          canAddNFEntries: true,
          canTransferStock: true,
          canRegisterMovements: true,
          canManageUsers: true,
          canManageBackup: true,
        };
      case 'gerente_loja':
        return {
          canViewDashboard: true,
          canViewStock: true,
          canManageProducts: true,
          canAddNFEntries: false,
          canTransferStock: true,
          canRegisterMovements: true,
          canManageUsers: false,
          canManageBackup: true,
        };
      case 'operador_deposito':
        return {
          canViewDashboard: true,
          canViewStock: true,
          canManageProducts: false,
          canAddNFEntries: true,
          canTransferStock: true,
          canRegisterMovements: true,
          canManageUsers: false,
          canManageBackup: false,
        };
      case 'caixa':
        return {
          canViewDashboard: true,
          canViewStock: true,
          canManageProducts: false,
          canAddNFEntries: false,
          canTransferStock: false,
          canRegisterMovements: true,
          canManageUsers: false,
          canManageBackup: false,
        };
      default:
        return {
          canViewDashboard: true,
          canViewStock: true,
          canManageProducts: false,
          canAddNFEntries: false,
          canTransferStock: false,
          canRegisterMovements: false,
          canManageUsers: false,
          canManageBackup: false,
        };
    }
  };

  const handleSelectUser = (u: UserProfile) => {
    setSelectedUser(u);
    setFormData(u);
    setIsEditing(false);
    setShowPin(false);
  };

  const handleOpenCreateModal = () => {
    setNewUserName('');
    setNewUserEmail('');
    setNewUserRole('operador_deposito');
    setNewUserPin(Math.floor(1000 + Math.random() * 9000).toString()); // auto-generate convenient 4-digit PIN
    setNewUserAvatarUrl('emoji:🍬');
    setModalError('');
    setShowModalPin(true);
    setNewUserPermissions(getRolePermissions('operador_deposito'));
    setIsCreateModalOpen(true);
  };

  const showNotification = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const handleTogglePermission = (key: keyof UserPermissions) => {
    setFormData((prev) => ({
      ...prev,
      permissions: {
        ...prev.permissions,
        [key]: !prev.permissions[key],
      },
    }));
  };

  const handleToggleModalPermission = (key: keyof UserPermissions) => {
    setNewUserPermissions((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const handleRolePreset = (role: UserRole) => {
    setFormData((prev) => ({
      ...prev,
      role,
      permissions: getRolePermissions(role),
    }));
  };

  const handleModalRoleChange = (role: UserRole) => {
    setNewUserRole(role);
    setNewUserPermissions(getRolePermissions(role));
  };

  const handleSaveEdit = async () => {
    const trimmedName = formData.name.trim();
    if (!trimmedName) {
      alert('O nome do usuário não pode ficar em branco.');
      return;
    }
    if (!/^\d{4}$/.test(formData.pin)) {
      alert('O PIN de acesso deve ser composto por exatamente 4 dígitos numéricos (ex: 1234).');
      return;
    }

    try {
      // Se o cargo foi alterado, envia a atualização via PATCH /api/users/:uid/role para o Postgres
      if (formData.role !== selectedUser.role) {
        await updateUserRoleViaApi(selectedUser.id, formData.role);
      }

      const updatedUser: UserProfile = {
        ...formData,
        name: trimmedName,
        email: formData.email.trim(),
      };

      await updateUser(updatedUser);
      setSelectedUser(updatedUser);
      setFormData(updatedUser);
      showNotification(`Dados e cargo do usuário "${updatedUser.name}" salvos com sucesso no servidor!`);
      setIsEditing(false);
    } catch (error: any) {
      alert(`Falha ao alterar cargo no servidor: ${error.message || 'Apenas super_admin tem autorização para alterar cargos de usuários.'}`);
    }
  };

  const handleConfirmCreateUser = (e: React.FormEvent) => {
    e.preventDefault();
    setModalError('');

    if (!newUserName.trim()) {
      setModalError('Informe o nome completo do novo colaborador.');
      return;
    }

    if (!/^\d{4}$/.test(newUserPin)) {
      setModalError('O PIN deve conter exatamente 4 dígitos numéricos (ex: 1234).');
      return;
    }

    const createdUser: UserProfile = {
      id: 'u-' + Date.now(),
      name: newUserName.trim(),
      email: newUserEmail.trim() || `${newUserName.trim().toLowerCase().replace(/\s+/g, '.')}@fininovafriburgo.com.br`,
      role: newUserRole,
      pin: newUserPin,
      active: true,
      avatarUrl: newUserAvatarUrl || 'emoji:🍬',
      permissions: newUserPermissions,
    };

    addUser(createdUser);
    setSelectedUser(createdUser);
    setFormData(createdUser);
    setIsCreateModalOpen(false);
    showNotification(`Usuário "${createdUser.name}" cadastrado com sucesso! PIN de Acesso: ${createdUser.pin}`);
  };

  const handleDeleteUser = async (u: UserProfile) => {
    if (u.id === currentUser.id) {
      alert('Você não pode excluir a sua própria conta de usuário logada.');
      return;
    }
    if (window.confirm(`Tem certeza que deseja excluir o usuário "${u.name}" permanentemente do banco de dados?`)) {
      try {
        await deleteUser(u.id);
        showNotification(`Usuário "${u.name}" removido com sucesso.`);
        
        const remaining = users.filter((x) => x.id !== u.id);
        if (remaining.length > 0) {
          handleSelectUser(remaining[0]);
        } else {
          handleSelectUser(currentUser);
        }
      } catch (err: any) {
        console.error('Erro ao excluir usuário:', err);
        alert(err.message || 'Erro ao excluir usuário no banco de dados.');
      }
    }
  };

  const getRoleBadge = (role: UserRole) => {
    switch (role) {
      case 'super_admin':
        return <span className="px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 text-[10px] font-black uppercase border border-purple-200">Super Admin</span>;
      case 'admin':
        return <span className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 text-[10px] font-black uppercase border border-rose-200">Administrador</span>;
      case 'gerente_loja':
        return <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-bold uppercase border border-amber-200">Gerente de Loja</span>;
      case 'operador_deposito':
        return <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 text-[10px] font-bold uppercase border border-blue-200">Operador Depósito</span>;
      case 'caixa':
        return <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold uppercase border border-emerald-200">Caixa / Vendas</span>;
      default:
        return <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-800 text-[10px] font-bold uppercase border border-slate-200">Usuário</span>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-rose-950 to-slate-900 p-6 rounded-3xl text-white shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4 border border-slate-800">
        <div className="space-y-1 text-left">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-rose-400" />
            <h2 className="text-xl font-black">Gestão de Usuários, PINs e Permissões</h2>
          </div>
          <p className="text-xs text-rose-200 max-w-2xl">
            Configure o PIN numérico de 4 dígitos para troca rápida de operador e defina as permissões individuais ou por cargo de cada colaborador Fini Nova Friburgo.
          </p>
        </div>

        <button
          onClick={handleOpenCreateModal}
          className="bg-rose-600 hover:bg-rose-500 text-white font-bold px-4 py-2.5 rounded-xl text-xs shadow-md transition-all flex items-center justify-center gap-2 shrink-0 hover:scale-[1.02]"
        >
          <UserPlus className="w-4 h-4" />
          <span>+ Cadastrar Novo Usuário</span>
        </button>
      </div>

      {/* Toast Notification */}
      {toastMessage && (
        <div className="bg-emerald-500 text-white font-bold px-4 py-3 rounded-2xl text-xs shadow-lg flex items-center justify-between animate-fadeIn">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 shrink-0" />
            <span>{toastMessage}</span>
          </div>
        </div>
      )}

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Column: User List */}
        <div className="lg:col-span-4 bg-white rounded-3xl p-5 shadow-sm border border-slate-200 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider text-left">
              Usuários Cadastrados ({users.length})
            </h3>
            <span className="text-[10px] bg-slate-100 text-slate-600 font-bold px-2 py-0.5 rounded-md">
              PIN de 4 Dígitos
            </span>
          </div>

          <div className="space-y-2">
            {users.map((u, idx) => {
              const isSelected = selectedUser.id === u.id;
              return (
                <div
                  key={`${u.id}-${idx}`}
                  onClick={() => handleSelectUser(u)}
                  className={`p-3.5 rounded-2xl border text-left cursor-pointer transition-all flex items-center justify-between gap-3 ${
                    isSelected
                      ? 'bg-rose-50 border-rose-300 ring-2 ring-rose-500/20 shadow-xs'
                      : 'bg-slate-50/50 border-slate-200 hover:bg-slate-100/70'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <UserAvatar avatarUrl={u.avatarUrl} name={u.name} className="w-10 h-10 rounded-xl" />
                    <div className="min-w-0">
                      <p className="text-xs font-black text-slate-900 truncate">{u.name}</p>
                      <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                        {getRoleBadge(u.role)}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-1.5 shrink-0">
                    <span className="font-mono text-[11px] font-bold text-slate-700 bg-slate-200/80 px-2 py-0.5 rounded-md flex items-center gap-1">
                      <KeyRound className="w-3 h-3 text-rose-600" />
                      PIN: ****
                    </span>

                    {u.id !== currentUser.id && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteUser(u);
                        }}
                        title="Excluir Usuário"
                        className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-100 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Column: User Details & Permissions Editor */}
        <div className="lg:col-span-8 bg-white rounded-3xl p-4 sm:p-6 shadow-sm border border-slate-200 space-y-6 text-left">
          
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
            <div className="flex items-center gap-3 min-w-0">
              <div
                onClick={() => {
                  setAvatarPickerTarget('edit');
                  setIsAvatarPickerOpen(true);
                }}
                className="relative group cursor-pointer shrink-0"
                title="Clique para alterar foto ou emoji"
              >
                <UserAvatar avatarUrl={formData.avatarUrl} name={formData.name} className="w-12 h-12 rounded-2xl border-2 border-rose-500 shadow-xs" />
                <div className="absolute -bottom-1 -right-1 bg-rose-600 text-white p-1 rounded-lg shadow-xs group-hover:scale-110 transition-transform">
                  <Camera className="w-3 h-3" />
                </div>
              </div>
              <div className="min-w-0">
                <h3 className="text-base sm:text-lg font-black text-slate-900 truncate">
                  {formData.name}
                </h3>
                <p className="text-xs text-slate-500 truncate">{formData.email}</p>
                <button
                  type="button"
                  onClick={() => {
                    setAvatarPickerTarget('edit');
                    setIsAvatarPickerOpen(true);
                  }}
                  className="mt-1 text-[11px] font-bold text-rose-600 hover:text-rose-700 hover:underline flex items-center gap-1"
                >
                  <Camera className="w-3 h-3" />
                  <span>Alterar Foto / Emoji</span>
                </button>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {!isEditing ? (
                <>
                  <button
                    onClick={() => setIsEditing(true)}
                    className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs transition-all flex items-center gap-1.5 shadow-xs"
                  >
                    <Edit className="w-3.5 h-3.5 text-rose-400" />
                    <span>Editar Permissões & PIN</span>
                  </button>

                  {selectedUser.id !== currentUser.id && (
                    <button
                      onClick={() => handleDeleteUser(selectedUser)}
                      title="Excluir Usuário"
                      className="px-3.5 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold border border-rose-200 transition-all flex items-center gap-1.5 text-xs"
                    >
                      <Trash2 className="w-4 h-4 text-rose-600 shrink-0" />
                      <span>Excluir Usuário</span>
                    </button>
                  )}
                </>
              ) : (
                <button
                  onClick={() => {
                    setFormData(selectedUser);
                    setIsEditing(false);
                  }}
                  className="px-3.5 py-2 rounded-xl bg-slate-200 text-slate-700 font-bold text-xs hover:bg-slate-300 transition-colors"
                >
                  Cancelar Edição
                </button>
              )}
            </div>
          </div>

          {/* Basic User Data Form */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-200">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Nome Completo do Colaborador:</label>
              <input
                type="text"
                disabled={!isEditing}
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-semibold text-slate-900 focus:ring-2 focus:ring-rose-500 focus:outline-none disabled:bg-slate-100 disabled:text-slate-600"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">E-mail Corporativo:</label>
              <input
                type="email"
                disabled={!isEditing}
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-semibold text-slate-900 focus:ring-2 focus:ring-rose-500 focus:outline-none disabled:bg-slate-100 disabled:text-slate-600"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Cargo / Perfil de Função:</label>
              <select
                disabled={!isEditing}
                value={formData.role}
                onChange={(e) => handleRolePreset(e.target.value as UserRole)}
                className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 focus:ring-2 focus:ring-rose-500 focus:outline-none disabled:bg-slate-100"
              >
                <option value="super_admin">Super Administrador (Acesso Total)</option>
                <option value="admin">Administrador Geral</option>
                <option value="gerente_loja">Gerente de Loja</option>
                <option value="operador_deposito">Operador do Depósito Central</option>
                <option value="caixa">Operador de Caixa / Vendas</option>
                <option value="auditor">Auditor / Visualizador Apenas</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center justify-between">
                <span>PIN de Acesso (4 dígitos numéricos):</span>
                <button
                  type="button"
                  onClick={() => setShowPin(!showPin)}
                  className="text-rose-600 text-[11px] font-bold flex items-center gap-1 hover:underline"
                >
                  {showPin ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  {showPin ? 'Ocultar' : 'Mostrar PIN'}
                </button>
              </label>
              <div className="relative">
                <input
                  type={showPin ? 'text' : 'password'}
                  maxLength={4}
                  disabled={!isEditing}
                  value={formData.pin}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, '').slice(0, 4);
                    setFormData({ ...formData, pin: val });
                  }}
                  className="w-full bg-white border border-rose-300 font-mono text-sm font-black tracking-widest text-slate-900 rounded-xl px-3 py-2 focus:ring-2 focus:ring-rose-500 focus:outline-none disabled:bg-slate-100"
                  placeholder="1234"
                />
              </div>
            </div>
          </div>

          {/* Quick Preset Actions if editing */}
          {isEditing && (
            <div className="bg-rose-50/70 border border-rose-200 rounded-2xl p-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-xs text-rose-900 font-bold">
                <Sparkles className="w-4 h-4 text-rose-600 shrink-0" />
                <span>Aplicar Permissões Padrão por Cargo:</span>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  type="button"
                  onClick={() => handleRolePreset('admin')}
                  className="px-2.5 py-1 rounded-lg bg-rose-600 text-white text-[11px] font-bold hover:bg-rose-700 transition-colors"
                >
                  Total (Admin)
                </button>
                <button
                  type="button"
                  onClick={() => handleRolePreset('gerente_loja')}
                  className="px-2.5 py-1 rounded-lg bg-amber-500 text-slate-950 text-[11px] font-bold hover:bg-amber-400 transition-colors"
                >
                  Gerente Loja
                </button>
                <button
                  type="button"
                  onClick={() => handleRolePreset('operador_deposito')}
                  className="px-2.5 py-1 rounded-lg bg-blue-600 text-white text-[11px] font-bold hover:bg-blue-700 transition-colors"
                >
                  Depósito
                </button>
                <button
                  type="button"
                  onClick={() => handleRolePreset('caixa')}
                  className="px-2.5 py-1 rounded-lg bg-emerald-600 text-white text-[11px] font-bold hover:bg-emerald-700 transition-colors"
                >
                  Caixa
                </button>
              </div>
            </div>
          )}

          {/* Fine-grained Permissions Checkboxes */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-black uppercase text-slate-700 tracking-wider">
                Permissões Individuais de Acesso ao Sistema:
              </h4>
              <span className="text-[11px] text-slate-500">
                {Object.values(formData.permissions).filter(Boolean).length} de {Object.keys(formData.permissions).length} ativas
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              
              {/* Permission Item: Dashboard */}
              <label
                className={`p-3 rounded-2xl border flex items-start gap-3 cursor-pointer transition-all ${
                  formData.permissions.canViewDashboard
                    ? 'bg-emerald-50/60 border-emerald-300 text-emerald-950'
                    : 'bg-slate-50 border-slate-200 text-slate-400 opacity-75'
                }`}
              >
                <input
                  type="checkbox"
                  disabled={!isEditing}
                  checked={formData.permissions.canViewDashboard}
                  onChange={() => handleTogglePermission('canViewDashboard')}
                  className="mt-0.5 rounded text-rose-600 focus:ring-rose-500 w-4 h-4"
                />
                <div>
                  <p className="text-xs font-bold">Acessar Dashboard</p>
                  <p className="text-[10px] text-slate-500">
                    Visualizar estatísticas gerais, alertas de estoque baixo e validade.
                  </p>
                </div>
              </label>

              {/* Permission Item: View Stock */}
              <label
                className={`p-3 rounded-2xl border flex items-start gap-3 cursor-pointer transition-all ${
                  formData.permissions.canViewStock
                    ? 'bg-emerald-50/60 border-emerald-300 text-emerald-950'
                    : 'bg-slate-50 border-slate-200 text-slate-400 opacity-75'
                }`}
              >
                <input
                  type="checkbox"
                  disabled={!isEditing}
                  checked={formData.permissions.canViewStock}
                  onChange={() => handleTogglePermission('canViewStock')}
                  className="mt-0.5 rounded text-rose-600 focus:ring-rose-500 w-4 h-4"
                />
                <div>
                  <p className="text-xs font-bold">Visualizar Tabelas de Estoque</p>
                  <p className="text-[10px] text-slate-500">
                    Consultar saldos do estoque geral, loja e depósito.
                  </p>
                </div>
              </label>

              {/* Permission Item: Manage Products */}
              <label
                className={`p-3 rounded-2xl border flex items-start gap-3 cursor-pointer transition-all ${
                  formData.permissions.canManageProducts
                    ? 'bg-emerald-50/60 border-emerald-300 text-emerald-950'
                    : 'bg-slate-50 border-slate-200 text-slate-400 opacity-75'
                }`}
              >
                <input
                  type="checkbox"
                  disabled={!isEditing}
                  checked={formData.permissions.canManageProducts}
                  onChange={() => handleTogglePermission('canManageProducts')}
                  className="mt-0.5 rounded text-rose-600 focus:ring-rose-500 w-4 h-4"
                />
                <div>
                  <p className="text-xs font-bold">Cadastrar e Editar Produtos</p>
                  <p className="text-[10px] text-slate-500">
                    Criar novos itens, alterar preços, lote, SKU e estoque mínimo.
                  </p>
                </div>
              </label>

              {/* Permission Item: NF Entry */}
              <label
                className={`p-3 rounded-2xl border flex items-start gap-3 cursor-pointer transition-all ${
                  formData.permissions.canAddNFEntries
                    ? 'bg-emerald-50/60 border-emerald-300 text-emerald-950'
                    : 'bg-slate-50 border-slate-200 text-slate-400 opacity-75'
                }`}
              >
                <input
                  type="checkbox"
                  disabled={!isEditing}
                  checked={formData.permissions.canAddNFEntries}
                  onChange={() => handleTogglePermission('canAddNFEntries')}
                  className="mt-0.5 rounded text-rose-600 focus:ring-rose-500 w-4 h-4"
                />
                <div>
                  <p className="text-xs font-bold">Dar Entrada em Notas Fiscais</p>
                  <p className="text-[10px] text-slate-500">
                    Lançar entradas de mercadorias via chave ou digitação de NF.
                  </p>
                </div>
              </label>

              {/* Permission Item: Stock Transfers */}
              <label
                className={`p-3 rounded-2xl border flex items-start gap-3 cursor-pointer transition-all ${
                  formData.permissions.canTransferStock
                    ? 'bg-emerald-50/60 border-emerald-300 text-emerald-950'
                    : 'bg-slate-50 border-slate-200 text-slate-400 opacity-75'
                }`}
              >
                <input
                  type="checkbox"
                  disabled={!isEditing}
                  checked={formData.permissions.canTransferStock}
                  onChange={() => handleTogglePermission('canTransferStock')}
                  className="mt-0.5 rounded text-rose-600 focus:ring-rose-500 w-4 h-4"
                />
                <div>
                  <p className="text-xs font-bold">Transferir do Depósito para a Loja</p>
                  <p className="text-[10px] text-slate-500">
                    Movimentar produtos entre os dois locais físicos.
                  </p>
                </div>
              </label>

              {/* Permission Item: Register Sales & Movements */}
              <label
                className={`p-3 rounded-2xl border flex items-start gap-3 cursor-pointer transition-all ${
                  formData.permissions.canRegisterMovements
                    ? 'bg-emerald-50/60 border-emerald-300 text-emerald-950'
                    : 'bg-slate-50 border-slate-200 text-slate-400 opacity-75'
                }`}
              >
                <input
                  type="checkbox"
                  disabled={!isEditing}
                  checked={formData.permissions.canRegisterMovements}
                  onChange={() => handleTogglePermission('canRegisterMovements')}
                  className="mt-0.5 rounded text-rose-600 focus:ring-rose-500 w-4 h-4"
                />
                <div>
                  <p className="text-xs font-bold">Registrar Vendas, Ajustes e Perdas</p>
                  <p className="text-[10px] text-slate-500">
                    Dar baixa no estoque da loja por venda de balcão ou avaria.
                  </p>
                </div>
              </label>

              {/* Permission Item: User Management */}
              <label
                className={`p-3 rounded-2xl border flex items-start gap-3 cursor-pointer transition-all ${
                  formData.permissions.canManageUsers
                    ? 'bg-emerald-50/60 border-emerald-300 text-emerald-950'
                    : 'bg-slate-50 border-slate-200 text-slate-400 opacity-75'
                }`}
              >
                <input
                  type="checkbox"
                  disabled={!isEditing}
                  checked={formData.permissions.canManageUsers}
                  onChange={() => handleTogglePermission('canManageUsers')}
                  className="mt-0.5 rounded text-rose-600 focus:ring-rose-500 w-4 h-4"
                />
                <div>
                  <p className="text-xs font-bold font-black text-rose-700">Administrar Usuários e PINs</p>
                  <p className="text-[10px] text-slate-500">
                    Criar/excluir usuários e alterar PINs e permissões de todos.
                  </p>
                </div>
              </label>

              {/* Permission Item: Cloud Backup */}
              <label
                className={`p-3 rounded-2xl border flex items-start gap-3 cursor-pointer transition-all ${
                  formData.permissions.canManageBackup
                    ? 'bg-emerald-50/60 border-emerald-300 text-emerald-950'
                    : 'bg-slate-50 border-slate-200 text-slate-400 opacity-75'
                }`}
              >
                <input
                  type="checkbox"
                  disabled={!isEditing}
                  checked={formData.permissions.canManageBackup}
                  onChange={() => handleTogglePermission('canManageBackup')}
                  className="mt-0.5 rounded text-rose-600 focus:ring-rose-500 w-4 h-4"
                />
                <div>
                  <p className="text-xs font-bold">Backup e Sincronização em Nuvem</p>
                  <p className="text-[10px] text-slate-500">
                    Forçar backup manual e gerenciar banco de dados na nuvem Supabase.
                  </p>
                </div>
              </label>

            </div>
          </div>

          {/* Action Footer */}
          {isEditing && (
            <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setFormData(selectedUser);
                  setIsEditing(false);
                }}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSaveEdit}
                className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-black text-xs shadow-md shadow-rose-900/20 transition-all flex items-center gap-2"
              >
                <Save className="w-4 h-4" />
                <span>Salvar Permissões e PIN</span>
              </button>
            </div>
          )}

        </div>
      </div>

      {/* CADASTRAR NOVO USUÁRIO - MODAL OVERLAY */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4 animate-in fade-in duration-150 overflow-y-auto">
          <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl border border-slate-200 overflow-hidden text-left my-8">
            
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-rose-600 to-rose-700 p-5 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-2xl bg-white/10 text-white shrink-0">
                  <UserPlus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black uppercase tracking-tight">
                    Cadastrar Novo Usuário / Colaborador
                  </h3>
                  <p className="text-xs text-rose-100 font-medium">
                    Preencha os dados, defina o PIN de 4 dígitos e as permissões de acesso
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsCreateModalOpen(false)}
                className="p-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleConfirmCreateUser} className="p-6 space-y-5">
              
              {modalError && (
                <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-2xl text-xs font-bold text-rose-800 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{modalError}</span>
                </div>
              )}

              {/* Basic Fields Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                
                {/* Foto / Avatar do Novo Usuário */}
                <div className="sm:col-span-2 flex items-center justify-between gap-3 bg-slate-50 p-3.5 rounded-2xl border border-slate-200">
                  <div className="flex items-center gap-3">
                    <UserAvatar avatarUrl={newUserAvatarUrl} name={newUserName || 'Novo Usuário'} className="w-12 h-12 rounded-2xl shadow-xs" />
                    <div>
                      <p className="text-xs font-black text-slate-800">Foto ou Emoji de Perfil:</p>
                      <p className="text-[11px] text-slate-500">Escolha um emoji, foto do sistema ou envie uma imagem</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setAvatarPickerTarget('new');
                      setIsAvatarPickerOpen(true);
                    }}
                    className="px-3 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-xs shadow-xs transition-colors flex items-center gap-1.5 shrink-0"
                  >
                    <Camera className="w-3.5 h-3.5" />
                    <span>Escolher Foto</span>
                  </button>
                </div>

                {/* Nome Completo */}
                <div className="sm:col-span-2">
                  <label className="block text-xs font-black text-slate-800 mb-1">
                    Nome Completo do Colaborador <span className="text-rose-600">*</span>:
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: João da Silva"
                    value={newUserName}
                    onChange={(e) => {
                      setNewUserName(e.target.value);
                      if (modalError) setModalError('');
                    }}
                    autoFocus
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs font-bold text-slate-900 focus:ring-2 focus:ring-rose-500 focus:bg-white focus:outline-none"
                  />
                </div>

                {/* E-mail Corporativo */}
                <div>
                  <label className="block text-xs font-black text-slate-800 mb-1">
                    E-mail Corporativo (Opcional):
                  </label>
                  <input
                    type="email"
                    placeholder="joao@fininovafriburgo.com.br"
                    value={newUserEmail}
                    onChange={(e) => setNewUserEmail(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs font-bold text-slate-900 focus:ring-2 focus:ring-rose-500 focus:bg-white focus:outline-none"
                  />
                </div>

                {/* Cargo / Perfil */}
                <div>
                  <label className="block text-xs font-black text-slate-800 mb-1">
                    Cargo / Perfil de Acesso <span className="text-rose-600">*</span>:
                  </label>
                  <select
                    value={newUserRole}
                    onChange={(e) => handleModalRoleChange(e.target.value as UserRole)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs font-bold text-slate-900 focus:ring-2 focus:ring-rose-500 focus:bg-white focus:outline-none"
                  >
                    <option value="admin">Administrador (Acesso Total)</option>
                    <option value="gerente_loja">Gerente de Loja</option>
                    <option value="operador_deposito">Operador do Depósito Central</option>
                    <option value="caixa">Operador de Caixa / Vendas</option>
                    <option value="auditor">Auditor / Visualizador Apenas</option>
                  </select>
                </div>

                {/* PIN de Acesso */}
                <div className="sm:col-span-2 bg-rose-50/60 p-4 rounded-2xl border border-rose-200 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-black text-rose-900 flex items-center gap-1.5">
                      <KeyRound className="w-4 h-4 text-rose-600" />
                      <span>PIN de Acesso do Usuário (4 dígitos numéricos) <span className="text-rose-600">*</span>:</span>
                    </label>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setNewUserPin(Math.floor(1000 + Math.random() * 9000).toString())}
                        className="text-[11px] font-bold text-rose-700 bg-rose-100 hover:bg-rose-200 px-2.5 py-1 rounded-lg flex items-center gap-1 transition-colors"
                        title="Gerar PIN Aleatório"
                      >
                        <Wand2 className="w-3 h-3 text-rose-600" />
                        <span>Gerar PIN</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setShowModalPin(!showModalPin)}
                        className="text-[11px] font-bold text-slate-600 hover:text-slate-900 flex items-center gap-1"
                      >
                        {showModalPin ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        <span>{showModalPin ? 'Ocultar' : 'Mostrar'}</span>
                      </button>
                    </div>
                  </div>

                  <input
                    type={showModalPin ? 'text' : 'password'}
                    maxLength={4}
                    required
                    placeholder="1234"
                    value={newUserPin}
                    onChange={(e) => {
                      const val = e.target.value.replace(/\D/g, '').slice(0, 4);
                      setNewUserPin(val);
                      if (modalError) setModalError('');
                    }}
                    className="w-full bg-white border border-rose-300 font-mono text-base font-black tracking-widest text-slate-900 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-rose-500 focus:outline-none text-center sm:text-left"
                  />
                  <p className="text-[10px] text-slate-500">
                    O PIN é utilizado para a rápida identificação do operador ao realizar vendas e transferências.
                  </p>
                </div>

              </div>

              {/* Permissions Checkboxes Section */}
              <div className="space-y-2.5 pt-2 border-t border-slate-100">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-black uppercase text-slate-800 tracking-wider">
                    Permissões de Acesso ao ERP:
                  </h4>
                  <span className="text-[10px] font-bold bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md">
                    Predefinido pelo Cargo
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-56 overflow-y-auto p-1">
                  
                  <label className={`p-2.5 rounded-xl border flex items-center gap-2.5 cursor-pointer text-xs font-bold transition-all ${
                    newUserPermissions.canViewDashboard ? 'bg-emerald-50 border-emerald-300 text-emerald-950' : 'bg-slate-50 border-slate-200 text-slate-500'
                  }`}>
                    <input
                      type="checkbox"
                      checked={newUserPermissions.canViewDashboard}
                      onChange={() => handleToggleModalPermission('canViewDashboard')}
                      className="rounded text-rose-600 focus:ring-rose-500 w-4 h-4"
                    />
                    <span>Visualizar Dashboard</span>
                  </label>

                  <label className={`p-2.5 rounded-xl border flex items-center gap-2.5 cursor-pointer text-xs font-bold transition-all ${
                    newUserPermissions.canViewStock ? 'bg-emerald-50 border-emerald-300 text-emerald-950' : 'bg-slate-50 border-slate-200 text-slate-500'
                  }`}>
                    <input
                      type="checkbox"
                      checked={newUserPermissions.canViewStock}
                      onChange={() => handleToggleModalPermission('canViewStock')}
                      className="rounded text-rose-600 focus:ring-rose-500 w-4 h-4"
                    />
                    <span>Visualizar Tabelas de Estoque</span>
                  </label>

                  <label className={`p-2.5 rounded-xl border flex items-center gap-2.5 cursor-pointer text-xs font-bold transition-all ${
                    newUserPermissions.canManageProducts ? 'bg-emerald-50 border-emerald-300 text-emerald-950' : 'bg-slate-50 border-slate-200 text-slate-500'
                  }`}>
                    <input
                      type="checkbox"
                      checked={newUserPermissions.canManageProducts}
                      onChange={() => handleToggleModalPermission('canManageProducts')}
                      className="rounded text-rose-600 focus:ring-rose-500 w-4 h-4"
                    />
                    <span>Cadastrar e Editar Produtos</span>
                  </label>

                  <label className={`p-2.5 rounded-xl border flex items-center gap-2.5 cursor-pointer text-xs font-bold transition-all ${
                    newUserPermissions.canAddNFEntries ? 'bg-emerald-50 border-emerald-300 text-emerald-950' : 'bg-slate-50 border-slate-200 text-slate-500'
                  }`}>
                    <input
                      type="checkbox"
                      checked={newUserPermissions.canAddNFEntries}
                      onChange={() => handleToggleModalPermission('canAddNFEntries')}
                      className="rounded text-rose-600 focus:ring-rose-500 w-4 h-4"
                    />
                    <span>Dar Entrada em Notas Fiscais</span>
                  </label>

                  <label className={`p-2.5 rounded-xl border flex items-center gap-2.5 cursor-pointer text-xs font-bold transition-all ${
                    newUserPermissions.canTransferStock ? 'bg-emerald-50 border-emerald-300 text-emerald-950' : 'bg-slate-50 border-slate-200 text-slate-500'
                  }`}>
                    <input
                      type="checkbox"
                      checked={newUserPermissions.canTransferStock}
                      onChange={() => handleToggleModalPermission('canTransferStock')}
                      className="rounded text-rose-600 focus:ring-rose-500 w-4 h-4"
                    />
                    <span>Transferir do Depósito para a Loja</span>
                  </label>

                  <label className={`p-2.5 rounded-xl border flex items-center gap-2.5 cursor-pointer text-xs font-bold transition-all ${
                    newUserPermissions.canRegisterMovements ? 'bg-emerald-50 border-emerald-300 text-emerald-950' : 'bg-slate-50 border-slate-200 text-slate-500'
                  }`}>
                    <input
                      type="checkbox"
                      checked={newUserPermissions.canRegisterMovements}
                      onChange={() => handleToggleModalPermission('canRegisterMovements')}
                      className="rounded text-rose-600 focus:ring-rose-500 w-4 h-4"
                    />
                    <span>Registrar Vendas e Baixas de Estoque</span>
                  </label>

                  <label className={`p-2.5 rounded-xl border flex items-center gap-2.5 cursor-pointer text-xs font-bold transition-all ${
                    newUserPermissions.canManageUsers ? 'bg-emerald-50 border-emerald-300 text-emerald-950' : 'bg-slate-50 border-slate-200 text-slate-500'
                  }`}>
                    <input
                      type="checkbox"
                      checked={newUserPermissions.canManageUsers}
                      onChange={() => handleToggleModalPermission('canManageUsers')}
                      className="rounded text-rose-600 focus:ring-rose-500 w-4 h-4"
                    />
                    <span>Administrar Usuários e PINs</span>
                  </label>

                  <label className={`p-2.5 rounded-xl border flex items-center gap-2.5 cursor-pointer text-xs font-bold transition-all ${
                    newUserPermissions.canManageBackup ? 'bg-emerald-50 border-emerald-300 text-emerald-950' : 'bg-slate-50 border-slate-200 text-slate-500'
                  }`}>
                    <input
                      type="checkbox"
                      checked={newUserPermissions.canManageBackup}
                      onChange={() => handleToggleModalPermission('canManageBackup')}
                      className="rounded text-rose-600 focus:ring-rose-500 w-4 h-4"
                    />
                    <span>Backup e Sincronização em Nuvem</span>
                  </label>

                </div>
              </div>

              {/* Action Buttons Footer */}
              <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition-colors"
                >
                  Cancelar
                </button>

                <button
                  type="submit"
                  className="px-6 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-black text-xs shadow-md shadow-rose-900/30 transition-all flex items-center gap-2"
                >
                  <UserPlus className="w-4 h-4" />
                  <span>Cadastrar Usuário</span>
                </button>
              </div>

            </form>

          </div>
        </div>
      )}

      {/* Avatar Picker Modal */}
      <AvatarPickerModal
        isOpen={isAvatarPickerOpen}
        onClose={() => setIsAvatarPickerOpen(false)}
        currentAvatarUrl={avatarPickerTarget === 'edit' ? formData.avatarUrl : newUserAvatarUrl}
        userName={avatarPickerTarget === 'edit' ? formData.name : newUserName}
        onSelectAvatar={(newAvatarUrl) => {
          if (avatarPickerTarget === 'edit') {
            const updated = { ...formData, avatarUrl: newAvatarUrl };
            setFormData(updated);
            setSelectedUser(updated);
            updateUser(updated);
            showNotification('Foto do usuário atualizada com sucesso!');
          } else {
            setNewUserAvatarUrl(newAvatarUrl);
          }
        }}
      />

    </div>
  );
};

