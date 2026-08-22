import { Request, Response, NextFunction } from 'express';
import { adminAuth } from '../lib/firebase-admin.ts';
import { getUserByUid, getOrCreateUser, isSuperAdminEmail } from '../db/users.ts';

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
 * Middleware Express para autenticação estrita:
 * Valida a assinatura criptográfica do ID Token via Firebase Admin SDK.
 * Rejeita qualquer token não assinado, inválido, forjado ou expirado.
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

  const token = authHeader.substring(7).trim();
  if (!token || token === 'null' || token === 'undefined' || token.split('.').length !== 3) {
    return res.status(401).json({ error: 'Não autorizado: Formato de token inválido' });
  }

  let decodedToken: any;
  try {
    // Validação estrita e criptográfica da assinatura do token no Firebase
    decodedToken = await adminAuth.verifyIdToken(token);
  } catch (verifyErr: any) {
    console.warn('[Segurança] Falha na validação de assinatura do token Firebase:', verifyErr?.message || verifyErr);
    return res.status(401).json({ error: 'Não autorizado: Token inválido ou expirado' });
  }

  if (!decodedToken || !decodedToken.uid) {
    return res.status(401).json({ error: 'Não autorizado: Token inválido' });
  }

  const uid = decodedToken.uid;
  const email = (decodedToken.email || '').trim().toLowerCase();
  const name = decodedToken.name || (email ? email.split('@')[0] : 'Usuário Fini');

  // Carrega ou registra o usuário sincronizado no PostgreSQL / Repositório seguro
  let dbUser = null;
  try {
    dbUser = await getUserByUid(uid);
    if (!dbUser && email) {
      dbUser = await getOrCreateUser(uid, email, name);
    }
  } catch (dbErr: any) {
    console.warn('⚠️ [Auth User Profile Warning] Falha ao sincronizar com banco:', dbErr?.message || dbErr);
  }

  const isSuperAdmin = isSuperAdminEmail(email);
  const assignedRole = dbUser?.role || (isSuperAdmin ? 'super_admin' : 'Operador Depósito/Loja');

  req.user = {
    uid,
    email: dbUser?.email || email,
    name: dbUser?.name || name,
    role: assignedRole,
    ...decodedToken,
  };

  return next();
};
