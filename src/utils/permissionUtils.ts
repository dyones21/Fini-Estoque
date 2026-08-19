import { UserPermissions, UserRole } from '../types';

export function getRolePermissions(role: UserRole): UserPermissions {
  switch (role) {
    case 'super_admin':
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
        canAddNFEntries: true,
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
    case 'auditor':
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
}
