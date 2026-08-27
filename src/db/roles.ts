import { db, pool, isPostgresConfigured, withRetry } from './index.ts';
import { roles, users } from './schema.ts';
import { eq, sql } from 'drizzle-orm';
import { Role, UserPermissions } from '../types.ts';

function checkDbConnection() {
  if (!isPostgresConfigured || !db) {
    throw new Error('Banco de dados PostgreSQL / Supabase não está configurado ou acessível.');
  }
}

// In-memory cache for roles to optimize middleware lookups
const roleCache = new Map<string, { role: Role; expiresAt: number }>();
const CACHE_TTL_MS = 10000; // 10 segundos

export function invalidateRoleCache(roleId?: string) {
  if (roleId) {
    roleCache.delete(roleId);
  } else {
    roleCache.clear();
  }
}

export const INITIAL_ROLES: Role[] = [
  {
    id: 'role_admin',
    name: 'ADMIN',
    isSystemRole: true,
    canViewDashboard: true,
    canViewStock: true,
    canManageProducts: true,
    canAddNFEntries: true,
    canDeleteNFEntries: true,
    canTransferStock: true,
    canRegisterMovements: true,
    canManageUsers: true,
    canManageBackup: true,
    canManageCompany: true,
    canWipeSystem: true,
  },
  {
    id: 'role_gerente_loja',
    name: 'Gerente de Loja',
    isSystemRole: false,
    canViewDashboard: true,
    canViewStock: true,
    canManageProducts: true,
    canAddNFEntries: true,
    canDeleteNFEntries: false,
    canTransferStock: true,
    canRegisterMovements: true,
    canManageUsers: false,
    canManageBackup: true,
    canManageCompany: false,
    canWipeSystem: false,
  },
  {
    id: 'role_operador_deposito',
    name: 'Operador Depósito/Loja',
    isSystemRole: false,
    canViewDashboard: false,
    canViewStock: true,
    canManageProducts: false,
    canAddNFEntries: true,
    canDeleteNFEntries: false,
    canTransferStock: true,
    canRegisterMovements: true,
    canManageUsers: false,
    canManageBackup: false,
    canManageCompany: false,
    canWipeSystem: false,
  },
  {
    id: 'role_caixa',
    name: 'Caixa / Vendas',
    isSystemRole: false,
    canViewDashboard: false,
    canViewStock: true,
    canManageProducts: false,
    canAddNFEntries: false,
    canDeleteNFEntries: false,
    canTransferStock: false,
    canRegisterMovements: true,
    canManageUsers: false,
    canManageBackup: false,
    canManageCompany: false,
    canWipeSystem: false,
  },
  {
    id: 'role_auditor',
    name: 'Auditor',
    isSystemRole: false,
    canViewDashboard: true,
    canViewStock: true,
    canManageProducts: false,
    canAddNFEntries: false,
    canDeleteNFEntries: false,
    canTransferStock: false,
    canRegisterMovements: false,
    canManageUsers: false,
    canManageBackup: false,
    canManageCompany: false,
    canWipeSystem: false,
  },
];

let rolesSchemaInitPromise: Promise<void> | null = null;

/**
 * Garante o seed dos cargos padrão e a migração de roleId para usuários existentes se necessário.
 * A estrutura das tabelas (DDL) é gerenciada exclusivamente pelas migrations formais do Drizzle.
 */
