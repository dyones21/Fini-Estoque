import { UserPermissions, UserRole } from '../types';

/**
 * Normaliza e calcula a matriz de permissões de acordo com o papel (role) do usuário.
 * Compartilhado estritamente entre Frontend e Backend Express para integridade de segurança.
 */
export function getRolePermissions(role?: string | UserRole | null): UserPermissions {
  const normalizedRole = (role || '').trim().toLowerCase();

  switch (normalizedRole) {
    case 'super_admin':
    case 'admin':
      return {
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

    case 'gerente_loja':
    case 'gerente geral':
    case 'gerente':
      return {
        canViewDashboard: true,
        canViewStock: true,
        canManageProducts: true,
        canAddNFEntries: true,
        canDeleteNFEntries: false,
        canTransferStock: true,
        canRegisterMovements: true,
        canManageUsers: false,
        canManageBackup: true,
        canWipeSystem: false,
      };

    case 'operador_deposito':
    case 'operador depósito/loja':
    case 'operador deposito/loja':
    case 'operador':
      return {
        canViewDashboard: true,
        canViewStock: true,
        canManageProducts: false,
        canAddNFEntries: true,
        canDeleteNFEntries: false,
        canTransferStock: true,
        canRegisterMovements: true,
        canManageUsers: false,
        canManageBackup: false,
        canWipeSystem: false,
      };

    case 'caixa':
      return {
        canViewDashboard: true,
        canViewStock: true,
        canManageProducts: false,
        canAddNFEntries: false,
        canDeleteNFEntries: false,
        canTransferStock: false,
        canRegisterMovements: true,
        canManageUsers: false,
        canManageBackup: false,
        canWipeSystem: false,
      };

    case 'auditor':
      return {
        canViewDashboard: true,
        canViewStock: true,
        canManageProducts: false,
        canAddNFEntries: false,
        canDeleteNFEntries: false,
        canTransferStock: false,
        canRegisterMovements: false,
        canManageUsers: false,
        canManageBackup: false,
        canWipeSystem: false,
      };

    default:
      return {
        canViewDashboard: true,
        canViewStock: true,
        canManageProducts: false,
        canAddNFEntries: false,
        canDeleteNFEntries: false,
        canTransferStock: false,
        canRegisterMovements: false,
        canManageUsers: false,
        canManageBackup: false,
        canWipeSystem: false,
      };
  }
}

/**
 * Verifica se um papel de usuário possui uma determinada permissão.
 */
export function hasPermission(role?: string | UserRole | null, permissionKey?: keyof UserPermissions): boolean {
  if (!role || !permissionKey) return false;
  const permissions = getRolePermissions(role);
  return Boolean(permissions[permissionKey]);
}
