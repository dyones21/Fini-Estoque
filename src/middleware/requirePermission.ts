import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth.ts';
import { getUserByUid, getOrCreateUser } from '../db/users.ts';
import { getRolePermissions } from '../utils/permissionUtils.ts';
import { UserPermissions } from '../types.ts';

export type PermissionCheck =
  | keyof UserPermissions
  | ((permissions: UserPermissions, req: AuthRequest) => boolean);

/**
 * Middleware Express de Autorização RBAC baseado em permissões granulares.
 * 
 * Regras:
 * - Deve rodar estritamente após o middleware `requireAuth`.
 * - Busca o usuário no PostgreSQL pelo UID do token autenticado.
 * - Se o usuário for recém-autenticado no Firebase Auth e não estiver no Postgres, auto-provisiona.
 * - Calcula a matriz de permissões com `getRolePermissions(user.role)`.
 * - Retorna status HTTP 403 (Forbidden) se a permissão exigida for false.
 */
export function requirePermission(permissionCheck: PermissionCheck) {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const uid = req.user?.uid;
      if (!uid) {
        return res.status(401).json({ error: 'Não autorizado: Token ou UID ausente' });
      }

      // Buscar usuário persistido no Postgres
      let dbUser = await getUserByUid(uid);
      if (!dbUser) {
        try {
          dbUser = await getOrCreateUser(
            uid,
            req.user?.email || '',
            req.user?.name || (req.user?.email ? req.user.email.split('@')[0] : 'Usuário Fini')
          );
        } catch (e) {
          console.error('Erro ao auto-registrar usuário no requirePermission:', e);
        }
      }

      if (!dbUser) {
        return res.status(403).json({
          error: 'Acesso negado: Usuário não registrado no banco de dados',
        });
      }

      // Calcular permissões baseadas no papel (role) do banco
      const permissions = getRolePermissions(dbUser.role);

      let isAllowed = false;
      if (typeof permissionCheck === 'string') {
        isAllowed = Boolean(permissions[permissionCheck]);
      } else if (typeof permissionCheck === 'function') {
        isAllowed = Boolean(permissionCheck(permissions, req));
      }

      if (!isAllowed) {
        const permName = typeof permissionCheck === 'string' ? permissionCheck : 'Ação restrita';
        console.warn(`[RBAC 403] UID=${uid} (Role=${dbUser.role}) tentou acessar recurso sem a permissão '${permName}'`);
        return res.status(403).json({
          error: 'Você não tem permissão para esta ação.',
          requiredPermission: typeof permissionCheck === 'string' ? permissionCheck : undefined,
          userRole: dbUser.role,
        });
      }

      // Anexa os dados do usuário do banco à requisição para uso downstream
      (req as any).dbUser = dbUser;
      (req as any).userPermissions = permissions;

      next();
    } catch (error: any) {
      console.error('Erro na validação do middleware requirePermission:', error);
      return res.status(500).json({ error: 'Erro interno ao validar permissões do usuário' });
    }
  };
}
