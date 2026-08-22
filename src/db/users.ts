import { db, isPostgresConfigured, withRetry } from './index.ts';
import { users } from './schema.ts';
import { eq, or } from 'drizzle-orm';

let hasLoggedSuperAdminWarning = false;

// Cache em memória para getUserByUid (reduz carga de conexões simultâneas no banco)
const userCache = new Map<string, { user: any; expiresAt: number }>();
const CACHE_TTL_MS = 15000; // 15 segundos

// In-memory fallback store caso o PostgreSQL não esteja provisionado ou esteja inacessível
const inMemoryUsers = new Map<string, any>([
  [
    'u0',
    {
      id: 1,
      uid: 'u0',
      name: 'Super Admin Master',
      email: 'dyones21@gmail.com',
      role: 'super_admin',
      pin: '2101',
      created_at: new Date().toISOString(),
    },
  ],
  [
    'u1',
    {
      id: 2,
      uid: 'u1',
      name: 'Carlos Eduardo (Admin Matriz)',
      email: 'carlos.admin@doceriagroup.com.br',
      role: 'admin',
      pin: '9420',
      created_at: new Date().toISOString(),
    },
  ],
  [
    'u2',
    {
      id: 3,
      uid: 'u2',
      name: 'Mariana Silva (Gerente Friburgo)',
      email: 'mariana.loja@doceriagroup.com.br',
      role: 'gerente_loja',
      pin: '5555',
      created_at: new Date().toISOString(),
    },
  ],
]);

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
    // E-mail padrão de super admin do desenvolvedor/administrador
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
 * Sincroniza o usuário autenticado com o banco PostgreSQL / Armazenamento Seguro.
 * Regras de Segurança:
 * - O papel (role) NUNCA é aceito a partir do cliente.
 * - Se o e-mail estiver na lista SUPER_ADMIN_EMAILS, recebe 'super_admin'.
 * - Se for um novo usuário, recebe o papel padrão fixo 'Operador Depósito/Loja'.
 * - Se o usuário já existir, o papel atual é estritamente PRESERVADO (não sobrescrito).
 */
export async function getOrCreateUser(uid: string, email: string, name?: string) {
  const cleanEmail = email.trim().toLowerCase();
  const cleanName = name?.trim() || cleanEmail.split('@')[0] || 'Usuário Fini';
  const shouldBeSuperAdmin = isSuperAdminEmail(cleanEmail);

  if (isPostgresConfigured && db) {
    try {
      return await withRetry(async () => {
        // 1. Buscar usuário existente por UID ou Email
        const existing = await db
          .select()
          .from(users)
          .where(or(eq(users.uid, uid), eq(users.email, cleanEmail)));

        const existingUser = existing[0];

        if (existingUser) {
          const finalRole = shouldBeSuperAdmin ? 'super_admin' : existingUser.role || 'Operador Depósito/Loja';
          const finalPin = existingUser.pin || (shouldBeSuperAdmin ? '2101' : '1234');

          const updated = await db
            .update(users)
            .set({
              uid,
              email: cleanEmail,
              name: cleanName || existingUser.name,
              role: finalRole,
              pin: finalPin,
            })
            .where(eq(users.id, existingUser.id))
            .returning();

          const result = updated[0];
          userCache.set(uid, { user: result, expiresAt: Date.now() + CACHE_TTL_MS });
          inMemoryUsers.set(uid, result);
          return result;
        }

        // 2. Usuário novo: atribui super_admin se estiver na lista de admin, ou padrão 'Operador Depósito/Loja'
        const initialRole = shouldBeSuperAdmin ? 'super_admin' : 'Operador Depósito/Loja';
        const defaultPin = shouldBeSuperAdmin ? '2101' : '1234';

        const created = await db
          .insert(users)
          .values({
            uid,
            email: cleanEmail,
            name: cleanName,
            role: initialRole,
            pin: defaultPin,
          })
          .returning();

        const result = created[0];
        userCache.set(uid, { user: result, expiresAt: Date.now() + CACHE_TTL_MS });
        inMemoryUsers.set(uid, result);
        return result;
      });
    } catch (dbError) {
      console.warn('⚠️ [Postgres Fallback] Falha ao acessar banco relacional, utilizando persistência em memória:', dbError);
    }
  }

  // Fallback in-memory
  let memoryUser = inMemoryUsers.get(uid);
  if (!memoryUser) {
    for (const u of inMemoryUsers.values()) {
      if (u.email?.toLowerCase() === cleanEmail) {
        memoryUser = u;
        break;
      }
    }
  }

  if (memoryUser) {
    memoryUser.uid = uid;
    memoryUser.email = cleanEmail;
    memoryUser.name = cleanName || memoryUser.name;
    if (shouldBeSuperAdmin) memoryUser.role = 'super_admin';
    inMemoryUsers.set(uid, memoryUser);
    userCache.set(uid, { user: memoryUser, expiresAt: Date.now() + CACHE_TTL_MS });
    return memoryUser;
  }

  const initialRole = shouldBeSuperAdmin ? 'super_admin' : 'Operador Depósito/Loja';
  const newMemoryUser = {
    id: inMemoryUsers.size + 1,
    uid,
    email: cleanEmail,
    name: cleanName,
    role: initialRole,
    pin: '1234',
    created_at: new Date().toISOString(),
  };

  inMemoryUsers.set(uid, newMemoryUser);
  userCache.set(uid, { user: newMemoryUser, expiresAt: Date.now() + CACHE_TTL_MS });
  return newMemoryUser;
}

