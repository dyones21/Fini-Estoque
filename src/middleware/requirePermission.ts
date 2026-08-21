import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth.ts';
import { getUserByUid, getOrCreateUser } from '../db/users.ts';
import { getRolePermissions, hasPermission } from '../utils/permissionUtils.ts';
import { UserPermissions } from '../types.ts';

export type PermissionCheck =
  | keyof UserPermissions
  | ((perms: UserPermissions, req: AuthRequest) => boolean);

/**
 * Middleware para autorização baseada em RBAC no Supabase.
 * - Suporta chave direta (ex: 'canManageUsers') ou predicado dinâmico baseado no request.
 * - Busca o usuário no banco de dados do Supabase.
 * - Super admin ('dyones21@gmail.com' ou role 'super_admin' / 'admin') tem bypass total.
 */
export const requirePermission = (permissionCheck: PermissionCheck) => {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user || !req.user.uid) {
        return res.status(401).json({ error: 'Não autorizado: Usuário não identificado' });
      }

      const uid = req.user.uid;
      const email = req.user.email || '';
      const name = req.user.name || email.split('@')[0] || 'Usuário';

      // 1. Busca perfil e cargo no banco Supabase
      let dbUser = await getUserByUid(uid);

      // 2. Se não existir ainda, provisiona automaticamente no Supabase
      if (!dbUser) {
        dbUser = await getOrCreateUser(uid, email, name);
      }

      if (!dbUser) {
        return res.status(403).json({ error: 'Acesso negado: Perfil de usuário não encontrado no Supabase' });
      }

      // Anexa o dbUser ao request para os handlers usarem
      (req as any).dbUser = dbUser;

      // Super Admin ou Admin têm acesso irrestrito
      if (dbUser.role === 'super_admin' || dbUser.role === 'admin') {
        return next();
      }

      // 3. Validação de permissão RBAC
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
      console.error('Erro na validação de permissão RBAC Supabase:', err);
      return res.status(500).json({ error: 'Erro interno ao validar permissões no Supabase' });
    }
  };
};

/**
 * Middleware para exigir perfil de Administrador ou Super Admin
 */
export const requireAdmin = async (req: AuthRequest, res: Response, next: NextFunction) => {
  return requirePermission('canManageUsers')(req, res, next);
};
