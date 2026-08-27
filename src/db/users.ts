import { db, isPostgresConfigured, withRetry } from './index.ts';
import { users } from './schema.ts';
import { eq, or } from 'drizzle-orm';
import {
  ensureRolesTableAndSeed,
  getAllRolesFromDb,
  getRoleByIdFromDb,
  getRoleByNameOrAlias,
} from './roles.ts';
import { DEFAULT_DENY_PERMISSIONS, SYSTEM_ADMIN_PERMISSIONS } from '../utils/permissionUtils.ts';
import { UserPermissions } from '../types.ts';

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
 * - O papel (role) NUNCA é aceito cegamente a partir do cliente.
 * - Se o e-mail estiver na lista SUPER_ADMIN_EMAILS, recebe 'role_admin' / 'ADMIN' com isSystemRole: true.
 * - Se for um novo usuário, recebe o papel padrão 'Operador Depósito/Loja' (role_operador_deposito).
 * - Se o usuário já existir, preserva o papel e o PIN cadastrado.
 */
export async function getOrCreateUser(uid: string, email: string, name?: string) {
  checkDbConnection();
  await ensureRolesTableAndSeed();

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
      let finalRoleId = existingUser.roleId;
      let finalRoleName = existingUser.role || 'Operador Depósito/Loja';

      if (shouldBeSuperAdmin) {
        finalRoleId = 'role_admin';
        finalRoleName = 'ADMIN';
      } else if (!finalRoleId) {
        const foundRole = await getRoleByNameOrAlias(finalRoleName);
        if (foundRole) {
          finalRoleId = foundRole.id;
          finalRoleName = foundRole.name;
        } else {
          finalRoleId = 'role_operador_deposito';
          finalRoleName = 'Operador Depósito/Loja';
        }
      }

      const updated = await db
        .update(users)
        .set({
          uid,
          email: cleanEmail,
          name: cleanName || existingUser.name,
          role: finalRoleName,
          roleId: finalRoleId,
          pin: existingUser.pin,
        })
        .where(eq(users.id, existingUser.id))
        .returning();

      const result = updated[0];
      invalidateUserCache(uid);
      return result;
    }

    // 2. Usuário novo
    const initialRoleId = shouldBeSuperAdmin ? 'role_admin' : 'role_operador_deposito';
    const initialRoleName = shouldBeSuperAdmin ? 'ADMIN' : 'Operador Depósito/Loja';

    const created = await db
      .insert(users)
      .values({
        uid,
        email: cleanEmail,
        name: cleanName,
        role: initialRoleName,
        roleId: initialRoleId,
        pin: null,
      })
      .returning();

    const result = created[0];
    invalidateUserCache(uid);
    return result;
  });
}

/**
 * Busca um usuário no Postgres pelo seu UID, incluindo os dados de permissões do cargo.
 */
export async function getUserByUid(uid: string) {
  checkDbConnection();
  await ensureRolesTableAndSeed();

  const cached = userCache.get(uid);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.user;
  }

  return await withRetry(async () => {
    const result = await db.select().from(users).where(eq(users.uid, uid));
    const user = result[0] || null;
    if (!user) return null;

    // Resolve o cargo do usuário na tabela roles
    let roleObj = null;
    if (user.roleId) {
      roleObj = await getRoleByIdFromDb(user.roleId);
    }
    if (!roleObj && user.role) {
      roleObj = await getRoleByNameOrAlias(user.role);
    }

    const isSuperAdmin = isSuperAdminEmail(user.email) || roleObj?.isSystemRole === true || user.role === 'super_admin';

    let permissions: UserPermissions;
    if (isSuperAdmin) {
      permissions = { ...SYSTEM_ADMIN_PERMISSIONS };
    } else if (roleObj) {
      permissions = {
        canViewDashboard: Boolean(roleObj.canViewDashboard),
        canViewStock: Boolean(roleObj.canViewStock),
        canManageProducts: Boolean(roleObj.canManageProducts),
        canAddNFEntries: Boolean(roleObj.canAddNFEntries),
        canDeleteNFEntries: Boolean(roleObj.canDeleteNFEntries),
        canTransferStock: Boolean(roleObj.canTransferStock),
        canRegisterMovements: Boolean(roleObj.canRegisterMovements),
        canManageUsers: Boolean(roleObj.canManageUsers),
        canManageBackup: Boolean(roleObj.canManageBackup),
        canWipeSystem: Boolean(roleObj.canWipeSystem),
      };
    } else {
      // Se não encontrado na tabela de roles, NEGA todas as permissões por padrão
      permissions = { ...DEFAULT_DENY_PERMISSIONS };
    }

    const enrichedUser = {
      ...user,
      roleId: roleObj?.id || user.roleId,
      role: roleObj?.name || user.role || 'Sem Cargo Definido',
      isSystemRole: isSuperAdmin,
      permissions,
      roleDetail: roleObj,
    };

    userCache.set(uid, { user: enrichedUser, expiresAt: Date.now() + CACHE_TTL_MS });
    return enrichedUser;
  });
}

/**
 * Busca todos os usuários cadastrados diretamente na tabela users do Postgres com seus cargos e permissões dinâmicas.
 */
