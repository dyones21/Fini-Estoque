import React, { useState } from 'react';
import {
  ShieldCheck,
  Shield,
  Plus,
  Edit2,
  Trash2,
  X,
  CheckCircle2,
  AlertCircle,
  Users,
  Lock,
  Sparkles,
  Save,
  Check,
  RotateCcw,
} from 'lucide-react';
import { useStock } from '../context/StockContext';
import { Role, UserPermissions } from '../types';
import { getFriendlyErrorMessage } from '../utils/errorHandler';

interface RoleManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const PERMISSION_METADATA: {
  key: keyof UserPermissions;
  label: string;
  description: string;
  category: 'visualizacao' | 'operacao' | 'gestao' | 'critica';
}[] = [
  {
    key: 'canViewDashboard',
    label: 'Acessar Dashboard',
    description: 'Visualizar estatísticas gerais, métricas financeiras e alertas.',
    category: 'visualizacao',
  },
  {
    key: 'canViewStock',
    label: 'Visualizar Estoque',
    description: 'Consultar saldos, tabelas de produtos e relatórios de estoque.',
    category: 'visualizacao',
  },
  {
    key: 'canManageProducts',
    label: 'Gerenciar Produtos',
    description: 'Cadastrar, editar preços/lotes e excluir produtos do catálogo.',
    category: 'operacao',
  },
  {
    key: 'canAddNFEntries',
    label: 'Lançar Notas Fiscais (Entrada)',
    description: 'Importar XML de NF-e e dar entrada de mercadorias no estoque.',
    category: 'operacao',
  },
  {
    key: 'canDeleteNFEntries',
    label: 'Excluir Notas Fiscais',
    description: 'Excluir notas fiscais com estorno/reversão automática de estoque.',
    category: 'operacao',
  },
  {
    key: 'canTransferStock',
    label: 'Transferir Estoque',
    description: 'Movimentar mercadorias entre o Depósito Central e a Loja.',
    category: 'operacao',
  },
  {
    key: 'canRegisterMovements',
    label: 'Registrar Movimentações & Vendas',
    description: 'Registrar saídas para baleiro, vendas e perdas/ajustes de estoque.',
    category: 'operacao',
  },
  {
    key: 'canManageUsers',
    label: 'Gerenciar Usuários',
    description: 'Criar, editar perfis, definir senhas e gerenciar colaboradores.',
    category: 'gestao',
  },
  {
    key: 'canManageBackup',
    label: 'Backup em Nuvem',
    description: 'Acessar a tela de sincronização, exportação e importação de backups.',
    category: 'gestao',
  },
  {
    key: 'canManageCompany',
    label: 'Configurações da Empresa',
    description: 'Acessar e editar dados cadastrais, CNPJ e margens da empresa.',
    category: 'gestao',
  },
  {
    key: 'canWipeSystem',
    label: 'Zerar Todo o Sistema (Exclusivo)',
    description: 'Ação crítica de apagar produtos, movimentações, NF e vendas de toda a empresa.',
    category: 'critica',
  },
];