/**
 * Busca um usuário no Postgres pelo seu UID com cache em memória resiliente.
 */
export async function getUserByUid(uid: string) {
  const cached = userCache.get(uid);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.user;
  }

  if (isPostgresConfigured && db) {
    try {
      return await withRetry(async () => {
        const result = await db.select().from(users).where(eq(users.uid, uid));
        const user = result[0] || null;
        if (user) {
          userCache.set(uid, { user, expiresAt: Date.now() + CACHE_TTL_MS });
          inMemoryUsers.set(uid, user);
        }
        return user;
      });
    } catch (dbError) {
      console.warn('⚠️ [Postgres Fallback] Falha ao buscar usuário no PostgreSQL:', dbError);
    }
  }

  // Fallback in-memory
  const memoryUser = inMemoryUsers.get(uid) || null;
  if (memoryUser) {
    userCache.set(uid, { user: memoryUser, expiresAt: Date.now() + CACHE_TTL_MS });
  }
  return memoryUser;
}

/**
 * Busca todos os usuários cadastrados na tabela users do Postgres / memória.
 */
export async function getAllUsersFromDb() {
  if (isPostgresConfigured && db) {
    try {
      return await withRetry(async () => {
        const dbUsers = await db.select().from(users);
        if (dbUsers && dbUsers.length > 0) {
          dbUsers.forEach((u: any) => inMemoryUsers.set(u.uid || String(u.id), u));
          return dbUsers;
        }
        return Array.from(inMemoryUsers.values());
      });
    } catch (dbError) {
      console.warn('⚠️ [Postgres Fallback] Falha ao listar usuários no PostgreSQL:', dbError);
    }
  }

  return Array.from(inMemoryUsers.values());
}

/**
 * Altera o papel (role) de um usuário alvo.
 * Valida se o requisitante é super_admin no banco antes de aplicar a alteração.
 */
export async function updateUserRoleInDb(requesterUid: string, targetUid: string, newRole: string) {
  // 1. Validar requisitante
  const requester = await getUserByUid(requesterUid);
  if (!requester || requester.role !== 'super_admin') {
    const error: any = new Error('Acesso negado: Apenas super_admin pode alterar cargos de usuários.');
    error.statusCode = 403;
    throw error;
  }

  // 2. Validar cargo válido
  const validRoles = ['super_admin', 'admin', 'gerente_loja', 'operador_deposito', 'caixa', 'auditor', 'Operador Depósito/Loja', 'Gerente Geral'];
  const trimmedRole = newRole.trim();
  if (!trimmedRole) {
    const error: any = new Error('Cargo (role) inválido ou em branco.');
    error.statusCode = 400;
    throw error;
  }

  if (isPostgresConfigured && db) {
    try {
      return await withRetry(async () => {
        const updated = await db
          .update(users)
          .set({
            role: trimmedRole,
          })
          .where(eq(users.uid, targetUid))
          .returning();

        if (updated && updated.length > 0) {
          invalidateUserCache(targetUid);
          inMemoryUsers.set(targetUid, updated[0]);
          return updated[0];
        }
      });
    } catch (dbError) {
      console.warn('⚠️ [Postgres Fallback] Falha ao atualizar role no PostgreSQL:', dbError);
    }
  }

  // Fallback in-memory
  const targetUser = inMemoryUsers.get(targetUid);
  if (!targetUser) {
    const error: any = new Error(`Usuário alvo com UID ${targetUid} não encontrado.`);
    error.statusCode = 404;
    throw error;
  }

  targetUser.role = trimmedRole;
  inMemoryUsers.set(targetUid, targetUser);
  invalidateUserCache(targetUid);
  return targetUser;
}