export async function getAllUsersFromDb() {
  checkDbConnection();
  await ensureRolesTableAndSeed();

  return await withRetry(async () => {
    const [dbUsers, allRoles] = await Promise.all([
      db.select().from(users),
      getAllRolesFromDb(),
    ]);

    const roleMap = new Map<string, any>();
    for (const r of allRoles) {
      roleMap.set(r.id, r);
      roleMap.set(r.name.toLowerCase(), r);
    }

    return dbUsers.map((u: any) => {
      const isSuperAdmin = isSuperAdminEmail(u.email) || u.role === 'super_admin';
      let matchedRole = u.roleId ? roleMap.get(u.roleId) : null;
      if (!matchedRole && u.role) {
        matchedRole = roleMap.get(u.role.toLowerCase()) || null;
      }

      let perms: UserPermissions;
      if (isSuperAdmin || matchedRole?.isSystemRole) {
        perms = { ...SYSTEM_ADMIN_PERMISSIONS };
      } else if (matchedRole) {
        perms = {
          canViewDashboard: Boolean(matchedRole.canViewDashboard),
          canViewStock: Boolean(matchedRole.canViewStock),
          canManageProducts: Boolean(matchedRole.canManageProducts),
          canAddNFEntries: Boolean(matchedRole.canAddNFEntries),
          canDeleteNFEntries: Boolean(matchedRole.canDeleteNFEntries),
          canTransferStock: Boolean(matchedRole.canTransferStock),
          canRegisterMovements: Boolean(matchedRole.canRegisterMovements),
          canManageUsers: Boolean(matchedRole.canManageUsers),
          canManageBackup: Boolean(matchedRole.canManageBackup),
          canWipeSystem: Boolean(matchedRole.canWipeSystem),
        };
      } else {
        perms = { ...DEFAULT_DENY_PERMISSIONS };
      }

      return {
        ...u,
        roleId: matchedRole?.id || u.roleId,
        role: matchedRole?.name || u.role || 'Sem Cargo',
        isSystemRole: Boolean(isSuperAdmin || matchedRole?.isSystemRole),
        permissions: perms,
      };
    });
  });
}

/**
 * Altera o papel (role) de um usuário alvo.
 */
export async function updateUserRoleInDb(requesterUid: string, targetUid: string, newRoleOrRoleId: string) {
  checkDbConnection();
  await ensureRolesTableAndSeed();

  // 1. Validar requisitante
  const requester = await getUserByUid(requesterUid);
  if (!requester || (!requester.isSystemRole && requester.role !== 'super_admin' && !requester.permissions?.canManageUsers)) {
    const error: any = new Error('Acesso negado: Você não tem permissão para alterar cargos de usuários.');
    error.statusCode = 403;
    throw error;
  }

  // 2. Validar cargo
  const targetRole = await getRoleByNameOrAlias(newRoleOrRoleId);
  if (!targetRole) {
    const error: any = new Error(`Cargo "${newRoleOrRoleId}" não encontrado no sistema.`);
    error.statusCode = 400;
    throw error;
  }

  return await withRetry(async () => {
    const updated = await db
      .update(users)
      .set({
        roleId: targetRole.id,
        role: targetRole.name,
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
  roleId?: string;
  pin?: string;
}) {
  checkDbConnection();
  await ensureRolesTableAndSeed();

  const cleanEmail = userData.email.trim().toLowerCase();
  const cleanName = userData.name?.trim() || cleanEmail.split('@')[0] || 'Usuário Fini';
  const cleanUid = userData.uid?.trim() || `usr-${Date.now()}`;
  const cleanPin = userData.pin !== undefined ? (userData.pin ? userData.pin.trim() : null) : null;
  const shouldBeSuperAdmin = isSuperAdminEmail(cleanEmail);

  // Determina roleId e role name
  let targetRole = null;
  if (shouldBeSuperAdmin) {
    targetRole = await getRoleByIdFromDb('role_admin');
  } else if (userData.roleId) {
    targetRole = await getRoleByIdFromDb(userData.roleId);
  } else if (userData.role) {
    targetRole = await getRoleByNameOrAlias(userData.role);
  }

  if (!targetRole) {
    targetRole = await getRoleByIdFromDb('role_operador_deposito') || {
      id: 'role_operador_deposito',
      name: 'Operador Depósito/Loja',
    } as any;
  }

  return await withRetry(async () => {
    const existing = await db
      .select()
      .from(users)
      .where(or(eq(users.uid, cleanUid), eq(users.email, cleanEmail)));

    if (existing.length > 0) {
      const updatePayload: any = {
        name: cleanName,
        role: targetRole.name,
        roleId: targetRole.id,
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
        role: targetRole.name,
        roleId: targetRole.id,
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
    if (
      (targetUser.role === 'super_admin' || targetUser.role === 'ADMIN' || targetUser.roleId === 'role_admin') &&
      !requester.isSystemRole
    ) {
      const error: any = new Error('Acesso negado: Apenas o Administrador fixo do sistema (ADMIN) pode excluir outro Administrador.');
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