export async function ensureRolesTableAndSeed(): Promise<void> {
  if (!isPostgresConfigured || !pool) return;
  if (rolesSchemaInitPromise) return rolesSchemaInitPromise;

  rolesSchemaInitPromise = (async () => {
    try {
      // 1. Garante a existência do ADMIN fixo e dos cargos iniciais (Seed de dados)
      for (const r of INITIAL_ROLES) {
        await pool.query(
          `
          INSERT INTO roles (
            id, name, is_system_role,
            can_view_dashboard, can_view_stock, can_manage_products,
            can_add_nf_entries, can_delete_nf_entries, can_transfer_stock,
            can_register_movements, can_manage_users, can_manage_backup,
            can_manage_company, can_wipe_system, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW())
          ON CONFLICT (id) DO UPDATE SET
            is_system_role = CASE WHEN roles.id = 'role_admin' THEN TRUE ELSE roles.is_system_role END;
        `,
          [
            r.id,
            r.name,
            r.isSystemRole,
            r.canViewDashboard,
            r.canViewStock,
            r.canManageProducts,
            r.canAddNFEntries,
            r.canDeleteNFEntries ?? false,
            r.canTransferStock,
            r.canRegisterMovements,
            r.canManageUsers,
            r.canManageBackup,
            r.canManageCompany ?? false,
            r.canWipeSystem ?? false,
          ]
        );
      }

      // 2. Migração dos usuários existentes: preenche role_id com base no valor atual de role
      await pool.query(`
        -- Super Admin / Admin -> role_admin
        UPDATE users 
        SET role_id = 'role_admin', role = 'ADMIN'
        WHERE (role_id IS NULL OR role_id = '') 
          AND (LOWER(role) = 'super_admin' OR LOWER(role) = 'admin' OR LOWER(role) = 'administrador' OR LOWER(email) = 'dyones21@gmail.com');

        -- Gerente de Loja -> role_gerente_loja
        UPDATE users 
        SET role_id = 'role_gerente_loja', role = 'Gerente de Loja'
        WHERE (role_id IS NULL OR role_id = '') 
          AND (LOWER(role) LIKE '%gerente%');

        -- Caixa / Vendas -> role_caixa
        UPDATE users 
        SET role_id = 'role_caixa', role = 'Caixa / Vendas'
        WHERE (role_id IS NULL OR role_id = '') 
          AND (LOWER(role) LIKE '%caixa%');

        -- Auditor -> role_auditor
        UPDATE users 
        SET role_id = 'role_auditor', role = 'Auditor'
        WHERE (role_id IS NULL OR role_id = '') 
          AND (LOWER(role) LIKE '%auditor%');

        -- Padrão: Operador Depósito/Loja -> role_operador_deposito
        UPDATE users 
        SET role_id = 'role_operador_deposito', role = 'Operador Depósito/Loja'
        WHERE (role_id IS NULL OR role_id = '');
      `);

      console.log('✅ [RBAC Dinâmico] Seed de cargos verificado e usuários vinculados aos cargos com sucesso.');
    } catch (err: any) {
      console.warn('⚠️ [ensureRolesTableAndSeed] Aviso ao executar seed de roles:', err.message);
    }
  })();

  return rolesSchemaInitPromise;
}

/**
 * Retorna todos os cargos cadastrados no PostgreSQL, incluindo a contagem de usuários vinculados.
 */
export async function getAllRolesFromDb(): Promise<Role[]> {
  checkDbConnection();
  await ensureRolesTableAndSeed();

  return await withRetry(async () => {
    const rawRoles = await db.select().from(roles);

    // Contagem de usuários por role_id e por role name
    const usersList = await db.select({ roleId: users.roleId, role: users.role }).from(users);
    const countMap = new Map<string, number>();

    for (const u of usersList) {
      if (u.roleId) {
        countMap.set(u.roleId, (countMap.get(u.roleId) || 0) + 1);
      }
      if (u.role) {
        countMap.set(u.role, (countMap.get(u.role) || 0) + 1);
      }
    }

    const mapped: Role[] = rawRoles.map((r: any) => {
      const uCount = (countMap.get(r.id) || 0) + (countMap.get(r.name) || 0);
      return {
        id: r.id,
        name: r.name,
        isSystemRole: Boolean(r.isSystemRole),
        canViewDashboard: Boolean(r.canViewDashboard),
        canViewStock: Boolean(r.canViewStock),
        canManageProducts: Boolean(r.canManageProducts),
        canAddNFEntries: Boolean(r.canAddNFEntries),
        canDeleteNFEntries: Boolean(r.canDeleteNFEntries),
        canTransferStock: Boolean(r.canTransferStock),
        canRegisterMovements: Boolean(r.canRegisterMovements),
        canManageUsers: Boolean(r.canManageUsers),
        canManageBackup: Boolean(r.canManageBackup),
        canWipeSystem: Boolean(r.canWipeSystem),
        createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : undefined,
        userCount: uCount,
      };
    });

    // Ordena: ADMIN primeiro, depois por nome
    mapped.sort((a, b) => {
      if (a.isSystemRole && !b.isSystemRole) return -1;
      if (!a.isSystemRole && b.isSystemRole) return 1;
      return a.name.localeCompare(b.name);
    });

    return mapped;
  });
}

