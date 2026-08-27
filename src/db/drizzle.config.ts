import { defineConfig } from 'drizzle-kit';
import * as dotenv from 'dotenv';

dotenv.config();

function getValidPostgresConnectionString(): string {
  const candidates = [
    process.env.DATABASE_URL,
    process.env.SUPABASE_DATABASE_URL,
    process.env.POSTGRES_URL,
    process.env.POSTGRES_PRISMA_URL,
    process.env.SQL_SSL,
  ];

  for (const raw of candidates) {
    if (!raw) continue;
    let uri = raw.trim();

    if (uri.startsWith('postgresql://') || uri.startsWith('postgres://')) {
      if (
        !uri.includes('seu_projeto') &&
        !uri.includes('sua_senha_aqui') &&
        !uri.includes('aws-0-regiao') &&
        !uri.includes('localhost') &&
        !uri.includes('127.0.0.1')
      ) {
        try {
          const parsed = new URL(uri);
          if (parsed.password && (parsed.password.includes('/') || parsed.password.includes('@'))) {
            parsed.password = encodeURIComponent(decodeURIComponent(parsed.password));
            uri = parsed.toString();
          }
        } catch {
          uri = uri.replace(/(postgresql:\/\/[^:]+:)([^@]+)(@.+)/, (_match, p1, p2, p3) => {
            return `${p1}${encodeURIComponent(decodeURIComponent(p2))}${p3}`;
          });
        }
        return uri;
      }
    }
  }

  if (
    process.env.SQL_HOST &&
    process.env.SQL_USER &&
    !process.env.SQL_HOST.startsWith('/app/cloudsql') &&
    !process.env.SQL_HOST.includes('localhost') &&
    !process.env.SQL_HOST.includes('127.0.0.1') &&
    !process.env.SQL_USER.includes('seu_projeto') &&
    process.env.SQL_USER !== 'ai_studio_app_user'
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

const connectionString = getValidPostgresConnectionString();

const sqlHost = process.env.SQL_HOST || process.env.PGHOST;
const sqlDbName = process.env.SQL_DB_NAME || process.env.PGDATABASE;
const user = process.env.SQL_ADMIN_USER || process.env.SQL_USER || process.env.PGUSER;
const password = process.env.SQL_ADMIN_PASSWORD || process.env.SQL_PASSWORD || process.env.PGPASSWORD;

const dbCredentials: any = connectionString
  ? { url: connectionString }
  : {
      host: sqlHost || '127.0.0.1',
      port: parseInt(process.env.SQL_PORT || process.env.PGPORT || '5432', 10),
      user: user || 'postgres',
      password: password || '',
      database: sqlDbName || 'postgres',
      ssl: process.env.SQL_SSL === 'false' ? false : true,
    };

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  schemaFilter: ['public'],
  dbCredentials,
  verbose: true,
});