/**
 * Cadastra ou atualiza um usuário diretamente no PostgreSQL / armazenamento seguro.
 */
export async function saveUserInDb(userData: {
  uid?: string;
  email: string;
  name?: string;
  role?: string;
  pin?: string;
}) {
  const cleanEmail = userData.email.trim().toLowerCase();
  const cleanName = userData.name?.trim() || cleanEmail.split('@')[0] || 'Usuário Fini';
  const cleanUid = userData.uid?.trim() || `usr-${Date.now()}`;
  const cleanRole = userData.role?.trim() || 'Operador Depósito/Loja';
  const cleanPin = userData.pin?.trim() || null;

  if (isPostgresConfigured && db) {
    try {
      return await withRetry(async () => {
        const existing = await db
          .select()
          .from(users)
          .where(or(eq(users.uid, cleanUid), eq(users.email, cleanEmail)));

        if (existing.length > 0) {
          const updated = await db
            .update(users)
            .set({
              name: cleanName,
              role: cleanRole,
              pin: cleanPin,
            })
            .where(eq(users.id, existing[0].id))
            .returning();

          invalidateUserCache(cleanUid);
          inMemoryUsers.set(cleanUid, updated[0]);
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
        inMemoryUsers.set(cleanUid, inserted[0]);
        return inserted[0];
      });
    } catch (dbError) {
      console.warn('⚠️ [Postgres Fallback] Falha ao salvar usuário no PostgreSQL:', dbError);
    }
  }

  // Fallback in-memory
  const existingUser = inMemoryUsers.get(cleanUid);
  if (existingUser) {
    existingUser.name = cleanName;
    existingUser.role = cleanRole;
    existingUser.pin = cleanPin;
    inMemoryUsers.set(cleanUid, existingUser);
    invalidateUserCache(cleanUid);
    return existingUser;
  }

  const newSavedUser = {
    id: inMemoryUsers.size + 1,
    uid: cleanUid,
    email: cleanEmail,
    name: cleanName,
    role: cleanRole,
    pin: cleanPin,
    created_at: new Date().toISOString(),
  };
  inMemoryUsers.set(cleanUid, newSavedUser);
  invalidateUserCache(cleanUid);
  return newSavedUser;
}

/**
 * Exclui um usuário do banco de dados ou armazenamento seguro.
 */
export async function deleteUserFromDb(requesterUid: string, targetIdentifier: string) {
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

  if (isPostgresConfigured && db) {
    try {
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

        if (targets.length > 0) {
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
          inMemoryUsers.delete(targetUser.uid);

          return {
            success: true,
            message: `Usuário "${targetUser.name}" (${targetUser.email}) excluído permanentemente.`,
            deleted: deleted[0],
          };
        }
      });
    } catch (dbError) {
      console.warn('⚠️ [Postgres Fallback] Falha ao excluir usuário no PostgreSQL:', dbError);
    }
  }

  // Fallback in-memory
  let targetUser = inMemoryUsers.get(cleanTarget);
  if (!targetUser) {
    for (const [key, val] of inMemoryUsers.entries()) {
      if (val.email?.toLowerCase() === cleanTarget.toLowerCase() || String(val.id) === cleanTarget) {
        targetUser = val;
        inMemoryUsers.delete(key);
        break;
      }
    }
  } else {
    inMemoryUsers.delete(cleanTarget);
  }

  invalidateUserCache(cleanTarget);
  return {
    success: true,
    message: `Usuário excluído com sucesso.`,
  };
}
