import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth.ts';
import { getUserByUid, getOrCreateUser, isSuperAdminEmail } from '../db/users.ts';
import { DEFAULT_DENY_PERMISSIONS, SYSTEM_ADMIN_PERMISSIONS } from '../utils/permissionUtils.ts';
import { UserPermissions } from '../types.ts';

export type PermissionCheck =
  | keyof UserPermissions
  | ((perms: UserPermissions, req: AuthRequest) => boolean);

/**
 * Middleware para autorização baseada em RBAC com dados dinâmicos do PostgreSQL.
 * - Consulta as permissões do cargo do usuário na tabela 'roles' do banco (via roleId).
 * - Se o cargo não existir no banco (dado inconsistente/corrompido), nega todas as permissões por padrão.
 * - Administrador fixo do sistema (isSystemRole: true ou super_admin) possui bypass irrestrito.
 */
export const requirePermission = (permissionCheck: PermissionCheck) => {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user || !req.user.uid) {
        return res.status(401).json({ error: 'Não autorizado: Usuário não autenticado.' });
      }

      const uid = req.user.uid;
      const email = (req.user.email || '').toLowerCase();
      const name = req.user.name || email.split('@')[0] || 'Usuário';

      // 1. Busca perfil e permissões atualizadas no banco
      let dbUser: any = null;
      try {
        dbUser = await getUserByUid(uid);
        if (!dbUser && email) {
          dbUser = await getOrCreateUser(uid, email, name);
        }
      } catch (e) {
        console.warn('⚠️ [requirePermission] Falha ao consultar perfil no banco:', e);
      }

      if (!dbUser) {
        return res.status(403).json({
          error: 'Acesso negado: Perfil de usuário não localizado no sistema.',
        });
      }

      // Anexa o dbUser ao request para uso posterior nos handlers
      (req as any).dbUser = dbUser;

      const isSystemAdmin =
        Boolean(dbUser.isSystemRole) ||
        dbUser.role === 'super_admin' ||
        dbUser.role === 'ADMIN' ||
        dbUser.roleId === 'role_admin' ||
        isSuperAdminEmail(email);

      // Administrador Fixo tem acesso total
      if (isSystemAdmin) {
        return next();
      }

      // 2. Extrai permissões dinâmicas calculadas a partir da tabela 'roles'
      const perms: UserPermissions = dbUser.permissions || { ...DEFAULT_DENY_PERMISSIONS };

      let allowed = false;
      if (typeof permissionCheck === 'function') {
        allowed = permissionCheck(perms, req);
      } else {
        allowed = Boolean(perms[permissionCheck]);
      }

      if (allowed) {
        return next();
      }

      const permName = typeof permissionCheck === 'string' ? permissionCheck : 'Ação restrita';
      return res.status(403).json({
        error: `Acesso negado: Permissão '${permName}' requerida. Cargo atual: ${dbUser.role}`,
      });
    } catch (err: any) {
      console.error('Erro na validação de permissão RBAC:', err);
      return res.status(500).json({ error: 'Erro interno ao validar permissões de acesso.' });
    }
  };
};

/**
 * Middleware de Segurança Estrita: Exige EXCLUSIVAMENTE o Administrador Fixo do Sistema (isSystemRole: true).
 * Trava intencional: NÃO aceita a permissão genérica 'canManageUsers', impedindo escalada de privilégios.
 */
export const requireSystemAdmin = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user || !req.user.uid) {
      return res.status(401).json({ error: 'Não autorizado: Usuário não autenticado.' });
    }

    const uid = req.user.uid;
    const email = (req.user.email || '').toLowerCase();
    const name = req.user.name || email.split('@')[0] || 'Usuário';

    let dbUser = (req as any).dbUser;
    if (!dbUser) {
      dbUser = await getUserByUid(uid);
      if (!dbUser && email) {
        dbUser = await getOrCreateUser(uid, email, name);
      }
    }

    if (!dbUser) {
      return res.status(403).json({
        error: 'Acesso negado: Perfil de usuário não localizado no sistema.',
      });
    }

    (req as any).dbUser = dbUser;

    const isSystemAdmin =
      Boolean(dbUser.isSystemRole) ||
      dbUser.role === 'super_admin' ||
      dbUser.role === 'ADMIN' ||
      dbUser.roleId === 'role_admin' ||
      isSuperAdminEmail(email);

    if (isSystemAdmin) {
      return next();
    }

    return res.status(403).json({
      error: 'Acesso negado: Apenas o Administrador fixo do sistema (ADMIN) pode gerenciar cargos e privilégios estruturais.',
    });
  } catch (err: any) {
    console.error('Erro na validação de System Admin:', err);
    return res.status(500).json({ error: 'Erro interno ao validar privilégio de Administrador do Sistema.' });
  }
};

/**
 * Middleware para operações de usuários comuns que exigem canManageUsers ou perfil Admin.
 */
export const requireAdmin = async (req: AuthRequest, res: Response, next: NextFunction) => {
  return requirePermission('canManageUsers')(req, res, next);
};
