import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import type { PoolConfig } from 'pg';
import * as schema from './schema.ts';

const { Pool } = pg;

declare global {
  var _postgresPool: pg.Pool | undefined;
}

// Supabase PostgreSQL Pooler oficial (IPv4 Dual-Stack, Session Mode na Porta 5432)
const DEFAULT_SUPABASE_POOLER_URL =
  'postgresql://postgres.erewcnfavhtexmitrtce:Schumacker21%2F1%2F9*@aws-0-us-west-2.pooler.supabase.com:5432/postgres';

function getValidPostgresConnectionString(): string {
  const candidates = [
    process.env.POSTGRES_URL,
    process.env.SUPABASE_DATABASE_URL,
    process.env.DATABASE_URL,
    DEFAULT_SUPABASE_POOLER_URL,
  ];

  for (const uri of candidates) {
    if (uri && (uri.startsWith('postgresql://') || uri.startsWith('postgres://'))) {
      return uri;
    }
  }

  return DEFAULT_SUPABASE_POOLER_URL;
}

/**
 * Cria ou recupera a instância do Pool de Conexões PostgreSQL
 * Configurado com o Pooler Supabase IPv4 e reconexão automática resiliente.
 */
export const createPool = () => {
  if (!global._postgresPool) {
    const connectionString = getValidPostgresConnectionString();

    const config: PoolConfig = {
      connectionString,
      max: parseInt(process.env.SQL_MAX_POOL || '8', 10),
      idleTimeoutMillis: 20000,
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
export const db = drizzle(pool, { schema });

/**
 * Utilitário de retry para consultas do banco com proteção contra quedas transitórias de rede.
 */
export async function withRetry<T>(fn: () => Promise<T>, maxRetries = 3, delayMs = 300): Promise<T> {
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