/**
 * Busca um cargo por ID no banco.
 */
export async function getRoleByIdFromDb(id: string): Promise<Role | null> {
  checkDbConnection();
  if (!id) return null;

  const cached = roleCache.get(id);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.role;
  }

  return await withRetry(async () => {
    const result = await db.select().from(roles).where(eq(roles.id, id));
    if (!result || result.length === 0) {
      return null;
    }

    const r = result[0];
    const role: Role = {
      id: r.id,
      name: r.name,
      isSystemRole: Boolean(r.isSystemRole),
      canViewDashboard: Boolean(r.canViewDashboard),
      canViewStock: Boolean(r.canViewStock),
      canManageProducts: Boolean(r.canManageProducts),
      canAddNFEntries: Boolean(r.canAddNFEntries),
      canDeleteNFEntries: Boolean(r.canDeleteNFEntries),
      canTransferStock: Boolean(r.canTransferStock),
      canRegisterMovements: Boolean(r.canRegisterMovements),
      canManageUsers: Boolean(r.canManageUsers),
      canManageBackup: Boolean(r.canManageBackup),
      canWipeSystem: Boolean(r.canWipeSystem),
      createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : undefined,
    };

    roleCache.set(id, { role, expiresAt: Date.now() + CACHE_TTL_MS });
    return role;
  });
}

/**
 * Busca um cargo por nome ou apelido legível no banco.
 */
export async function getRoleByNameOrAlias(nameOrAlias: string): Promise<Role | null> {
  checkDbConnection();
  if (!nameOrAlias) return null;

  const trimmed = nameOrAlias.trim();
  const lower = trimmed.toLowerCase();

  return await withRetry(async () => {
    const all = await getAllRolesFromDb();
    const exact = all.find((r) => r.name.toLowerCase() === lower || r.id === trimmed);
    if (exact) return exact;

    // Fallbacks para apelidos legados
    if (lower === 'super_admin' || lower === 'admin') {
      return all.find((r) => r.isSystemRole) || null;
    }
    if (lower.includes('gerente')) {
      return all.find((r) => r.id === 'role_gerente_loja' || r.name.toLowerCase().includes('gerente')) || null;
    }
    if (lower.includes('caixa')) {
      return all.find((r) => r.id === 'role_caixa' || r.name.toLowerCase().includes('caixa')) || null;
    }
    if (lower.includes('auditor')) {
      return all.find((r) => r.id === 'role_auditor' || r.name.toLowerCase().includes('auditor')) || null;
    }
    if (lower.includes('operador')) {
      return all.find((r) => r.id === 'role_operador_deposito' || r.name.toLowerCase().includes('operador')) || null;
    }

    return null;
  });
}

/**
 * Cria um novo cargo personalizado no banco.
 * Apenas cargos não-sistema (isSystemRole: false) podem ser criados.
 */
