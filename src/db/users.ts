import { db, isPostgresConfigured, withRetry } from './index.ts';
import { users } from './schema.ts';
import { eq, or } from 'drizzle-orm';

function checkDbConnection() {
  if (!isPostgresConfigured || !db) {
    throw new Error('Banco de dados PostgreSQL / Supabase não está configurado ou acessível.');
  }
}

// Cache leve de curta duração para getUserByUid (evita queries repetitivas durante o mesmo request)
const userCache = new Map<string, { user: any; expiresAt: number }>();
const CACHE_TTL_MS = 5000; // 5 segundos

export function invalidateUserCache(uid?: string) {
  if (uid) {
    userCache.delete(uid);
  } else {
    userCache.clear();
  }
}

/**
 * Retorna a lista de e-mails configurados como super administradores do sistema.
 */
export function getSuperAdminEmails(): string[] {
  const envEmails = process.env.SUPER_ADMIN_EMAILS;
  if (!envEmails || !envEmails.trim()) {
    return ['dyones21@gmail.com'];
  }
  const parsed = envEmails
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  if (!parsed.includes('dyones21@gmail.com')) {
    parsed.push('dyones21@gmail.com');
  }
  return parsed;
}

/**
 * Verifica se um determinado e-mail pertence à lista de super administradores.
 */
export function isSuperAdminEmail(email: string): boolean {
  if (!email) return false;
  const adminEmails = getSuperAdminEmails();
  return adminEmails.includes(email.trim().toLowerCase());
}

/**
 * Sincroniza o usuário autenticado diretamente com o banco PostgreSQL.
 * Regras de Segurança:
 * - O papel (role) NUNCA é aceito a partir do cliente.
 * - Se o e-mail estiver na lista SUPER_ADMIN_EMAILS, recebe 'super_admin'.
 * - Se for um novo usuário, recebe o papel padrão 'Operador Depósito/Loja' e pin null.
 * - Se o usuário já existir, preserva o papel e o PIN cadastrado.
 */
export async function getOrCreateUser(uid: string, email: string, name?: string) {
  checkDbConnection();

  const cleanEmail = email.trim().toLowerCase();
  const cleanName = name?.trim() || cleanEmail.split('@')[0] || 'Usuário Fini';
  const shouldBeSuperAdmin = isSuperAdminEmail(cleanEmail);

  return await withRetry(async () => {
    // 1. Buscar usuário existente por UID ou Email
    const existing = await db
      .select()
      .from(users)
      .where(or(eq(users.uid, uid), eq(users.email, cleanEmail)));

    const existingUser = existing[0];

    if (existingUser) {
      const finalRole = shouldBeSuperAdmin ? 'super_admin' : existingUser.role || 'Operador Depósito/Loja';

      const updated = await db
        .update(users)
        .set({
          uid,
          email: cleanEmail,
          name: cleanName || existingUser.name,
          role: finalRole,
          pin: existingUser.pin,
        })
        .where(eq(users.id, existingUser.id))
        .returning();

      const result = updated[0];
      userCache.set(uid, { user: result, expiresAt: Date.now() + CACHE_TTL_MS });
      return result;
    }

    // 2. Usuário novo
    const initialRole = shouldBeSuperAdmin ? 'super_admin' : 'Operador Depósito/Loja';

    const created = await db
      .insert(users)
      .values({
        uid,
        email: cleanEmail,
        name: cleanName,
        role: initialRole,
        pin: null,
      })
      .returning();

    const result = created[0];
    userCache.set(uid, { user: result, expiresAt: Date.now() + CACHE_TTL_MS });
    return result;
  });
}

/**
 * Busca um usuário no Postgres pelo seu UID.
 */
export async function getUserByUid(uid: string) {
  checkDbConnection();

  const cached = userCache.get(uid);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.user;
  }

  return await withRetry(async () => {
    const result = await db.select().from(users).where(eq(users.uid, uid));
    const user = result[0] || null;
    if (user) {
      userCache.set(uid, { user, expiresAt: Date.now() + CACHE_TTL_MS });
    }
    return user;
  });
}

/**
 * Busca todos os usuários cadastrados diretamente na tabela users do Postgres.
 */
export async function getAllUsersFromDb() {
  checkDbConnection();

  return await withRetry(async () => {
    const dbUsers = await db.select().from(users);
    return dbUsers || [];
  });
}

/**
 * Altera o papel (role) de um usuário alvo.
 * Valida se o requisitante é super_admin no banco antes de aplicar a alteração.
 */
