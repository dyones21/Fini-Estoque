import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import {
  getAllProducts,
  saveProduct,
  deleteProductById,
  getAllMovements,
  insertMovement,
  getAllNFEntries,
  insertNFEntry,
  getAllSales,
  insertSale,
  getRealtimeStockSummary,
} from './src/db/dbService.ts';
import { getPostgresHealth, getPostgresConnectionInfo, pool } from './src/db/index.ts';
import { getOrCreateUser, updateUserRoleInDb, getAllUsersFromDb } from './src/db/users.ts';
import { requireAuth, AuthRequest } from './src/middleware/auth.ts';

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '10mb' }));

  // Health check endpoint
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', database: 'Cloud SQL PostgreSQL' });
  });

  // USER SYNC API (Firebase Auth -> Postgres Users Table)
  // Segurança: O papel (role) do req.body é TOTALMENTE IGNORADO. O servidor decide o papel.
  app.post('/api/users/sync', requireAuth, async (req: AuthRequest, res) => {
    try {
      const uid = req.user?.uid;
      const email = req.user?.email || req.body?.email || '';
      const name = req.body?.name || req.user?.name || (email ? email.split('@')[0] : 'Usuário Fini');

      if (!uid || !email) {
        return res.status(400).json({ error: 'UID e E-mail são obrigatórios para sincronização' });
      }

      // getOrCreateUser determina role baseado na lista do servidor SUPER_ADMIN_EMAILS ou preserva o banco
      const syncedUser = await getOrCreateUser(uid, email, name);
      res.json({ success: true, user: syncedUser });
    } catch (error: any) {
      console.error('API Error POST /api/users/sync:', error);
      res.status(500).json({ error: error.message || 'Erro ao sincronizar usuário no Postgres' });
    }
  });

  // LIST USERS API (Postgres Users Table)
  app.get('/api/users', requireAuth, async (req, res) => {
    try {
      const allUsers = await getAllUsersFromDb();
      res.json(allUsers);
    } catch (error: any) {
      console.error('API Error GET /api/users:', error);
      res.status(500).json({ error: error.message || 'Erro ao buscar usuários do Postgres' });
    }
  });

  // UPDATE USER ROLE API (Apenas super_admin pode alterar roles de outros usuários)
  app.patch('/api/users/:uid/role', requireAuth, async (req: AuthRequest, res) => {
    try {
      const requesterUid = req.user?.uid;
      const targetUid = req.params.uid;
      const newRole = req.body?.role;

      if (!requesterUid) {
        return res.status(401).json({ error: 'Usuário não autenticado.' });
      }

      if (!targetUid || !newRole) {
        return res.status(400).json({ error: 'UID do usuário alvo e novo papel (role) são obrigatórios.' });
      }

      const updatedUser = await updateUserRoleInDb(requesterUid, targetUid, newRole);
      res.json({ success: true, user: updatedUser });
    } catch (error: any) {
      const statusCode = error.statusCode || 500;
      if (statusCode !== 500) {
        return res.status(statusCode).json({ error: error.message });
      }
      console.error('API Error PATCH /api/users/:uid/role:', error);
      res.status(500).json({ error: error.message || 'Erro ao atualizar papel do usuário no Postgres' });
    }
  });

  // PRODUCTS API
  app.get('/api/products', requireAuth, async (req, res) => {
    try {
      const items = await getAllProducts();
      res.json(items);
    } catch (error: any) {
      console.error('API Error /api/products:', error);
      res.status(500).json({ error: error.message || 'Erro ao carregar produtos do Cloud SQL' });
    }
  });

  app.post('/api/products', requireAuth, async (req, res) => {
    try {
      const productData = req.body;
      const saved = await saveProduct(productData);
      res.json(saved);
    } catch (error: any) {
      console.error('API Error POST /api/products:', error);
      res.status(500).json({ error: error.message || 'Erro ao salvar produto no Cloud SQL' });
    }
  });

  app.delete('/api/products/:id', requireAuth, async (req, res) => {
    try {
      await deleteProductById(req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      console.error('API Error DELETE /api/products:', error);
      res.status(500).json({ error: error.message || 'Erro ao deletar produto do Cloud SQL' });
    }
  });

  // STOCK MOVEMENTS API
  app.get('/api/movements', requireAuth, async (req, res) => {
    try {
      const items = await getAllMovements();
      res.json(items);
    } catch (error: any) {
      console.error('API Error /api/movements:', error);
      res.status(500).json({ error: error.message || 'Erro ao carregar movimentações do Cloud SQL' });
    }
  });

  app.post('/api/movements', requireAuth, async (req, res) => {
    try {
      const movementData = req.body;
      const saved = await insertMovement(movementData);
      res.json(saved);
    } catch (error: any) {
      console.error('API Error POST /api/movements:', error);
      res.status(500).json({ error: error.message || 'Erro ao registrar movimentação no Cloud SQL' });
    }
  });

  // NF ENTRIES API
  app.get('/api/nf-entries', requireAuth, async (req, res) => {
    try {
      const entries = await getAllNFEntries();
      res.json(entries);
    } catch (error: any) {
      console.error('API Error /api/nf-entries:', error);
      res.status(500).json({ error: error.message || 'Erro ao carregar NFs do Cloud SQL' });
    }
  });

  app.post('/api/nf-entries', requireAuth, async (req, res) => {
    try {
      const nfData = req.body;
      const saved = await insertNFEntry(nfData);
      res.json(saved);
    } catch (error: any) {
      console.error('API Error POST /api/nf-entries:', error);
      res.status(500).json({ error: error.message || 'Erro ao registrar NF no Cloud SQL' });
    }
  });

  // SALES API
  app.get('/api/sales', requireAuth, async (req, res) => {
    try {
      const sales = await getAllSales();
      res.json(sales);
    } catch (error: any) {
      console.error('API Error /api/sales:', error);
      res.status(500).json({ error: error.message || 'Erro ao carregar vendas do Cloud SQL' });
    }
  });

  app.post('/api/sales', requireAuth, async (req, res) => {
    try {
      const saleData = req.body;
      const saved = await insertSale(saleData);
      res.json(saved);
    } catch (error: any) {
      console.error('API Error POST /api/sales:', error);
      res.status(500).json({ error: error.message || 'Erro ao salvar venda no Cloud SQL' });
    }
  });

  // POSTGRESQL REALTIME INTEGRATION API
  // Status de saúde, latência e estatísticas de conexão do PostgreSQL
  app.get('/api/postgres/status', requireAuth, async (req, res) => {
    try {
      const health = await getPostgresHealth();
      res.json(health);
    } catch (error: any) {
      console.error('API Error GET /api/postgres/status:', error);
      res.status(500).json({ error: error.message || 'Erro ao verificar status do PostgreSQL' });
    }
  });

  // Busca automática de estoque em tempo real com métricas agregadas
  app.get('/api/postgres/stock-realtime', requireAuth, async (req, res) => {
    try {
      const summary = await getRealtimeStockSummary();
      res.json(summary);
    } catch (error: any) {
      console.error('API Error GET /api/postgres/stock-realtime:', error);
      res.status(500).json({ error: error.message || 'Erro ao buscar estoque em tempo real do PostgreSQL' });
    }
  });

  // Diagnóstico e teste de integridade SQL
  app.post('/api/postgres/diagnostics', requireAuth, async (req, res) => {
    const start = performance.now();
    try {
      const client = await pool.connect();
      try {
        const tableCheck = await client.query(`
          SELECT 
            table_name,
            (SELECT count(*) FROM information_schema.columns WHERE table_name = t.table_name) as columns_count
          FROM information_schema.tables t
          WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
          ORDER BY table_name;
        `);

        const latencyMs = Math.round((performance.now() - start) * 10) / 10;
        res.json({
          success: true,
          latencyMs,
          timestamp: new Date().toISOString(),
          tables: tableCheck.rows,
          connection: getPostgresConnectionInfo(),
        });
      } finally {
        client.release();
      }
    } catch (error: any) {
      const latencyMs = Math.round((performance.now() - start) * 10) / 10;
      console.error('API Error POST /api/postgres/diagnostics:', error);
      res.status(500).json({
        success: false,
        latencyMs,
        error: error.message || 'Falha ao executar diagnóstico no PostgreSQL',
      });
    }
  });

  // Vite middleware for development vs static serve for production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Fini Nova Friburgo Cloud SQL server running on http://localhost:${PORT}`);
  });
}

startServer();