export async function createRoleInDb(roleData: {
  name: string;
  canViewDashboard?: boolean;
  canViewStock?: boolean;
  canManageProducts?: boolean;
  canAddNFEntries?: boolean;
  canDeleteNFEntries?: boolean;
  canTransferStock?: boolean;
  canRegisterMovements?: boolean;
  canManageUsers?: boolean;
  canManageBackup?: boolean;
  canManageCompany?: boolean;
  canWipeSystem?: boolean;
}): Promise<Role> {
  checkDbConnection();

  const cleanName = (roleData.name || '').trim();
  if (!cleanName) {
    const err: any = new Error('O nome do cargo é obrigatório.');
    err.statusCode = 400;
    throw err;
  }

  return await withRetry(async () => {
    // Verifica duplicidade de nome
    const all = await getAllRolesFromDb();
    const nameExists = all.some((r) => r.name.toLowerCase() === cleanName.toLowerCase());
    if (nameExists) {
      const err: any = new Error(`Já existe um cargo cadastrado com o nome "${cleanName}".`);
      err.statusCode = 400;
      throw err;
    }

    const cleanSlug = cleanName
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');

    const roleId = `role_${Date.now()}_${cleanSlug || Math.floor(Math.random() * 1000)}`;

    const inserted = await db
      .insert(roles)
      .values({
        id: roleId,
        name: cleanName,
        isSystemRole: false, // Sempre false para cargos criados
        canViewDashboard: Boolean(roleData.canViewDashboard),
        canViewStock: Boolean(roleData.canViewStock),
        canManageProducts: Boolean(roleData.canManageProducts),
        canAddNFEntries: Boolean(roleData.canAddNFEntries),
        canDeleteNFEntries: Boolean(roleData.canDeleteNFEntries),
        canTransferStock: Boolean(roleData.canTransferStock),
        canRegisterMovements: Boolean(roleData.canRegisterMovements),
        canManageUsers: Boolean(roleData.canManageUsers),
        canManageBackup: Boolean(roleData.canManageBackup),
        canManageCompany: Boolean(roleData.canManageCompany),
        canWipeSystem: Boolean(roleData.canWipeSystem),
        createdAt: new Date(),
      })
      .returning();

    invalidateRoleCache();

    const created = inserted[0];
    return {
      id: created.id,
      name: created.name,
      isSystemRole: false,
      canViewDashboard: Boolean(created.canViewDashboard),
      canViewStock: Boolean(created.canViewStock),
      canManageProducts: Boolean(created.canManageProducts),
      canAddNFEntries: Boolean(created.canAddNFEntries),
      canDeleteNFEntries: Boolean(created.canDeleteNFEntries),
      canTransferStock: Boolean(created.canTransferStock),
      canRegisterMovements: Boolean(created.canRegisterMovements),
      canManageUsers: Boolean(created.canManageUsers),
      canManageBackup: Boolean(created.canManageBackup),
      canManageCompany: Boolean(created.canManageCompany),
      canWipeSystem: Boolean(created.canWipeSystem),
      createdAt: created.createdAt ? new Date(created.createdAt).toISOString() : new Date().toISOString(),
      userCount: 0,
    };
  });
}

/**
 * Atualiza as permissões ou nome de um cargo existente.
 * TRAVAS DE SEGURANÇA:
 * - O cargo ADMIN fixo (isSystemRole: true) NÃO pode ser editado.
 * - Ninguém pode alterar a flag isSystemRole.
 */
