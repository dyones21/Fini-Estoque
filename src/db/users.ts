import { db } from './index.ts';
import { users } from './schema.ts';
import { eq, or } from 'drizzle-orm';

/**
 * Retorna a lista de e-mails configurados como super administradores do sistema.
 */
export function getSuperAdminEmails(): string[] {
  const envEmails = process.env.SUPER_ADMIN_EMAILS || 'dyones21@gmail.com';
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
      // Determinar papel: Se estiver na lista de super_admins do servidor, assegura super_admin.
      // Caso contrário, mantém estritamente o papel já cadastrado no banco.
      const shouldBeSuperAdmin = isSuperAdminEmail(cleanEmail);
      const finalRole = shouldBeSuperAdmin ? 'super_admin' : existingUser.role || 'Operador Depósito/Loja';

      const updated = await db
        .update(users)
        .set({
          uid, // garante consistência do UID caso tenha sido encontrado por e-mail
          email: cleanEmail,
          name: cleanName || existingUser.name,
          role: finalRole,
        })
        .where(eq(users.id, existingUser.id))
        .returning();

      return updated[0];
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

    return created[0];
  } catch (error) {
    console.error('Error in getOrCreateUser:', error);
    throw new Error('Falha ao sincronizar usuário no Banco de Dados.', { cause: error });
  }
}

/**
 * Busca um usuário no Postgres pelo seu UID do Firebase Auth.
 */
export async function getUserByUid(uid: string) {
  try {
    const result = await db.select().from(users).where(eq(users.uid, uid));
    return result[0] || null;
  } catch (error) {
    console.error('Error in getUserByUid:', error);
    throw error;
  }
}

/**
 * Busca todos os usuários cadastrados na tabela users do Postgres.
 */
export async function getAllUsersFromDb() {
  try {
    return await db.select().from(users);
  } catch (error) {
    console.error('Error in getAllUsersFromDb:', error);
    throw error;
  }
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

  return updated[0];
}