export async function updateUserRoleInDb(requesterUid: string, targetUid: string, newRole: string) {
  checkDbConnection();

  // 1. Validar requisitante
  const requester = await getUserByUid(requesterUid);
  if (!requester || requester.role !== 'super_admin') {
    const error: any = new Error('Acesso negado: Apenas super_admin pode alterar cargos de usuários.');
    error.statusCode = 403;
    throw error;
  }

  // 2. Validar cargo
  const trimmedRole = newRole.trim();
  if (!trimmedRole) {
    const error: any = new Error('Cargo (role) inválido ou em branco.');
    error.statusCode = 400;
    throw error;
  }

  return await withRetry(async () => {
    const updated = await db
      .update(users)
      .set({
        role: trimmedRole,
      })
      .where(eq(users.uid, targetUid))
      .returning();

    if (!updated || updated.length === 0) {
      const error: any = new Error(`Usuário alvo com UID ${targetUid} não encontrado no banco.`);
      error.statusCode = 404;
      throw error;
    }

    invalidateUserCache(targetUid);
    return updated[0];
  });
}

/**
 * Cadastra ou atualiza um usuário diretamente no PostgreSQL.
 */
export async function saveUserInDb(userData: {
  uid?: string;
  email: string;
  name?: string;
  role?: string;
  pin?: string;
}) {
  checkDbConnection();

  const cleanEmail = userData.email.trim().toLowerCase();
  const cleanName = userData.name?.trim() || cleanEmail.split('@')[0] || 'Usuário Fini';
  const cleanUid = userData.uid?.trim() || `usr-${Date.now()}`;
  const cleanRole = userData.role?.trim() || 'Operador Depósito/Loja';
  const cleanPin = userData.pin !== undefined ? (userData.pin ? userData.pin.trim() : null) : null;

  return await withRetry(async () => {
    const existing = await db
      .select()
      .from(users)
      .where(or(eq(users.uid, cleanUid), eq(users.email, cleanEmail)));

    if (existing.length > 0) {
      const updatePayload: any = {
        name: cleanName,
        role: cleanRole,
      };
      if (userData.pin !== undefined) {
        updatePayload.pin = cleanPin;
      }

      const updated = await db
        .update(users)
        .set(updatePayload)
        .where(eq(users.id, existing[0].id))
        .returning();

      invalidateUserCache(cleanUid);
      return updated[0];
    }

    const inserted = await db
      .insert(users)
      .values({
        uid: cleanUid,
        email: cleanEmail,
        name: cleanName,
        role: cleanRole,
        pin: cleanPin,
      })
      .returning();

    invalidateUserCache(cleanUid);
    return inserted[0];
  });
}

/**
 * Exclui um usuário do banco de dados PostgreSQL.
 */
export async function deleteUserFromDb(requesterUid: string, targetIdentifier: string) {
  checkDbConnection();

  const cleanTarget = targetIdentifier.trim();
  if (!cleanTarget) {
    const error: any = new Error('Identificador de usuário inválido.');
    error.statusCode = 400;
    throw error;
  }

  // 1. Buscar usuário requisitante
  const requester = await getUserByUid(requesterUid);
  if (!requester) {
    const error: any = new Error('Usuário autenticado não encontrado.');
    error.statusCode = 401;
    throw error;
  }

  // 2. Não permitir excluir a si mesmo
  if (
    requester.uid === cleanTarget ||
    String(requester.id) === cleanTarget ||
    requester.email.toLowerCase() === cleanTarget.toLowerCase()
  ) {
    const error: any = new Error('Você não pode excluir a sua própria conta logada.');
    error.statusCode = 400;
    throw error;
  }

  return await withRetry(async () => {
    const numericId = parseInt(cleanTarget, 10);
    const isNumeric = !isNaN(numericId) && String(numericId) === cleanTarget;

    const targetConditions = [
      eq(users.uid, cleanTarget),
      eq(users.email, cleanTarget.toLowerCase()),
    ];
    if (isNumeric) {
      targetConditions.push(eq(users.id, numericId));
    }

    const targets = await db
      .select()
      .from(users)
      .where(or(...targetConditions));

    if (!targets || targets.length === 0) {
      const error: any = new Error('Usuário não encontrado no banco.');
      error.statusCode = 404;
      throw error;
    }

    const targetUser = targets[0];
    if (targetUser.role === 'super_admin' && requester.role !== 'super_admin') {
      const error: any = new Error('Acesso negado: Apenas um Super Administrador pode excluir outro Super Administrador.');
      error.statusCode = 403;
      throw error;
    }

    const deleted = await db
      .delete(users)
      .where(eq(users.id, targetUser.id))
      .returning();

    invalidateUserCache(targetUser.uid);

    return {
      success: true,
      message: `Usuário "${targetUser.name}" (${targetUser.email}) excluído permanentemente.`,
      deleted: deleted[0],
    };
  });
}