export async function updateRoleInDb(
  id: string,
  updates: Partial<Role> & { isSystemRole?: boolean }
): Promise<Role> {
  checkDbConnection();

  const existing = await getRoleByIdFromDb(id);
  if (!existing) {
    const err: any = new Error(`Cargo com ID "${id}" não encontrado.`);
    err.statusCode = 404;
    throw err;
  }

  // Trava de Segurança 1: ADMIN fixo não pode ser editado
  if (existing.isSystemRole) {
    const err: any = new Error(
      'O cargo ADMIN é fixo do sistema e protegido. Suas permissões e nome não podem ser alterados.'
    );
    err.statusCode = 403;
    throw err;
  }

  // Trava de Segurança 2: Impedir alteração de isSystemRole
  if (updates.isSystemRole !== undefined && updates.isSystemRole !== existing.isSystemRole) {
    const err: any = new Error('Não é permitido alterar o status de cargo fixo do sistema.');
    err.statusCode = 400;
    throw err;
  }

  return await withRetry(async () => {
    let cleanName = existing.name;
    if (updates.name && updates.name.trim()) {
      cleanName = updates.name.trim();
      if (cleanName.toLowerCase() !== existing.name.toLowerCase()) {
        const all = await getAllRolesFromDb();
        const conflict = all.find(
          (r) => r.id !== id && r.name.toLowerCase() === cleanName.toLowerCase()
        );
        if (conflict) {
          const err: any = new Error(`Já existe outro cargo com o nome "${cleanName}".`);
          err.statusCode = 400;
          throw err;
        }
      }
    }

    const payload: any = {
      name: cleanName,
    };

    if (updates.canViewDashboard !== undefined) payload.canViewDashboard = Boolean(updates.canViewDashboard);
    if (updates.canViewStock !== undefined) payload.canViewStock = Boolean(updates.canViewStock);
    if (updates.canManageProducts !== undefined) payload.canManageProducts = Boolean(updates.canManageProducts);
    if (updates.canAddNFEntries !== undefined) payload.canAddNFEntries = Boolean(updates.canAddNFEntries);
    if (updates.canDeleteNFEntries !== undefined) payload.canDeleteNFEntries = Boolean(updates.canDeleteNFEntries);
    if (updates.canTransferStock !== undefined) payload.canTransferStock = Boolean(updates.canTransferStock);
    if (updates.canRegisterMovements !== undefined) payload.canRegisterMovements = Boolean(updates.canRegisterMovements);
    if (updates.canManageUsers !== undefined) payload.canManageUsers = Boolean(updates.canManageUsers);
    if (updates.canManageBackup !== undefined) payload.canManageBackup = Boolean(updates.canManageBackup);
    if (updates.canManageCompany !== undefined) payload.canManageCompany = Boolean(updates.canManageCompany);
    if (updates.canWipeSystem !== undefined) payload.canWipeSystem = Boolean(updates.canWipeSystem);

    const updated = await db
      .update(roles)
      .set(payload)
      .where(eq(roles.id, id))
      .returning();

    // Se o nome do cargo mudou, atualiza a coluna legada 'role' nos usuários vinculados
    if (cleanName !== existing.name) {
      await db.update(users).set({ role: cleanName }).where(eq(users.roleId, id));
    }

    invalidateRoleCache(id);

    const r = updated[0];
    return {
      id: r.id,
      name: r.name,
      isSystemRole: false,
      canViewDashboard: Boolean(r.canViewDashboard),
      canViewStock: Boolean(r.canViewStock),
      canManageProducts: Boolean(r.canManageProducts),
      canAddNFEntries: Boolean(r.canAddNFEntries),
      canDeleteNFEntries: Boolean(r.canDeleteNFEntries),
      canTransferStock: Boolean(r.canTransferStock),
      canRegisterMovements: Boolean(r.canRegisterMovements),
      canManageUsers: Boolean(r.canManageUsers),
      canManageBackup: Boolean(r.canManageBackup),
      canManageCompany: Boolean(r.canManageCompany),
      canWipeSystem: Boolean(r.canWipeSystem),
      createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : undefined,
    };
  });
}

/**
 * Exclui um cargo do banco.
 * TRAVAS DE SEGURANÇA:
 * - O cargo ADMIN fixo (isSystemRole: true) NÃO pode ser excluído.
 * - Cargos que possuem usuários vinculados NÃO podem ser excluídos (exige reatribuição prévia).
 */
export async function deleteRoleFromDb(id: string): Promise<{ success: boolean; message: string }> {
  checkDbConnection();

  const existing = await getRoleByIdFromDb(id);
  if (!existing) {
    const err: any = new Error(`Cargo com ID "${id}" não encontrado.`);
    err.statusCode = 404;
    throw err;
  }

  // Trava 1: ADMIN fixo não pode ser excluído
  if (existing.isSystemRole) {
    const err: any = new Error('O cargo ADMIN é fixo do sistema e não pode ser excluído.');
    err.statusCode = 403;
    throw err;
  }

  return await withRetry(async () => {
    // Trava 2: Verifica se há usuários vinculados ao cargo
    const usersWithRole = await db
      .select({ id: users.id, name: users.name, email: users.email })
      .from(users)
      .where(sql`${users.roleId} = ${id} OR LOWER(${users.role}) = LOWER(${existing.name})`);

    if (usersWithRole && usersWithRole.length > 0) {
      const count = usersWithRole.length;
      const err: any = new Error(
        `Não é possível excluir o cargo "${existing.name}" porque existem ${count} usuário(s) vinculado(s) a ele. Reatribua esses usuários a outro cargo antes de excluir.`
      );
      err.statusCode = 400;
      throw err;
    }

    await db.delete(roles).where(eq(roles.id, id));
    invalidateRoleCache(id);

    return {
      success: true,
      message: `Cargo "${existing.name}" excluído com sucesso.`,
    };
  });
}
