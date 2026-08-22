import 'dotenv/config';
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
  wipeAllStockData,
} from './src/db/dbService.ts';
import {
  getOrCreateUser,
  updateUserRoleInDb,
  getAllUsersFromDb,
  saveUserInDb,
  deleteUserFromDb,
  isSuperAdminEmail,
} from './src/db/users.ts';
import { adminAuth } from './src/lib/firebase-admin.ts';
import { requireAuth, AuthRequest } from './src/middleware/auth.ts';
import { requirePermission } from './src/middleware/requirePermission.ts';

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '10mb' }));

  // Health check endpoint
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', database: 'Supabase' });
  });

  // USER SYNC API (Supabase Auth -> Supabase Users Table)
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
      res.status(500).json({ error: error.message || 'Erro ao sincronizar usuário no Supabase' });
    }
  });

  // LIST USERS API (Supabase Users Table) - Exige permissão canManageUsers
  app.get('/api/users', requireAuth, requirePermission('canManageUsers'), async (req, res) => {
    try {
      const allUsers = await getAllUsersFromDb();
      res.json(allUsers);
    } catch (error: any) {
      console.error('API Error GET /api/users:', error);
      res.status(500).json({ error: error.message || 'Erro ao buscar usuários do Supabase' });
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
      res.status(500).json({ error: error.message || 'Erro ao atualizar papel do usuário no Supabase' });
    }
  });

  // CREATE OR UPDATE USER WITH EMAIL/PASSWORD (ADMIN ONLY) - Exige permissão canManageUsers
  // Utiliza o Firebase Admin SDK no servidor para evitar troca da sessão do navegador do administrador.
  app.post('/api/users/create-with-password', requireAuth, requirePermission('canManageUsers'), async (req: AuthRequest, res) => {
    try {
      const { email, password, name, role, pin } = req.body || {};

      if (!email || typeof email !== 'string' || !email.includes('@')) {
        return res.status(400).json({ error: 'E-mail válido é obrigatório para cadastrar o usuário.' });
      }

      if (!password || typeof password !== 'string' || password.length < 6) {
        return res.status(400).json({ error: 'A senha provisória deve conter no mínimo 6 caracteres.' });
      }

      const cleanEmail = email.trim().toLowerCase();
      const cleanName = name?.trim() || cleanEmail.split('@')[0];
      const cleanRole = role?.trim() || 'operador_deposito';
      const cleanPin = pin?.trim() || undefined;

      // 1. Criar ou atualizar o usuário diretamente no Firebase Authentication via Admin SDK
      let firebaseUserRecord: any;
      try {
        firebaseUserRecord = await adminAuth.createUser({
          email: cleanEmail,
          password: password,
          displayName: cleanName,
        });
      } catch (fbErr: any) {
        if (fbErr.code === 'auth/email-already-exists') {
          // Se o usuário já existe no Firebase (ex: fez login antes com Google ou foi criado anteriormente),
          // atualizamos a senha do Firebase Auth para que ele também consiga logar com e-mail/senha.
          try {
            const existingFbUser = await adminAuth.getUserByEmail(cleanEmail);
            firebaseUserRecord = await adminAuth.updateUser(existingFbUser.uid, {
              password: password,
              displayName: cleanName,
            });
          } catch (updateErr: any) {
            return res.status(400).json({
              error: `Este e-mail já existe no Firebase e não pôde ser atualizado: ${updateErr.message}`,
            });
          }
        } else if (fbErr.code === 'auth/invalid-password') {
          return res.status(400).json({ error: 'A senha fornecida é inválida (mínimo 6 caracteres).' });
        } else {
          console.error('Erro no adminAuth.createUser:', fbErr);
          return res.status(400).json({ error: fbErr.message || 'Erro ao registrar credenciais no Firebase Authentication' });
        }
      }

      // 2. Salvar / sincronizar o usuário na tabela users do Postgres já com o cargo escolhido
      const savedUser = await saveUserInDb({
        uid: firebaseUserRecord.uid,
        email: cleanEmail,
        name: cleanName,
        role: cleanRole,
        pin: cleanPin,
      });

      res.status(201).json({
        success: true,
        user: savedUser,
        message: 'Usuário cadastrado com sucesso no Firebase e no banco de dados.',
      });
    } catch (error: any) {
      console.error('API Error POST /api/users/create-with-password:', error);
      res.status(500).json({ error: error.message || 'Erro ao criar usuário no servidor' });
    }
  });

  // SET / RESET USER PASSWORD (ADMIN ONLY)
  app.post('/api/users/set-password', requireAuth, requirePermission('canManageUsers'), async (req: AuthRequest, res) => {
    try {
      const { email, password } = req.body || {};
      if (!email || !password || password.length < 6) {
        return res.status(400).json({ error: 'E-mail válido e senha com no mínimo 6 caracteres são obrigatórios.' });
      }

      const cleanEmail = email.trim().toLowerCase();
      try {
        const existingFbUser = await adminAuth.getUserByEmail(cleanEmail);
        await adminAuth.updateUser(existingFbUser.uid, { password });
        return res.json({ success: true, message: `Senha do usuário ${cleanEmail} atualizada com sucesso no Firebase.` });
      } catch (fbErr: any) {
        if (fbErr.code === 'auth/user-not-found') {
          // Cria a conta no Firebase se ela não existir
          const newFbUser = await adminAuth.createUser({ email: cleanEmail, password });
          return res.json({ success: true, message: `Conta ${cleanEmail} criada no Firebase Auth com a nova senha.` });
        }
        return res.status(400).json({ error: fbErr.message || 'Erro ao definir senha no Firebase.' });
      }
    } catch (error: any) {
      console.error('API Error POST /api/users/set-password:', error);
      res.status(500).json({ error: error.message || 'Erro ao atualizar senha' });
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
      res.status(500).json({ error: error.message || 'Erro ao carregar produtos do Supabase' });
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
      res.status(500).json({ error: error.message || 'Erro ao salvar produto no Supabase' });
    }
  });

  // Exclusão de Produtos: Exige canManageProducts
  app.delete('/api/products/:id', requireAuth, requirePermission('canManageProducts'), async (req, res) => {
    try {
      await deleteProductById(req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      console.error('API Error DELETE /api/products:', error);
      res.status(500).json({ error: error.message || 'Erro ao deletar produto do Supabase' });
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
      res.status(500).json({ error: error.message || 'Erro ao carregar movimentações do Supabase' });
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
        res.status(500).json({ error: error.message || 'Erro ao registrar movimentação no Supabase' });
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
      res.status(500).json({ error: error.message || 'Erro ao carregar NFs do Supabase' });
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
      res.status(500).json({ error: error.message || 'Erro ao registrar NF no Supabase' });
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
      res.status(500).json({ error: error.message || 'Erro ao carregar vendas do Supabase' });
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
      res.status(500).json({ error: error.message || 'Erro ao salvar venda no Supabase' });
    }
  });

  // ZERAR TODO O SISTEMA: Exige requireAuth + requirePermission('canManageBackup') + Validação de PIN no servidor
  app.delete('/api/system/wipe', requireAuth, requirePermission('canManageBackup'), async (req: AuthRequest, res) => {
    try {
      const { pin } = req.body || {};
      const dbUser = (req as any).dbUser;
      const userEmail = (req.user?.email || '').toLowerCase();
      const isSuper = isSuperAdminEmail(userEmail) || dbUser?.role === 'super_admin' || dbUser?.role === 'admin';

      if (!pin || typeof pin !== 'string') {
        return res.status(400).json({ error: 'PIN de administrador é obrigatório para confirmar a exclusão do sistema.' });
      }

      const inputPin = pin.trim();
      const userPin = (dbUser?.pin || '').trim();

      // Master admin PINs aceitos para super administradores
      const masterPins = ['2101', '9420', '5555', '1234', '0000'];

      let isPinValid = false;
      if (userPin && inputPin === userPin) {
        isPinValid = true;
      } else if (isSuper && masterPins.includes(inputPin)) {
        isPinValid = true;
      } else {
        // Verificar se coincide estritamente com o PIN configurado de algum outro super_admin / gerente
        const allDbUsers = await getAllUsersFromDb();
        isPinValid = allDbUsers.some(
          (u) =>
            (u.role === 'super_admin' || u.role === 'admin' || u.role?.toLowerCase().includes('gerente')) &&
            u.pin &&
            u.pin.trim() !== '' &&
            u.pin.trim() === inputPin
        );
      }

      if (!isPinValid) {
        console.warn(`[Segurança] Tentativa de wipe do sistema com PIN incorreto pelo usuário UID=${req.user?.uid} (${req.user?.email})`);
        return res.status(403).json({ error: 'PIN de administrador incorreto (use o PIN 2101 ou seu PIN cadastrado). Operação cancelada.' });
      }

      const result = await wipeAllStockData();
      res.json(result);
    } catch (error: any) {
      console.error('API Error DELETE /api/system/wipe:', error);
      res.status(500).json({ error: error.message || 'Erro ao zerar dados do sistema no Supabase' });
    }
  });

  // 404 handler for unmatched /api routes so they NEVER fall through to Vite SPA index.html
  app.all(['/api', '/api/*'], (req, res) => {
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
