import { db, withRetry } from './index.ts';
import { users } from './schema.ts';
import { eq, or } from 'drizzle-orm';

let hasLoggedSuperAdminWarning = false;

// Cache em memória para getUserByUid (reduz carga de conexões simultâneas no banco)
const userCache = new Map<string, { user: any; expiresAt: number }>();
const CACHE_TTL_MS = 15000; // 15 segundos

export function invalidateUserCache(uid?: string) {
  if (uid) {
    userCache.delete(uid);
  } else {
    userCache.clear();
  }
}

/**
 * Retorna a lista de e-mails configurados como super administradores do sistema.
 * Se SUPER_ADMIN_EMAILS não estiver configurada, retorna lista vazia e loga um aviso no console.
 */
export function getSuperAdminEmails(): string[] {
  const envEmails = process.env.SUPER_ADMIN_EMAILS;
  if (!envEmails || !envEmails.trim()) {
    if (!hasLoggedSuperAdminWarning) {
      console.warn('⚠️ [Segurança] Nenhuma variável SUPER_ADMIN_EMAILS configurada no ambiente. Nenhum usuário receberá o papel super_admin automaticamente.');
      hasLoggedSuperAdminWarning = true;
    }
    return [];
  }
  return envEmails
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
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
 * Sincroniza o usuário autenticado com o banco PostgreSQL.
 * Regras de Segurança:
 * - O papel (role) NUNCA é aceito a partir do cliente.
 * - Se o e-mail estiver na lista SUPER_ADMIN_EMAILS, recebe 'super_admin'.
 * - Se for um novo usuário, recebe o papel padrão fixo 'Operador Depósito/Loja'.
 * - Se o usuário já existir no banco, o papel atual é estritamente PRESERVADO (não sobrescrito).
 */
export async function getOrCreateUser(uid: string, email: string, name?: string) {
  return withRetry(async () => {
    try {
      const cleanEmail = email.trim().toLowerCase();
      const cleanName = name?.trim() || cleanEmail.split('@')[0] || 'Usuário Fini';

      // 1. Buscar usuário existente por UID ou Email
      const existing = await db
        .select()
        .from(users)
        .where(or(eq(users.uid, uid), eq(users.email, cleanEmail)));

      const existingUser = existing[0];

      if (existingUser) {
        const shouldBeSuperAdmin = isSuperAdminEmail(cleanEmail);
        const finalRole = shouldBeSuperAdmin ? 'super_admin' : existingUser.role || 'Operador Depósito/Loja';

        const updated = await db
          .update(users)
          .set({
            uid,
            email: cleanEmail,
            name: cleanName || existingUser.name,
            role: finalRole,
          })
          .where(eq(users.id, existingUser.id))
          .returning();

        const result = updated[0];
        userCache.set(uid, { user: result, expiresAt: Date.now() + CACHE_TTL_MS });
        return result;
      }

      // 2. Usuário novo: atribui super_admin se estiver na lista de admin, ou padrão 'Operador Depósito/Loja'
      const initialRole = isSuperAdminEmail(cleanEmail) ? 'super_admin' : 'Operador Depósito/Loja';

      const created = await db
        .insert(users)
        .values({
          uid,
          email: cleanEmail,
          name: cleanName,
          role: initialRole,
        })
        .returning();

      const result = created[0];
      userCache.set(uid, { user: result, expiresAt: Date.now() + CACHE_TTL_MS });
      return result;
    } catch (error) {
      console.error('Error in getOrCreateUser:', error);
      throw new Error('Falha ao sincronizar usuário no Banco de Dados.', { cause: error });
    }
  });
}

/**
 * Busca um usuário no Postgres pelo seu UID com cache em memória resiliente.
 */
export async function getUserByUid(uid: string) {
  const cached = userCache.get(uid);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.user;
  }

  return withRetry(async () => {
    try {
      const result = await db.select().from(users).where(eq(users.uid, uid));
      const user = result[0] || null;
      if (user) {
        userCache.set(uid, { user, expiresAt: Date.now() + CACHE_TTL_MS });
      }
      return user;
    } catch (error) {
      console.error('Error in getUserByUid:', error);
      throw error;
    }
  });
}

/**
 * Busca todos os usuários cadastrados na tabela users do Postgres.
 */
export async function getAllUsersFromDb() {
  return withRetry(async () => {
    try {
      return await db.select().from(users);
    } catch (error) {
      console.error('Error in getAllUsersFromDb:', error);
      throw error;
    }
  });
}

/**
 * Altera o papel (role) de um usuário alvo.
 * Valida se o requisitante é super_admin no banco antes de aplicar a alteração.
 */
export async function updateUserRoleInDb(requesterUid: string, targetUid: string, newRole: string) {
  return withRetry(async () => {
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

    // 3. Atualizar usuário alvo
    const updated = await db
      .update(users)
      .set({
        role: trimmedRole,
      })
      .where(eq(users.uid, targetUid))
      .returning();

    if (!updated || updated.length === 0) {
      const error: any = new Error(`Usuário alvo com UID ${targetUid} não encontrado no banco de dados.`);
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
  return withRetry(async () => {
    const cleanEmail = userData.email.trim().toLowerCase();
    const cleanName = userData.name?.trim() || cleanEmail.split('@')[0] || 'Usuário Fini';
    const cleanUid = userData.uid?.trim() || `usr-${Date.now()}`;
    const cleanRole = userData.role?.trim() || 'Operador Depósito/Loja';
    const cleanPin = userData.pin?.trim() || null;

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
 * Exclui um usuário do PostgreSQL de forma segura e permanente.
 */
export async function deleteUserFromDb(requesterUid: string, targetIdentifier: string) {
  return withRetry(async () => {
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

    // 3. Buscar usuário alvo
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

    if (targets.length === 0) {
      return { success: true, message: 'Usuário não localizado no banco ou já removido.' };
    }

    const targetUser = targets[0];

    // 4. Se o usuário alvo for super_admin, apenas outro super_admin pode excluir
    if (targetUser.role === 'super_admin' && requester.role !== 'super_admin') {
      const error: any = new Error('Acesso negado: Apenas um Super Administrador pode excluir outro Super Administrador.');
      error.statusCode = 403;
      throw error;
    }

    // 5. Excluir do banco PostgreSQL
    const deleted = await db
      .delete(users)
      .where(eq(users.id, targetUser.id))
      .returning();

    invalidateUserCache(targetUser.uid);

    return {
      success: true,
      message: `Usuário "${targetUser.name}" (${targetUser.email}) excluído permanentemente do banco de dados.`,
      deleted: deleted[0],
    };
  });
}