export const RoleManagementModal: React.FC<RoleManagementModalProps> = ({ isOpen, onClose }) => {
  const { roles, isLoadingRoles, createRole, updateRole, deleteRole, allUsers, currentUser } = useStock();

  const isSystemAdmin = Boolean(
    currentUser?.isSystemRole ||
      currentUser?.role === 'ADMIN' ||
      currentUser?.role === 'super_admin' ||
      currentUser?.roleId === 'role_admin' ||
      (currentUser?.email && currentUser.email.toLowerCase() === 'dyones21@gmail.com')
  );

  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [isCreatingNew, setIsCreatingNew] = useState<boolean>(false);
  const [roleName, setRoleName] = useState<string>('');
  const [rolePermissions, setRolePermissions] = useState<Record<keyof UserPermissions, boolean>>({
    canViewDashboard: true,
    canViewStock: true,
    canManageProducts: false,
    canAddNFEntries: false,
    canDeleteNFEntries: false,
    canTransferStock: false,
    canRegisterMovements: false,
    canManageUsers: false,
    canManageBackup: false,
    canManageCompany: false,
    canWipeSystem: false,
  });

  const [errorMessage, setErrorMessage] = useState<string>('');
  const [successMessage, setSuccessMessage] = useState<string>('');
  const [isSaving, setIsSaving] = useState<boolean>(false);

  if (!isOpen) return null;

  // Contagem de usuários vinculados por cargo (usando roleId ou nome do role)
  const getUserCountForRole = (role: Role) => {
    return allUsers.filter((u) => {
      if (u.roleId && u.roleId === role.id) return true;
      if (role.name && u.role && u.role.toLowerCase() === role.name.toLowerCase()) return true;
      if (role.id === 'role_admin' && (u.role === 'super_admin' || u.role === 'admin' || u.role === 'ADMIN')) return true;
      if (role.id === 'role_gerente' && (u.role === 'gerente_loja' || u.role === 'Gerente de Loja')) return true;
      if (role.id === 'role_operador' && (u.role === 'operador_deposito' || u.role === 'Operador Depósito/Loja')) return true;
      if (role.id === 'role_caixa' && (u.role === 'caixa' || u.role === 'Caixa / Vendas')) return true;
      if (role.id === 'role_auditor' && (u.role === 'auditor' || u.role === 'Auditor')) return true;
      return false;
    }).length;
  };

  const handleStartCreate = () => {
    setIsCreatingNew(true);
    setEditingRole(null);
    setRoleName('');
    setRolePermissions({
      canViewDashboard: true,
      canViewStock: true,
      canManageProducts: false,
      canAddNFEntries: false,
      canDeleteNFEntries: false,
      canTransferStock: false,
      canRegisterMovements: false,
      canManageUsers: false,
      canManageBackup: false,
      canManageCompany: false,
      canWipeSystem: false,
    });
    setErrorMessage('');
    setSuccessMessage('');
  };

  const handleStartEdit = (role: Role) => {
    setIsCreatingNew(false);
    setEditingRole(role);
    setRoleName(role.name);
    setRolePermissions({
      canViewDashboard: Boolean(role.canViewDashboard),
      canViewStock: Boolean(role.canViewStock),
      canManageProducts: Boolean(role.canManageProducts),
      canAddNFEntries: Boolean(role.canAddNFEntries),
      canDeleteNFEntries: Boolean(role.canDeleteNFEntries),
      canTransferStock: Boolean(role.canTransferStock),
      canRegisterMovements: Boolean(role.canRegisterMovements),
      canManageUsers: Boolean(role.canManageUsers),
      canManageBackup: Boolean(role.canManageBackup),
      canManageCompany: Boolean(role.canManageCompany),
      canWipeSystem: Boolean(role.canWipeSystem),
    });
    setErrorMessage('');
    setSuccessMessage('');
  };

  const handleCancelForm = () => {
    setIsCreatingNew(false);
    setEditingRole(null);
    setRoleName('');
    setErrorMessage('');
  };

  const handleTogglePermission = (key: keyof UserPermissions) => {
    if (editingRole?.isSystemRole) return; // ADMIN fixo não pode ter permissões desmarcadas
    setRolePermissions((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const handleSelectAll = (value: boolean) => {
    if (editingRole?.isSystemRole) return;
    setRolePermissions({
      canViewDashboard: value,
      canViewStock: value,
      canManageProducts: value,
      canAddNFEntries: value,
      canDeleteNFEntries: value,
      canTransferStock: value,
      canRegisterMovements: value,
      canManageUsers: value,
      canManageBackup: value,
      canManageCompany: value,
      canWipeSystem: value,
    });
  };

  const handleSaveRole = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');

    if (!roleName.trim()) {
      setErrorMessage('O nome do cargo é obrigatório.');
      return;
    }

    try {
      setIsSaving(true);
      if (isCreatingNew) {
        await createRole({
          name: roleName.trim(),
          ...rolePermissions,
        });
        setSuccessMessage(`Cargo "${roleName.trim()}" criado com sucesso!`);
        setIsCreatingNew(false);
        setEditingRole(null);
      } else if (editingRole) {
        await updateRole(editingRole.id, {
          name: editingRole.isSystemRole ? editingRole.name : roleName.trim(),
          ...rolePermissions,
        });
        setSuccessMessage(`Cargo "${editingRole.name}" atualizado com sucesso!`);
        setEditingRole(null);
      }
    } catch (err: any) {
      setErrorMessage(getFriendlyErrorMessage(err, 'Falha ao salvar cargo no servidor.'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteRole = async (role: Role) => {
    setErrorMessage('');
    setSuccessMessage('');

    if (role.isSystemRole) {
      setErrorMessage('O cargo ADMIN é fixo do sistema e não pode ser excluído.');
      return;
    }

    const count = getUserCountForRole(role);
    if (count > 0) {
      setErrorMessage(
        `Não é possível excluir o cargo "${role.name}" porque existem ${count} colaborador(es) vinculado(s) a ele. Reatribua esses colaboradores para outro cargo antes de excluir.`
      );
      return;
    }

    if (!confirm(`Tem certeza que deseja excluir o cargo "${role.name}"? Esta ação é irreversível.`)) {
      return;
    }

    try {
      await deleteRole(role.id);
      setSuccessMessage(`Cargo "${role.name}" excluído com sucesso.`);
      if (editingRole?.id === role.id) {
        setEditingRole(null);
      }
    } catch (err: any) {
      setErrorMessage(getFriendlyErrorMessage(err, 'Falha ao excluir cargo no servidor.'));
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-150 overflow-y-auto">
      <div className="bg-white w-full max-w-4xl rounded-3xl border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[90vh] my-6">
        {/* Modal Header */}
        <div className="bg-gradient-to-r from-slate-900 to-slate-800 px-6 py-5 flex items-center justify-between text-white shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-rose-600/30 border border-rose-500/50 flex items-center justify-center text-rose-400">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-black uppercase tracking-tight">Gestão de Cargos & Permissões</h2>
                <span className="px-2 py-0.5 rounded-md bg-rose-500/20 text-rose-300 text-[10px] font-black uppercase tracking-wider border border-rose-500/30">
                  Exclusivo ADMIN
                </span>
              </div>
              <p className="text-xs text-slate-300 font-medium">
                Crie cargos personalizados e configure com precisão o que cada perfil pode acessar no ERP.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-700/60 transition-colors"
            title="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Status Alerts */}
        {errorMessage && (
          <div className="mx-6 mt-4 p-3.5 rounded-2xl bg-rose-50 border border-rose-200 flex items-start gap-2.5 text-xs text-rose-900 font-semibold animate-in fade-in">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <div className="flex-1">{errorMessage}</div>
            <button onClick={() => setErrorMessage('')} className="text-rose-500 hover:text-rose-700">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {successMessage && (
          <div className="mx-6 mt-4 p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-start gap-2.5 text-xs text-emerald-900 font-semibold animate-in fade-in">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <div className="flex-1">{successMessage}</div>
            <button onClick={() => setSuccessMessage('')} className="text-emerald-500 hover:text-emerald-700">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {!isCreatingNew && !editingRole ? (
            /* Roles List View */
            <div className="space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                  <h3 className="text-sm font-black text-slate-900 uppercase tracking-tight">Cargos Cadastrados no Banco</h3>
                  <p className="text-xs text-slate-500 font-medium">
                    {roles.length} cargo(s) configurado(s). O cargo ADMIN é fixo e irrestrito.
                  </p>
                </div>

                {isSystemAdmin && (
                  <button
                    type="button"
                    onClick={handleStartCreate}
                    className="px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs flex items-center gap-2 shadow-xs transition-all hover:scale-[1.02] active:scale-[0.98]"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Criar Novo Cargo</span>
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {roles.map((role) => {
                  const userCount = getUserCountForRole(role);
                  const activePermsCount = Object.keys(role).filter(
                    (k) => k.startsWith('can') && Boolean((role as any)[k])
                  ).length;

                  return (
                    <div
                      key={role.id}
                      className={`p-4 rounded-2xl border transition-all flex flex-col justify-between ${
                        role.isSystemRole
                          ? 'bg-slate-900 text-white border-slate-800 shadow-md'
                          : 'bg-white text-slate-900 border-slate-200 hover:border-slate-300 shadow-2xs'
                      }`}
                    >
                      <div className="space-y-3">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="flex items-center gap-2">
                              <h4 className="text-sm font-black tracking-tight">{role.name}</h4>
                              {role.isSystemRole ? (
                                <span className="px-2 py-0.5 rounded-md bg-rose-500 text-white text-[10px] font-black uppercase tracking-wider flex items-center gap-1 shadow-2xs">
                                  <Lock className="w-3 h-3" /> Fixo do Sistema
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 text-[10px] font-bold uppercase tracking-wider border border-slate-200">
                                  Personalizado
                                </span>
                              )}
                            </div>
                            <p
                              className={`text-[11px] font-medium mt-0.5 ${
                                role.isSystemRole ? 'text-slate-400' : 'text-slate-500'
                              }`}
                            >
                              {activePermsCount} de 10 permissões ativas
                            </p>
                          </div>

                          <div
                            className={`px-2.5 py-1 rounded-xl text-xs font-bold flex items-center gap-1.5 shrink-0 ${
                              role.isSystemRole
                                ? 'bg-slate-800 text-slate-300 border border-slate-700'
                                : 'bg-slate-50 text-slate-700 border border-slate-200'
                            }`}
                            title="Colaboradores vinculados a este cargo"
                          >
                            <Users className="w-3.5 h-3.5 text-rose-500" />
                            <span>{userCount} usuário(s)</span>
                          </div>
                        </div>

                        {/* Active Permission Badges */}
                        <div className="flex flex-wrap gap-1.5 pt-1">
                          {PERMISSION_METADATA.map((p) => {
                            const isAllowed = Boolean((role as any)[p.key]);
                            if (!isAllowed) return null;
                            return (
                              <span
                                key={p.key}
                                className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                                  role.isSystemRole
                                    ? 'bg-slate-800 text-slate-300 border border-slate-700'
                                    : p.category === 'critica'
                                    ? 'bg-rose-100 text-rose-800 border border-rose-200'
                                    : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                                }`}
                              >
                                {p.label}
                              </span>
                            );
                          })}
                        </div>
                      </div>

                      {/* Actions */}
                      <div
                        className={`mt-4 pt-3 border-t flex items-center justify-end gap-2 ${
                          role.isSystemRole ? 'border-slate-800' : 'border-slate-100'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => handleStartEdit(role)}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors ${
                            role.isSystemRole
                              ? 'bg-slate-800 hover:bg-slate-700 text-slate-200'
                              : 'bg-slate-100 hover:bg-slate-200 text-slate-800'
                          }`}
                        >
                          <Edit2 className="w-3.5 h-3.5 text-rose-500" />
                          <span>{role.isSystemRole ? 'Ver Permissões' : 'Editar Permissões'}</span>
                        </button>

                        {!role.isSystemRole && isSystemAdmin && (
                          <button
                            type="button"
                            onClick={() => handleDeleteRole(role)}
                            className="px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 transition-colors"
                            title="Excluir Cargo"
                          >
                            <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                            <span>Excluir</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            /* Create / Edit Role Form View */
            <form onSubmit={handleSaveRole} className="space-y-6">
              <div className="flex items-center justify-between pb-3 border-b border-slate-200">
                <div>
                  <h3 className="text-sm font-black text-slate-900 uppercase tracking-tight">
                    {isCreatingNew ? 'Novo Cargo Personalizado' : `Editar Cargo: ${editingRole?.name}`}
                  </h3>
                  <p className="text-xs text-slate-500 font-medium">
                    {editingRole?.isSystemRole
                      ? 'O cargo ADMIN é fixo do sistema e possui todas as permissões permanentemente ativadas.'
                      : 'Defina o nome do cargo e selecione as permissões que os usuários associados terão.'}
                  </p>
                </div>

                {!editingRole?.isSystemRole && (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleSelectAll(true)}
                      className="px-2.5 py-1 text-[11px] font-bold rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 transition-colors"
                    >
                      Marcar Todas
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSelectAll(false)}
                      className="px-2.5 py-1 text-[11px] font-bold rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 transition-colors"
                    >
                      Desmarcar Todas
                    </button>
                  </div>
                )}
              </div>

              {/* Role Name Input */}
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200">
                <label className="block text-xs font-bold text-slate-700 mb-1.5">Nome do Cargo / Perfil:</label>
                <input
                  type="text"
                  disabled={editingRole?.isSystemRole || isSaving}
                  value={roleName}
                  onChange={(e) => setRoleName(e.target.value)}
                  placeholder="Ex: Supervisor de Vendas, Encarregado de Estoque..."
                  className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs font-bold text-slate-900 focus:ring-2 focus:ring-rose-500 focus:outline-none disabled:bg-slate-100 disabled:text-slate-500"
                />
                {editingRole?.isSystemRole && (
                  <p className="text-[11px] text-slate-500 mt-1 font-semibold flex items-center gap-1">
                    <Lock className="w-3 h-3 text-rose-500" /> O nome do Administrador fixo do sistema não pode ser alterado.
                  </p>
                )}
              </div>

              {/* Permissions Checklist */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-black uppercase text-slate-800 tracking-wider">
                    Permissões de Acesso do Cargo:
                  </h4>
                  <span className="text-xs font-bold text-slate-500">
                    {Object.values(rolePermissions).filter(Boolean).length} de {PERMISSION_METADATA.length} ativas
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {PERMISSION_METADATA.map((p) => {
                    const isChecked = Boolean(rolePermissions[p.key]);
                    const isSystem = Boolean(editingRole?.isSystemRole);

                    return (
                      <label
                        key={p.key}
                        className={`p-3.5 rounded-2xl border flex items-start gap-3 transition-all ${
                          isSystem ? 'cursor-not-allowed opacity-90' : 'cursor-pointer'
                        } ${
                          isChecked
                            ? p.category === 'critica'
                              ? 'bg-rose-50/70 border-rose-300 text-rose-950 shadow-2xs'
                              : 'bg-emerald-50/70 border-emerald-300 text-emerald-950 shadow-2xs'
                            : 'bg-slate-50 border-slate-200 text-slate-400 opacity-70'
                        }`}
                      >
                        <input
                          type="checkbox"
                          disabled={isSystem || isSaving}
                          checked={isChecked}
                          onChange={() => handleTogglePermission(p.key)}
                          className="mt-0.5 rounded text-rose-600 focus:ring-rose-500 w-4 h-4 shrink-0"
                        />
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <p className="text-xs font-bold">{p.label}</p>
                            {p.category === 'critica' && (
                              <span className="text-[9px] font-black uppercase px-1.5 py-0.2 rounded bg-rose-200 text-rose-900">
                                Ação Crítica
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-slate-500 leading-tight mt-0.5">{p.description}</p>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Form Buttons */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
                <button
                  type="button"
                  onClick={handleCancelForm}
                  disabled={isSaving}
                  className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition-colors"
                >
                  Voltar para Lista
                </button>

                {!editingRole?.isSystemRole && (
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs flex items-center gap-2 shadow-xs transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50"
                  >
                    <Save className="w-4 h-4" />
                    <span>{isSaving ? 'Salvando...' : isCreatingNew ? 'Salvar Cargo' : 'Salvar Alterações'}</span>
                  </button>
                )}
              </div>
            </form>
          )}
        </div>

        {/* Modal Footer */}
        <div className="bg-slate-50 px-6 py-4 border-t border-slate-200 flex items-center justify-between shrink-0">
          <p className="text-[11px] text-slate-500 font-medium">
            🔒 As alterações de cargo e permissão são aplicadas em tempo real em todas as sessões do ERP.
          </p>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold text-xs transition-colors"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
