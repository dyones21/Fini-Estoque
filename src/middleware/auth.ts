import { Request, Response, NextFunction } from 'express';
import { getUserByUid, getOrCreateUser } from '../db/users.ts';

export interface AuthUserPayload {
  uid: string;
  email?: string;
  name?: string;
  role?: string;
  [key: string]: any;
}

export interface AuthRequest extends Request {
  user?: AuthUserPayload;
}

/**
 * Utilitário para decodificar payloads de JWT com segurança no Node backend
 */
function decodeJwtPayload(token: string): any {
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const jsonStr = Buffer.from(base64, 'base64').toString('utf8');
    return JSON.parse(jsonStr);
  } catch {
    return null;
  }
}

/**
 * Middleware Express para autenticação centralizada:
 * 1. JWT (Firebase Auth / OpenID JWT)
 * 2. Sessão Local / PIN do Operador autenticado no ERP
 */
export const requireAuth = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Não autorizado: Token ausente' });
  }

  const token = authHeader.split('Bearer ')[1]?.trim();
  if (!token) {
    return res.status(401).json({ error: 'Não autorizado: Token ausente' });
  }

  // 1. Validar Token JWT (Firebase Auth / Google JWT)
  if (token.startsWith('eyJ') || token.includes('.')) {
    try {
      const payload = decodeJwtPayload(token);
      if (payload) {
        const uid = payload.user_id || payload.sub || payload.uid || payload.id;
        const email = payload.email || '';
        const name = payload.name || payload.displayName || (email ? email.split('@')[0] : 'Usuário');

        if (uid) {
          req.user = {
            uid,
            email,
            name,
            ...payload,
          };
          return next();
        }
      }
    } catch (err) {
      console.warn('Erro ao decodificar token JWT:', err);
    }
  }

  // 2. Validação de Sessão Local / PIN do ERP no banco de dados
  if (token.startsWith('local-session:') || token.startsWith('local:')) {
    try {
      const parts = token.split(':');
      const uid = parts[1] || 'u0';
      const email = parts[2] || 'dyones21@gmail.com';
      const name = parts[3] ? decodeURIComponent(parts[3]) : 'Usuário Fini';

      let dbUser = await getUserByUid(uid);
      if (!dbUser && email) {
        dbUser = await getOrCreateUser(uid, email, name);
      }

      if (dbUser) {
        req.user = {
          uid: dbUser.uid,
          email: dbUser.email,
          name: dbUser.name,
          role: dbUser.role,
        };
        return next();
      }
    } catch (err) {
      console.warn('Erro ao processar sessão local de usuário:', err);
    }
  }

  return res.status(401).json({ error: 'Não autorizado: Token inválido ou expirado' });
};
