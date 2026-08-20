import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool, PoolConfig } from 'pg';
import * as schema from './schema.ts';

declare global {
  var _postgresPool: Pool | undefined;
}

/**
 * Cria ou recupera a instância do Pool de Conexões PostgreSQL
 * utilizando estritamente as variáveis de ambiente fornecidas no .env
 */
export const createPool = () => {
  if (!global._postgresPool) {
    const config: PoolConfig = {
      host: process.env.SQL_HOST || process.env.PGHOST || '127.0.0.1',
      port: parseInt(process.env.SQL_PORT || process.env.PGPORT || '5432', 10),
      user: process.env.SQL_USER || process.env.PGUSER || 'postgres',
      password: process.env.SQL_PASSWORD || process.env.PGPASSWORD || '',
      database: process.env.SQL_DB_NAME || process.env.PGDATABASE || 'postgres',
      max: parseInt(process.env.SQL_MAX_POOL || '10', 10),
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    };

    // Suporte a SSL caso explicitamente configurado no .env
    if (process.env.SQL_SSL === 'true' || process.env.PGSSLMODE === 'require') {
      config.ssl = { rejectUnauthorized: false };
    }

    global._postgresPool = new Pool(config);

    global._postgresPool.on('error', (err) => {
      console.error('⚠️ Erro inesperado no pool PostgreSQL inativo:', err.message);
    });
  }
  return global._postgresPool;
};

export const pool = createPool();
export const db = drizzle(pool, { schema });

/**
 * Retorna as informações de conexão do PostgreSQL mascarando senhas sensíveis
 */
export function getPostgresConnectionInfo() {
  const host = process.env.SQL_HOST || process.env.PGHOST || '127.0.0.1';
  const port = parseInt(process.env.SQL_PORT || process.env.PGPORT || '5432', 10);
  const user = process.env.SQL_USER || process.env.PGUSER || 'postgres';
  const database = process.env.SQL_DB_NAME || process.env.PGDATABASE || 'postgres';
  const ssl = process.env.SQL_SSL === 'true' || process.env.PGSSLMODE === 'require';

  return {
    host,
    port,
    user,
    database,
    ssl,
    poolTotal: pool.totalCount,
    poolIdle: pool.idleCount,
    poolWaiting: pool.waitingCount,
    configured: Boolean(process.env.SQL_HOST && process.env.SQL_PASSWORD),
  };
}

/**
 * Diagnóstico de Saúde e Latência da Conexão com o PostgreSQL
 */
export async function getPostgresHealth() {
  const start = performance.now();
  try {
    const client = await pool.connect();
    try {
      const res = await client.query(`
        SELECT 
          NOW() as current_time, 
          version() as pg_version, 
          current_database() as db_name,
          (SELECT count(*) FROM products) as products_count,
          (SELECT count(*) FROM stock_movements) as movements_count,
          (SELECT count(*) FROM nf_entries) as nf_entries_count,
          (SELECT count(*) FROM store_sales) as sales_count,
          (SELECT count(*) FROM users) as users_count;
      `);

      const latencyMs = Math.round((performance.now() - start) * 10) / 10;
      const row = res.rows[0] || {};

      return {
        status: 'healthy' as const,
        latencyMs,
        serverTime: row.current_time,
        version: row.pg_version ? row.pg_version.split(' ')[0] + ' ' + row.pg_version.split(' ')[1] : 'PostgreSQL',
        database: row.db_name,
        connection: getPostgresConnectionInfo(),
        counts: {
          products: parseInt(row.products_count || '0', 10),
          movements: parseInt(row.movements_count || '0', 10),
          nfEntries: parseInt(row.nf_entries_count || '0', 10),
          sales: parseInt(row.sales_count || '0', 10),
          users: parseInt(row.users_count || '0', 10),
        },
      };
    } finally {
      client.release();
    }
  } catch (error: any) {
    const latencyMs = Math.round((performance.now() - start) * 10) / 10;
    return {
      status: 'unhealthy' as const,
      latencyMs,
      error: error.message || 'Falha ao conectar no PostgreSQL',
      connection: getPostgresConnectionInfo(),
    };
  }
}
