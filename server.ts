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
} from './src/db/dbService.ts';

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '10mb' }));

  // Health check endpoint
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', database: 'Cloud SQL PostgreSQL' });
  });

  // PRODUCTS API
  app.get('/api/products', async (req, res) => {
    try {
      const items = await getAllProducts();
      res.json(items);
    } catch (error: any) {
      console.error('API Error /api/products:', error);
      res.status(500).json({ error: error.message || 'Erro ao carregar produtos do Cloud SQL' });
    }
  });

  app.post('/api/products', async (req, res) => {
    try {
      const productData = req.body;
      const saved = await saveProduct(productData);
      res.json(saved);
    } catch (error: any) {
      console.error('API Error POST /api/products:', error);
      res.status(500).json({ error: error.message || 'Erro ao salvar produto no Cloud SQL' });
    }
  });

  app.delete('/api/products/:id', async (req, res) => {
    try {
      await deleteProductById(req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      console.error('API Error DELETE /api/products:', error);
      res.status(500).json({ error: error.message || 'Erro ao deletar produto do Cloud SQL' });
    }
  });

  // STOCK MOVEMENTS API
  app.get('/api/movements', async (req, res) => {
    try {
      const items = await getAllMovements();
      res.json(items);
    } catch (error: any) {
      console.error('API Error /api/movements:', error);
      res.status(500).json({ error: error.message || 'Erro ao carregar movimentações do Cloud SQL' });
    }
  });

  app.post('/api/movements', async (req, res) => {
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
  app.get('/api/nf-entries', async (req, res) => {
    try {
      const entries = await getAllNFEntries();
      res.json(entries);
    } catch (error: any) {
      console.error('API Error /api/nf-entries:', error);
      res.status(500).json({ error: error.message || 'Erro ao carregar NFs do Cloud SQL' });
    }
  });

  app.post('/api/nf-entries', async (req, res) => {
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
  app.get('/api/sales', async (req, res) => {
    try {
      const sales = await getAllSales();
      res.json(sales);
    } catch (error: any) {
      console.error('API Error /api/sales:', error);
      res.status(500).json({ error: error.message || 'Erro ao carregar vendas do Cloud SQL' });
    }
  });

  app.post('/api/sales', async (req, res) => {
    try {
      const saleData = req.body;
      const saved = await insertSale(saleData);
      res.json(saved);
    } catch (error: any) {
      console.error('API Error POST /api/sales:', error);
      res.status(500).json({ error: error.message || 'Erro ao salvar venda no Cloud SQL' });
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
