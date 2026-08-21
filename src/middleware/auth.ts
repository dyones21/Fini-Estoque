import { Request, Response, NextFunction } from 'express';
import { createClient } from '@supabase/supabase-js';
import { getUserByUid, getOrCreateUser } from '../db/users.ts';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://erewcnfavhtexmitrtce.supabase.co';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVyZXdjbmZhdmh0ZXhtaXRydGNlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODczMjgzODksImV4cCI6MjEwMjkwNDM4OX0.bG4GNHxbwiTHA85U9F9YA7Y8dPLAgsI5TA7VwbjlFBc';

const supabaseServer = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

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
 * Middleware Express para autenticação centralizada exclusivamente no Supabase:
 * 1. Supabase Auth (JWT Token)
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

  // 1. Validar Token JWT com Supabase Auth
  if (token.startsWith('eyJ') || token.includes('.')) {
    try {
      const { data: { user }, error: sbError } = await supabaseServer.auth.getUser(token);
      if (user && !sbError) {
        req.user = {
          uid: user.id,
          email: user.email || '',
          name: user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split('@')[0] || 'Usuário',
          ...user,
        };
        return next();
      }
    } catch (err) {
      console.warn('Erro ao validar token JWT no Supabase:', err);
    }
  }

  // 2. Validação de Sessão Local / PIN do ERP no banco de dados Supabase
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
      console.warn('Erro ao processar sessão local de usuário no Supabase:', err);
    }
  }

  return res.status(401).json({ error: 'Não autorizado: Token inválido ou expirado' });
};
