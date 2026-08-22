import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth.ts';
import { getUserByUid, getOrCreateUser, isSuperAdminEmail } from '../db/users.ts';
import { getRolePermissions } from '../utils/permissionUtils.ts';
import { UserPermissions } from '../types.ts';

export type PermissionCheck =
  | keyof UserPermissions
  | ((perms: UserPermissions, req: AuthRequest) => boolean);

/**
 * Middleware para autorização baseada em RBAC.
 * - Suporta chave direta (ex: 'canManageUsers') ou predicado dinâmico baseado no request.
 * - Super admin ('dyones21@gmail.com' ou role 'super_admin' / 'admin') tem bypass total.
 */
export const requirePermission = (permissionCheck: PermissionCheck) => {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user || !req.user.uid) {
        return res.status(401).json({ error: 'Não autorizado: Usuário não identificado' });
      }

      const uid = req.user.uid;
      const email = (req.user.email || '').toLowerCase();
      const name = req.user.name || email.split('@')[0] || 'Usuário';

      // 1. Busca perfil e cargo no banco / armazenamento seguro
      let dbUser: any = null;
      try {
        dbUser = await getUserByUid(uid);
        if (!dbUser && email) {
          dbUser = await getOrCreateUser(uid, email, name);
        }
      } catch (e) {
        console.warn('⚠️ [requirePermission] Fallback para payload do token:', e);
      }

      if (!dbUser) {
        dbUser = {
          uid,
          email,
          name,
          role: req.user.role || (isSuperAdminEmail(email) ? 'super_admin' : 'Operador Depósito/Loja'),
        };
      }

      // Anexa o dbUser ao request para os handlers usarem
      (req as any).dbUser = dbUser;

      // Super Admin ou Admin têm acesso irrestrito
      if (
        dbUser.role === 'super_admin' ||
        dbUser.role === 'admin' ||
        isSuperAdminEmail(email)
      ) {
        return next();
      }

      // 2. Validação de permissão RBAC
      const perms = getRolePermissions(dbUser.role);
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
      return res.status(500).json({ error: 'Erro interno ao validar permissões de acesso' });
    }
  };
};

/**
 * Middleware para exigir perfil de Administrador ou Super Admin
 */
export const requireAdmin = async (req: AuthRequest, res: Response, next: NextFunction) => {
  return requirePermission('canManageUsers')(req, res, next);
};
