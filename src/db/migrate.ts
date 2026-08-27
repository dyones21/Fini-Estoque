import { db, isPostgresConfigured } from './index.ts';
import { migrate } from 'drizzle-orm/node-postgres/migrator';

let migrationsRunPromise: Promise<void> | null = null;

/**
 * Executa as migrations formais do Drizzle registradas na pasta ./drizzle
 */
export async function runDrizzleMigrations(): Promise<void> {
  if (!isPostgresConfigured || !db) return;
  if (migrationsRunPromise) return migrationsRunPromise;

  migrationsRunPromise = (async () => {
    try {
      await migrate(db, { migrationsFolder: './drizzle' });
      console.log('✅ [Drizzle Migrator] Migrations formais verificadas e sincronizadas com o banco.');
    } catch (err: any) {
      console.warn('⚠️ [Drizzle Migrator] Aviso ao aplicar migrations formais:', err.message);
    }
  })();

  return migrationsRunPromise;
}
