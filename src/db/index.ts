import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import type { PoolConfig } from 'pg';
import * as schema from './schema.ts';

const { Pool } = pg;

declare global {
  var _postgresPool: pg.Pool | undefined;
}

/**
 * Monta e valida a string de conexão real do PostgreSQL / Supabase
 */
export function getValidPostgresConnectionString(): string {
  // Lista de variáveis candidatas onde a URL de conexão pode estar configurada
  const candidates = [
    process.env.SQL_SSL,
    process.env.POSTGRES_URL,
    process.env.SUPABASE_DATABASE_URL,
    process.env.DATABASE_URL,
    process.env.POSTGRES_PRISMA_URL,
  ];

  for (const raw of candidates) {
    if (!raw) continue;
    let uri = raw.trim();

    // Se estiver em formato postgresql:// ou postgres://
    if (uri.startsWith('postgresql://') || uri.startsWith('postgres://')) {
      if (
        !uri.includes('seu_projeto') &&
        !uri.includes('sua_senha_aqui') &&
        !uri.includes('aws-0-regiao') &&
        !uri.includes('localhost') &&
        !uri.includes('127.0.0.1')
      ) {
        // Trata caracteres especiais na senha se necessário (ex: barra / ou arroba @)
        try {
          const parsed = new URL(uri);
          if (parsed.password && (parsed.password.includes('/') || parsed.password.includes('@'))) {
            parsed.password = encodeURIComponent(decodeURIComponent(parsed.password));
            uri = parsed.toString();
          }
        } catch {
          // Se falhar o parse URL padrão, usa regex para escapar
          uri = uri.replace(/(postgresql:\/\/[^:]+:)([^@]+)(@.+)/, (_match, p1, p2, p3) => {
            return `${p1}${encodeURIComponent(decodeURIComponent(p2))}${p3}`;
          });
        }
        return uri;
      }
    }
  }

  // Fallback para variáveis individuais SQL_*
  if (
    process.env.SQL_HOST &&
    process.env.SQL_USER &&
    !process.env.SQL_HOST.startsWith('/app/cloudsql') &&
    !process.env.SQL_HOST.includes('localhost') &&
    !process.env.SQL_HOST.includes('127.0.0.1') &&
    !process.env.SQL_USER.includes('seu_projeto')
  ) {
    const user = encodeURIComponent(process.env.SQL_USER);
    const pass = process.env.SQL_PASSWORD ? encodeURIComponent(process.env.SQL_PASSWORD) : '';
    const host = process.env.SQL_HOST;
    const port = process.env.SQL_PORT || '5432';
    const dbName = process.env.SQL_DB_NAME || 'postgres';
    return `postgresql://${user}:${pass}@${host}:${port}/${dbName}`;
  }

  return '';
}

export const validConnectionString = getValidPostgresConnectionString();
export const isPostgresConfigured = Boolean(validConnectionString && validConnectionString.length > 10);

/**
 * Cria ou recupera a instância do Pool de Conexões PostgreSQL.
 * Retorna null se não houver banco de dados remoto configurado, evitando conexões cegas ao localhost.
 */
export const createPool = (): pg.Pool | null => {
  if (!isPostgresConfigured) {
    return null;
  }

  if (!global._postgresPool) {
    const config: PoolConfig = {
      connectionString: validConnectionString,
      max: parseInt(process.env.SQL_MAX_POOL || '10', 10),
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
      keepAlive: true,
      keepAliveInitialDelayMillis: 3000,
      ssl: { rejectUnauthorized: false },
    };

    global._postgresPool = new Pool(config);

    global._postgresPool.on('error', (err: Error) => {
      console.warn('⚠️ Conexão inativa reciclada no pool PostgreSQL:', err.message);
    });
  }
  return global._postgresPool;
};

export const pool = createPool();
export const db = pool ? drizzle(pool, { schema }) : (null as any);

/**
 * Utilitário de retry para consultas do banco com proteção contra quedas transitórias de rede.
 */
export async function withRetry<T>(fn: () => Promise<T>, maxRetries = 2, delayMs = 200): Promise<T> {
  let lastError: any;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      lastError = err;
      const isConnectionError =
        err?.message?.includes('Connection terminated') ||
        err?.message?.includes('timeout') ||
        err?.message?.includes('closed') ||
        err?.code === 'ECONNRESET' ||
        err?.code === 'ECONNREFUSED' ||
        err?.code === '57P01';

      if (attempt < maxRetries && isConnectionError) {
        console.warn(`[DB Retry] Tentativa ${attempt} falhou (${err.message}). Tentando novamente em ${delayMs}ms...`);
        await new Promise((res) => setTimeout(res, delayMs));
        continue;
      }
      break;
    }
  }
  throw lastError;
}
