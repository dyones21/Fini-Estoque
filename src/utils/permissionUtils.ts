import { UserPermissions, UserRole } from '../types';

/**
 * Permissões padrão quando um cargo é desconhecido, corrompido ou ausente (Negar Tudo por Padrão).
 */
export const DEFAULT_DENY_PERMISSIONS: UserPermissions = {
  canViewDashboard: false,
  canViewStock: false,
  canManageProducts: false,
  canAddNFEntries: false,
  canDeleteNFEntries: false,
  canTransferStock: false,
  canRegisterMovements: false,
  canManageUsers: false,
  canManageBackup: false,
  canWipeSystem: false,
};

/**
 * Permissões completas do Administrador do Sistema.
 */
export const SYSTEM_ADMIN_PERMISSIONS: UserPermissions = {
  canViewDashboard: true,
  canViewStock: true,
  canManageProducts: true,
  canAddNFEntries: true,
  canDeleteNFEntries: true,
  canTransferStock: true,
  canRegisterMovements: true,
  canManageUsers: true,
  canManageBackup: true,
  canWipeSystem: true,
};

/**
 * Catálogo e descrição amigável de cada uma das permissões disponíveis no sistema RBAC.
 */
export interface PermissionMeta {
  key: keyof UserPermissions;
  title: string;
  category: 'Visualização' | 'Operação' | 'Gestão e Cadastros' | 'Administração Crítica';
  description: string;
  isDangerous?: boolean;
}

export const PERMISSION_METAS: PermissionMeta[] = [
  {
    key: 'canViewDashboard',
    title: 'Visualizar Dashboard & Indicadores',
    category: 'Visualização',
    description: 'Acesso aos gráficos executivos, valor em estoque, Curva ABC e métricas operacionais.',
  },
  {
    key: 'canViewStock',
    title: 'Consultar Catálogo e Estoque',
    category: 'Visualização',
    description: 'Visualizar lista de produtos, quantidades disponíveis na Loja e Depósito, lotes e validades.',
  },
  {
    key: 'canRegisterMovements',
    title: 'Registrar Vendas e Movimentações',
    category: 'Operação',
    description: 'Lançar vendas avulsas de balcão (PDV), registrar perdas/avarias e ajustes manuais.',
  },
  {
    key: 'canTransferStock',
    title: 'Transferir Estoque (Depósito ➔ Loja)',
    category: 'Operação',
    description: 'Realizar movimentação interna de reposição de mercadorias do depósito para as prateleiras.',
  },
  {
    key: 'canAddNFEntries',
    title: 'Dar Entrada em Notas Fiscais (NF-e)',
    category: 'Gestão e Cadastros',
    description: 'Importar XML de compras de fornecedores e abastecer estoque do depósito.',
  },
  {
    key: 'canDeleteNFEntries',
    title: 'Excluir Notas Fiscais Lançadas',
    category: 'Gestão e Cadastros',
    description: 'Remover lançamento de NF e estornar automaticamente as quantidades adicionadas ao estoque.',
  },
  {
    key: 'canManageProducts',
    title: 'Cadastrar e Editar Produtos',
    category: 'Gestão e Cadastros',
    description: 'Criar novos itens, alterar preços de custo/venda, margem de lucro e estoques mínimos.',
  },
  {
    key: 'canManageUsers',
    title: 'Gerenciar Operadores e PINs',
    category: 'Gestão e Cadastros',
    description: 'Criar contas de colaboradores, redefinir senhas, PINs e atribuir cargos.',
  },
  {
    key: 'canManageBackup',
    title: 'Backup e Dados da Empresa',
    category: 'Administração Crítica',
    description: 'Exportar/Importar cópias de segurança JSON e editar dados cadastrais/fiscais da loja.',
  },
  {
    key: 'canWipeSystem',
    title: 'Zerar Banco de Dados (Exclusivo Admin)',
    category: 'Administração Crítica',
    description: 'Autorização suprema para apagar todos os produtos, movimentações e notas fiscais com PIN.',
    isDangerous: true,
  },
];

/**
 * Normaliza e extrai permissões de um objeto de cargo retornado do banco ou perfil do usuário.
 * Se o cargo não for localizado ou for inválido, nega todas as permissões (DEFAULT_DENY_PERMISSIONS).
 */
export function getRolePermissions(roleOrPermissions?: any): UserPermissions {
  if (!roleOrPermissions) {
    return { ...DEFAULT_DENY_PERMISSIONS };
  }

  // Se já for um objeto com as chaves booleanas
  if (typeof roleOrPermissions === 'object') {
    if (roleOrPermissions.isSystemRole) {
      return { ...SYSTEM_ADMIN_PERMISSIONS };
    }
    const p = roleOrPermissions.permissions || roleOrPermissions;
    return {
      canViewDashboard: Boolean(p.canViewDashboard),
      canViewStock: Boolean(p.canViewStock),
      canManageProducts: Boolean(p.canManageProducts),
      canAddNFEntries: Boolean(p.canAddNFEntries),
      canDeleteNFEntries: Boolean(p.canDeleteNFEntries),
      canTransferStock: Boolean(p.canTransferStock),
      canRegisterMovements: Boolean(p.canRegisterMovements),
      canManageUsers: Boolean(p.canManageUsers),
      canManageBackup: Boolean(p.canManageBackup),
      canWipeSystem: Boolean(p.canWipeSystem),
    };
  }

  // Se for uma string de role legada
  const str = String(roleOrPermissions).trim().toLowerCase();
  if (str === 'super_admin' || str === 'admin' || str === 'administrador') {
    return { ...SYSTEM_ADMIN_PERMISSIONS };
  }

  // Qualquer outro cargo por string pura sem objeto de banco -> nega por padrão para segurança
  return { ...DEFAULT_DENY_PERMISSIONS };
}

/**
 * Verifica se um papel de usuário possui uma determinada permissão.
 */
export function hasPermission(
  permissions: UserPermissions | undefined,
  permission: keyof UserPermissions
): boolean {
  if (!permissions) return false;
  return Boolean(permissions[permission]);
}
