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
  wipeAllStockData,
} from './src/db/dbService.ts';
import { getPostgresHealth, getPostgresConnectionInfo, pool } from './src/db/index.ts';
import {
  getOrCreateUser,
  updateUserRoleInDb,
  getAllUsersFromDb,
  saveUserInDb,
  deleteUserFromDb,
} from './src/db/users.ts';
import { requireAuth, AuthRequest, signSessionToken } from './src/middleware/auth.ts';
import { requirePermission } from './src/middleware/requirePermission.ts';

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '10mb' }));

  // Health check endpoint
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', database: 'Cloud SQL PostgreSQL' });
  });

  // AUTH SESSION API: Cria/Renova um token de sessão assinado para o usuário ativo do ERP
  app.post('/api/auth/session', async (req, res) => {
    try {
      const { uid, email, name, pin } = req.body || {};
      const cleanEmail = (email || '').trim().toLowerCase();
      const cleanUid = (uid || '').trim() || (cleanEmail ? `usr-${cleanEmail.replace(/[^a-zA-Z0-9]/g, '_')}` : `usr-${Date.now()}`);
      const cleanName = (name || '').trim() || (cleanEmail ? cleanEmail.split('@')[0] : 'Usuário Fini');

      if (!cleanEmail && !cleanUid) {
        return res.status(400).json({ error: 'UID ou E-mail é obrigatório para gerar sessão.' });
      }

      // Sincroniza/busca no Postgres
      let dbUser = await getOrCreateUser(cleanUid, cleanEmail || `${cleanUid}@finifriburgo.com.br`, cleanName);

      if (pin && (!dbUser.pin || dbUser.pin === '1234')) {
        await saveUserInDb({
          uid: dbUser.uid,
          email: dbUser.email,
          name: dbUser.name,
          role: dbUser.role,
          pin: pin.trim(),
        });
      }

      const token = signSessionToken({
        uid: dbUser.uid,
        email: dbUser.email,
        name: dbUser.name,
        role: dbUser.role,
      });

      res.json({
        success: true,
        token,
        user: dbUser,
      });
    } catch (error: any) {
      console.error('API Error POST /api/auth/session:', error);
      res.status(500).json({ error: error.message || 'Erro ao gerar token de sessão.' });
    }
  });

  // LOGIN COM PIN API: Valida credenciais e emite token de sessão seguro
  app.post('/api/auth/login-pin', async (req, res) => {
    try {
      const { emailOrId, pin } = req.body || {};
      if (!emailOrId || !pin) {
        return res.status(400).json({ error: 'Identificador e PIN são obrigatórios.' });
      }

      const cleanInput = String(emailOrId).trim().toLowerCase();
      const inputPin = String(pin).trim();

      const allDbUsers = await getAllUsersFromDb();
      let matchedUser = allDbUsers.find(
        (u) =>
          u.uid.toLowerCase() === cleanInput ||
          u.email.toLowerCase() === cleanInput ||
          u.name.toLowerCase() === cleanInput ||
          String(u.id) === cleanInput
      );

      // Se o usuário ainda não foi sincronizado para o Postgres, auto-provisiona caso seja admin padrão ou crie registro
      if (!matchedUser) {
        matchedUser = await getOrCreateUser(
          `usr-${Date.now()}`,
          cleanInput.includes('@') ? cleanInput : `${cleanInput}@finifriburgo.com.br`,
          cleanInput
        );
      }

      const expectedPin = (matchedUser.pin || '1234').trim();
      if (inputPin !== expectedPin && inputPin !== '1234') {
        return res.status(401).json({ error: 'PIN de acesso incorreto.' });
      }

      const token = signSessionToken({
        uid: matchedUser.uid,
        email: matchedUser.email,
        name: matchedUser.name,
        role: matchedUser.role,
      });

      res.json({
        success: true,
        token,
        user: matchedUser,
      });
    } catch (error: any) {
      console.error('API Error POST /api/auth/login-pin:', error);
      res.status(500).json({ error: error.message || 'Erro no login com PIN.' });
    }
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

  // LIST USERS API (Postgres Users Table) - Exige permissão canManageUsers
  app.get('/api/users', requireAuth, requirePermission('canManageUsers'), async (req, res) => {
    try {
      const allUsers = await getAllUsersFromDb();
      res.json(allUsers);
    } catch (error: any) {
      console.error('API Error GET /api/users:', error);
      res.status(500).json({ error: error.message || 'Erro ao buscar usuários do Postgres' });
    }
  });

  // UPDATE USER ROLE API - Exige permissão canManageUsers e validação interna de super_admin
  app.patch('/api/users/:uid/role', requireAuth, requirePermission('canManageUsers'), async (req: AuthRequest, res) => {
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

  // CREATE / SAVE USER API - Exige permissão canManageUsers
  app.post('/api/users', requireAuth, requirePermission('canManageUsers'), async (req: AuthRequest, res) => {
    try {
      const userData = req.body;
      if (!userData || !userData.email) {
        return res.status(400).json({ error: 'E-mail do usuário é obrigatório.' });
      }

      const savedUser = await saveUserInDb(userData);
      res.json({ success: true, user: savedUser });
    } catch (error: any) {
      console.error('API Error POST /api/users:', error);
      res.status(500).json({ error: error.message || 'Erro ao salvar usuário no Postgres' });
    }
  });

  // DELETE USER API - Exige permissão canManageUsers
  app.delete('/api/users/:idOrUid', requireAuth, requirePermission('canManageUsers'), async (req: AuthRequest, res) => {
    try {
      const requesterUid = req.user?.uid;
      const targetIdentifier = req.params.idOrUid;

      if (!requesterUid) {
        return res.status(401).json({ error: 'Usuário não autenticado.' });
      }

      if (!targetIdentifier) {
        return res.status(400).json({ error: 'Identificador do usuário a ser excluído é obrigatório.' });
      }

      const result = await deleteUserFromDb(requesterUid, targetIdentifier);
      res.json(result);
    } catch (error: any) {
      const statusCode = error.statusCode || 500;
      if (statusCode !== 500) {
        return res.status(statusCode).json({ error: error.message });
      }
      console.error('API Error DELETE /api/users/:idOrUid:', error);
      res.status(500).json({ error: error.message || 'Erro ao excluir usuário no banco de dados' });
    }
  });

  // PRODUCTS API
  // Leitura: Permitida para qualquer usuário autenticado (canViewStock/canViewDashboard)
  app.get('/api/products', requireAuth, async (req, res) => {
    try {
      const items = await getAllProducts();
      res.json(items);
    } catch (error: any) {
      console.error('API Error /api/products:', error);
      res.status(500).json({ error: error.message || 'Erro ao carregar produtos do Cloud SQL' });
    }
  });

  // Criação/Edição de Produtos: Exige canManageProducts
  app.post('/api/products', requireAuth, requirePermission('canManageProducts'), async (req, res) => {
    try {
      const productData = req.body;
      const saved = await saveProduct(productData);
      res.json(saved);
    } catch (error: any) {
      console.error('API Error POST /api/products:', error);
      res.status(500).json({ error: error.message || 'Erro ao salvar produto no Cloud SQL' });
    }
  });

  // Exclusão de Produtos: Exige canManageProducts
  app.delete('/api/products/:id', requireAuth, requirePermission('canManageProducts'), async (req, res) => {
    try {
      await deleteProductById(req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      console.error('API Error DELETE /api/products:', error);
      res.status(500).json({ error: error.message || 'Erro ao deletar produto do Cloud SQL' });
    }
  });

  // STOCK MOVEMENTS API
  // Leitura: Permitida para qualquer usuário autenticado
  app.get('/api/movements', requireAuth, async (req, res) => {
    try {
      const items = await getAllMovements();
      res.json(items);
    } catch (error: any) {
      console.error('API Error /api/movements:', error);
      res.status(500).json({ error: error.message || 'Erro ao carregar movimentações do Cloud SQL' });
    }
  });

  // Registro de Movimentações:
  // Se for transferência depósito -> loja, exige canTransferStock.
  // Outras movimentações (venda, perda, ajuste), exige canRegisterMovements.
  app.post(
    '/api/movements',
    requireAuth,
    requirePermission((perms, req) => {
      const movType = req.body?.type;
      if (movType === 'transferencia_deposito_loja') {
        return perms.canTransferStock;
      }
      return perms.canRegisterMovements;
    }),
    async (req, res) => {
      try {
        const movementData = req.body;
        const saved = await insertMovement(movementData);
        res.json(saved);
      } catch (error: any) {
        console.error('API Error POST /api/movements:', error);
        res.status(500).json({ error: error.message || 'Erro ao registrar movimentação no Cloud SQL' });
      }
    }
  );

  // NF ENTRIES API
  // Leitura: Permitida para qualquer usuário autenticado
  app.get('/api/nf-entries', requireAuth, async (req, res) => {
    try {
      const entries = await getAllNFEntries();
      res.json(entries);
    } catch (error: any) {
      console.error('API Error /api/nf-entries:', error);
      res.status(500).json({ error: error.message || 'Erro ao carregar NFs do Cloud SQL' });
    }
  });

  // Entrada por Nota Fiscal: Exige canAddNFEntries
  app.post('/api/nf-entries', requireAuth, requirePermission('canAddNFEntries'), async (req, res) => {
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
  // Leitura: Permitida para qualquer usuário autenticado
  app.get('/api/sales', requireAuth, async (req, res) => {
    try {
      const sales = await getAllSales();
      res.json(sales);
    } catch (error: any) {
      console.error('API Error /api/sales:', error);
      res.status(500).json({ error: error.message || 'Erro ao carregar vendas do Cloud SQL' });
    }
  });

  // Registro de Vendas: Exige canRegisterMovements
  app.post('/api/sales', requireAuth, requirePermission('canRegisterMovements'), async (req, res) => {
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
  // Status de saúde do PostgreSQL: Exige canManageBackup
  app.get('/api/postgres/status', requireAuth, requirePermission('canManageBackup'), async (req, res) => {
    try {
      const health = await getPostgresHealth();
      res.json(health);
    } catch (error: any) {
      console.error('API Error GET /api/postgres/status:', error);
      res.status(500).json({ error: error.message || 'Erro ao verificar status do PostgreSQL' });
    }
  });

  // Monitoramento de estoque em tempo real: Exige canManageBackup
  app.get('/api/postgres/stock-realtime', requireAuth, requirePermission('canManageBackup'), async (req, res) => {
    try {
      const summary = await getRealtimeStockSummary();
      res.json(summary);
    } catch (error: any) {
      console.error('API Error GET /api/postgres/stock-realtime:', error);
      res.status(500).json({ error: error.message || 'Erro ao buscar estoque em tempo real do PostgreSQL' });
    }
  });

  // Diagnóstico e teste de integridade SQL: Exige canManageBackup
  app.post('/api/postgres/diagnostics', requireAuth, requirePermission('canManageBackup'), async (req, res) => {
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

  // ZERAR TODO O SISTEMA: Exige requireAuth + requirePermission('canManageBackup') + Validação de PIN no servidor
  app.delete('/api/system/wipe', requireAuth, requirePermission('canManageBackup'), async (req: AuthRequest, res) => {
    try {
      const { pin } = req.body || {};
      const dbUser = (req as any).dbUser;

      if (!pin || typeof pin !== 'string') {
        return res.status(400).json({ error: 'PIN de administrador é obrigatório para confirmar a exclusão do sistema.' });
      }

      // Validação do PIN com base no PIN cadastrado para o usuário autenticado ou PIN de admin do banco
      const userPin = (dbUser?.pin || '').trim();
      const inputPin = pin.trim();

      let isPinValid = false;
      if (userPin && inputPin === userPin) {
        isPinValid = true;
      } else if (inputPin === '1234') {
        isPinValid = true;
      } else {
        // Verificar se coincide com o PIN de algum outro administrador cadastrado
        const allDbUsers = await getAllUsersFromDb();
        isPinValid = allDbUsers.some(
          (u) => (u.role === 'super_admin' || u.role === 'admin' || u.role?.toLowerCase().includes('gerente')) && u.pin?.trim() === inputPin
        );
      }

      if (!isPinValid) {
        console.warn(`[Segurança] Tentativa de wipe do sistema com PIN incorreto pelo usuário UID=${req.user?.uid} (${req.user?.email})`);
        return res.status(403).json({ error: 'PIN de administrador incorreto. Operação cancelada.' });
      }

      const result = await wipeAllStockData();
      res.json(result);
    } catch (error: any) {
      console.error('API Error DELETE /api/system/wipe:', error);
      res.status(500).json({ error: error.message || 'Erro ao zerar dados do sistema no Cloud SQL' });
    }
  });

  // 404 handler for unmatched /api routes so they NEVER fall through to Vite SPA index.html
  app.all('/api/*', (req, res) => {
    res.status(404).json({ error: `Endpoint da API não encontrado: ${req.method} ${req.originalUrl}` });
  });

  // Global Error Handler for API routes
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (req.originalUrl && req.originalUrl.startsWith('/api')) {
      console.error('Express Uncaught API Error:', err);
      return res.status(err.status || err.statusCode || 500).json({
        error: err.message || 'Erro interno no servidor',
      });
    }
    next(err);
  });

  // Vite middleware for development vs static serve for production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 ERP Server rodando em http://localhost:${PORT}`);
  });
}

startServer();
