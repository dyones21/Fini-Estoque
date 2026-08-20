import { Request, Response, NextFunction } from 'express';
import { adminAuth } from '../lib/firebase-admin.ts';
import crypto from 'node:crypto';

const JWT_SECRET = process.env.SESSION_SECRET || 'fini-erp-cloudsql-secure-secret-key-2026';

export interface DecodedSessionUser {
  uid: string;
  email?: string;
  name?: string;
  role?: string;
  [key: string]: any;
}

export interface AuthRequest extends Request {
  user?: DecodedSessionUser;
}

/**
 * Cria um token de sessão seguro assinado pelo servidor via HMAC-SHA256.
 */
export function signSessionToken(payload: DecodedSessionUser, expiresInHours = 24 * 7): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const exp = Math.floor(Date.now() / 1000) + expiresInHours * 3600;
  const body = Buffer.from(JSON.stringify({ ...payload, exp })).toString('base64url');
  const signature = crypto
    .createHmac('sha256', JWT_SECRET)
    .update(`${header}.${body}`)
    .digest('base64url');
  return `${header}.${body}.${signature}`;
}

/**
 * Valida o token de sessão HMAC-SHA256 gerado pelo servidor.
 */
export function verifySessionToken(token: string): DecodedSessionUser | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [header, body, signature] = parts;
    const expectedSig = crypto
      .createHmac('sha256', JWT_SECRET)
      .update(`${header}.${body}`)
      .digest('base64url');
    if (signature !== expectedSig) return null;

    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

/**
 * Middleware Express para autenticação com suporte dual:
 * 1. Tokens de sessão nativos emitidos pelo ERP (/api/auth/session ou /api/auth/login-pin)
 * 2. Tokens JWT ID emitidos pelo Firebase Authentication
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

  // 1. Tentar validar via Token de Sessão assinado do servidor
  const sessionUser = verifySessionToken(token);
  if (sessionUser) {
    req.user = sessionUser;
    return next();
  }

  // 2. Tentar validar via Firebase Admin ID Token
  try {
    const decodedToken = await adminAuth.verifyIdToken(token);
    
    // Bloquear tokens anônimos na camada de autenticação
    if (decodedToken.firebase?.sign_in_provider === 'anonymous') {
      return res.status(403).json({ error: 'Acesso negado: Autenticação anônima não é aceita' });
    }

    req.user = decodedToken;
    return next();
  } catch (error) {
    return res.status(401).json({ error: 'Não autorizado: Token inválido ou expirado' });
  }
};

