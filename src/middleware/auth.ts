import { Request, Response, NextFunction } from 'express';
import { adminAuth } from '../lib/firebase-admin.ts';
import { DecodedIdToken } from 'firebase-admin/auth';

export interface AuthRequest extends Request {
  user?: DecodedIdToken;
}

export const requireAuth = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Não autorizado: Token ausente' });
  }

  const token = authHeader.split('Bearer ')[1];
  try {
    const decodedToken = await adminAuth.verifyIdToken(token);
    
    // Bloquear tokens anônimos na camada de autenticação
    if (decodedToken.firebase?.sign_in_provider === 'anonymous') {
      return res.status(403).json({ error: 'Acesso negado: Autenticação anônima não é aceita' });
    }

    req.user = decodedToken;
    next();
  } catch (error) {
    console.error('Erro ao verificar token do Firebase:', error);
    return res.status(401).json({ error: 'Não autorizado: Token inválido' });
  }
};
