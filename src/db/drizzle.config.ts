import { defineConfig } from 'drizzle-kit';
import * as dotenv from 'dotenv';

dotenv.config();

const connectionString =
  process.env.DATABASE_URL ||
  process.env.SUPABASE_DATABASE_URL ||
  process.env.POSTGRES_URL;

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

