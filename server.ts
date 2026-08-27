import 'dotenv/config';
import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import {
  getAllProducts,
  saveProduct,
  updateProductById,
  deleteProductById,
  getAllMovements,
  insertMovement,
  processStockTransfer,
  getAllNFEntries,
  getNFEntryByAccessKey,
  processNFEntry,
  insertNFEntry,
  deleteNFEntryById,
  getAllSales,
  insertSale,
  wipeAllStockData,
  getCompanyInfo,
  saveCompanyInfo,
  getCompanyCnpj,
  getAllCategories,
  insertCategory,
  ensureDbSchema,
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
import { parseNFeXml } from './src/utils/nfeXmlParser.ts';

async function startServer() {
  // Garante a migração de esquema/colunas em runtime
  await ensureDbSchema().catch((e) => console.warn('Database auto-migrate notice:', e.message));

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

  // Criação de Produtos: Exige canManageProducts
  app.post('/api/products', requireAuth, requirePermission('canManageProducts'), async (req, res) => {
    try {
      const productData = req.body;
      const saved = await saveProduct(productData);
      res.json(saved);
    } catch (error: any) {
      console.error('API Error POST /api/products:', error);
      res.status(500).json({ error: error.message || 'Erro ao salvar produto no banco de dados' });
    }
  });

  // Atualização de Produtos por ID: Exige canManageProducts
  app.put('/api/products/:id', requireAuth, requirePermission('canManageProducts'), async (req, res) => {
    try {
      const id = req.params.id;
      const updates = req.body;

      if (!id) {
        return res.status(400).json({ error: 'ID do produto é obrigatório.' });
      }

      const updated = await updateProductById(id, updates);
      if (!updated) {
        return res.status(404).json({ error: `Produto com ID '${id}' não foi encontrado no banco de dados.` });
      }

      res.json(updated);
    } catch (error: any) {
      console.error(`API Error PUT /api/products/${req.params.id}:`, error);
      res.status(500).json({ error: error.message || 'Erro ao atualizar produto no banco de dados' });
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

  // CATEGORIES API
  // Leitura: Permitida para qualquer usuário autenticado
  app.get('/api/categories', requireAuth, async (req, res) => {
    try {
      const cats = await getAllCategories();
      res.json(cats);
    } catch (error: any) {
      console.error('API Error GET /api/categories:', error);
      res.status(500).json({ error: error.message || 'Erro ao carregar categorias do Supabase' });
    }
  });

  // Criação de Categoria: Exige canManageProducts
  app.post('/api/categories', requireAuth, requirePermission('canManageProducts'), async (req, res) => {
    try {
      const name = req.body?.name;
      if (!name || typeof name !== 'string' || !name.trim()) {
        return res.status(400).json({ error: 'Nome da categoria é obrigatório.' });
      }
      const savedName = await insertCategory(name);
      res.json({ success: true, name: savedName });
    } catch (error: any) {
      console.error('API Error POST /api/categories:', error);
      res.status(500).json({ error: error.message || 'Erro ao salvar categoria no Supabase' });
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

  // STOCK TRANSFERS API (Depósito Central ➔ Loja Nova Friburgo)
  // Exige requireAuth + canTransferStock
  app.post('/api/transfers', requireAuth, requirePermission('canTransferStock'), async (req: AuthRequest, res) => {
    try {
      const transferData = req.body;
      if (!transferData || !transferData.productId || !transferData.quantity) {
        return res.status(400).json({ error: 'Produto e quantidade são obrigatórios para a transferência de estoque.' });
      }

      const qty = Number(transferData.quantity);
      if (isNaN(qty) || qty <= 0) {
        return res.status(400).json({ error: 'A quantidade a transferir deve ser um número maior que zero.' });
      }

      const result = await processStockTransfer({
        id: transferData.id,
        productId: transferData.productId,
        productName: transferData.productName,
        quantity: qty,
        date: transferData.date || new Date().toISOString(),
        origin: 'deposito',
        destination: 'loja',
        operatorName: transferData.operatorName || req.user?.name || 'Operador',
        notes: transferData.notes,
      });

      res.status(201).json(result);
    } catch (error: any) {
      console.error('API Error POST /api/transfers:', error);
      res.status(400).json({ error: error.message || 'Erro ao registrar transferência no banco de dados' });
    }
  });

  // COMPANY DATA API
  // Leitura: Permitida para qualquer usuário autenticado
  app.get('/api/company', requireAuth, async (req, res) => {
    try {
      const company = await getCompanyInfo();
      res.json(company);
    } catch (error: any) {
      console.error('API Error GET /api/company:', error);
      res.status(500).json({ error: error.message || 'Erro ao carregar dados da empresa' });
    }
  });

  // Atualização dos Dados da Empresa: Exige canManageBackup
  app.put('/api/company', requireAuth, requirePermission('canManageBackup'), async (req: AuthRequest, res) => {
    try {
      const saved = await saveCompanyInfo(req.body);
      res.json(saved);
    } catch (error: any) {
      console.error('API Error PUT /api/company:', error);
      res.status(500).json({ error: error.message || 'Erro ao salvar dados da empresa' });
    }
  });

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

  // Importação e Validação de Arquivo XML NF-e: Exige canAddNFEntries
  app.post('/api/nfe/import-xml', requireAuth, requirePermission('canAddNFEntries'), async (req, res) => {
    try {
      const { xml } = req.body || {};

      if (!xml || typeof xml !== 'string') {
        return res.status(400).json({ error: 'Conteúdo do arquivo XML não foi fornecido ou é inválido.' });
      }

      // Limite de segurança no tamanho do XML (5MB)
      if (Buffer.byteLength(xml, 'utf8') > 5 * 1024 * 1024) {
        return res.status(400).json({ error: 'O arquivo XML excede o limite máximo permitido de 5MB.' });
      }

      // Busca o CNPJ oficial diretamente do banco de dados (não confia em payload do cliente)
      const officialCompanyCnpj = await getCompanyCnpj();
      const cleanOfficialCnpj = (officialCompanyCnpj || '').replace(/\D/g, '');

      if (!cleanOfficialCnpj || cleanOfficialCnpj.length !== 14) {
        return res.status(400).json({
          error: 'Cadastre o CNPJ da empresa em Configurações → Dados da Empresa antes de importar notas fiscais',
        });
      }

      const parsedData = parseNFeXml(xml, officialCompanyCnpj);

      // Validação de Chave de Acesso Duplicada
      if (parsedData.accessKey && parsedData.accessKey.trim()) {
        const existing = await getNFEntryByAccessKey(parsedData.accessKey.trim());
        if (existing) {
          return res.status(400).json({
            error: `Esta nota fiscal já foi lançada anteriormente (NF nº ${existing.numberNF}, em ${existing.issueDate || existing.receiveDate}).`,
          });
        }
      }

      res.json({ success: true, data: parsedData });
    } catch (error: any) {
      console.warn('API Warning /api/nfe/import-xml:', error.message);
      res.status(400).json({ error: error.message || 'Erro ao processar o arquivo XML da NF-e' });
    }
  });

  // Entrada por Nota Fiscal: Exige canAddNFEntries
  app.post('/api/nf-entries', requireAuth, requirePermission('canAddNFEntries'), async (req, res) => {
    try {
      const nfData = req.body;

      // Validação de Chave de Acesso Duplicada
      if (nfData.accessKey && String(nfData.accessKey).trim()) {
        const cleanKey = String(nfData.accessKey).trim();
        const existing = await getNFEntryByAccessKey(cleanKey);
        if (existing && existing.id !== nfData.id) {
          return res.status(400).json({
            error: `Esta nota fiscal já foi lançada anteriormente (NF nº ${existing.numberNF}, em ${existing.issueDate || existing.receiveDate}).`,
          });
        }
      }

      const saved = await processNFEntry(nfData);
      res.json(saved);
    } catch (error: any) {
      console.error('API Error POST /api/nf-entries:', error);
      res.status(500).json({ error: error.message || 'Erro ao registrar e processar NF no PostgreSQL' });
    }
  });

  // Exclusão de Nota Fiscal com Reversão de Estoque: Exige canDeleteNFEntries
  app.delete('/api/nf-entries/:id', requireAuth, requirePermission('canDeleteNFEntries'), async (req, res) => {
    try {
      const { id } = req.params;
      const result = await deleteNFEntryById(id);
      res.json(result);
    } catch (error: any) {
      console.error('API Error DELETE /api/nf-entries/:id:', error);
      res.status(400).json({ error: error.message || 'Erro ao excluir Nota Fiscal' });
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

  // ZERAR TODO O SISTEMA: Exige requireAuth + requirePermission('canWipeSystem') (Exclusivo Super Admin/Admin) + Validação de PIN
  app.delete('/api/system/wipe', requireAuth, requirePermission('canWipeSystem'), async (req: AuthRequest, res) => {
    try {
      const { pin } = req.body || {};
      const dbUser = (req as any).dbUser;

      if (!pin || typeof pin !== 'string') {
        return res.status(400).json({ error: 'PIN de administrador é obrigatório para confirmar a exclusão do sistema.' });
      }

      const inputPin = pin.trim();
      const userPin = (dbUser?.pin || '').trim();

      let isPinValid = false;
      // 1. Verifica se o PIN digitado coincide exatamente com o PIN cadastrado do usuário logado
      if (userPin && inputPin === userPin) {
        isPinValid = true;
      } else {
        // 2. Se o usuário logado não tiver PIN definido ou digitou outro PIN de gestão, verifica se coincide com o PIN cadastrado de outro super_admin / admin
        const allDbUsers = await getAllUsersFromDb();
        isPinValid = allDbUsers.some(
          (u) =>
            (u.role === 'super_admin' || u.role === 'admin') &&
            u.pin &&
            u.pin.trim() !== '' &&
            u.pin.trim() === inputPin
        );
      }

      if (!isPinValid) {
        console.warn(`[Segurança] Tentativa de wipe do sistema com PIN incorreto pelo usuário UID=${req.user?.uid} (${req.user?.email})`);
        return res.status(403).json({ error: 'PIN de administrador incorreto. Digite o PIN real cadastrado no seu perfil de administrador.' });
      }

      const result = await wipeAllStockData();

      if (!result || !result.success) {
        return res.status(500).json({ error: result?.message || 'Falha ao executar exclusão dos dados no banco de dados.' });
      }

      res.json(result);
    } catch (error: any) {
      console.error('API Error DELETE /api/system/wipe:', error);
      res.status(500).json({ error: error.message || 'Erro ao zerar dados do sistema no banco PostgreSQL / Supabase' });
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
