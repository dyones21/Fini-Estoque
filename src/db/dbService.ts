import { db, isPostgresConfigured, withRetry } from './index.ts';
import { products, stockMovements, nfEntries, nfItems, storeSales } from './schema.ts';
import { eq } from 'drizzle-orm';
import { Product, StockMovement, NFEntry, Sale } from '../types.ts';
import { INITIAL_PRODUCTS, INITIAL_MOVEMENTS, INITIAL_NF_ENTRIES } from '../data/initialData.ts';

// In-memory fallback stores
let inMemoryProducts: Product[] = [...INITIAL_PRODUCTS];
let inMemoryMovements: StockMovement[] = [...INITIAL_MOVEMENTS];
let inMemoryNFEntries: NFEntry[] = [...INITIAL_NF_ENTRIES];
let inMemorySales: Sale[] = [];

/**
 * Fetch all products from PostgreSQL / In-memory store
 */
export async function getAllProducts(): Promise<Product[]> {
  if (isPostgresConfigured && db) {
    try {
      return await withRetry(async () => {
        const rows = await db.select().from(products);
        if (rows && rows.length > 0) {
          const mapped = rows.map((r) => ({
            id: r.id,
            sku: r.sku,
            ean: r.ean,
            name: r.name,
            category: r.category as any,
            unit: r.unit as any,
            stockDeposito: r.stockDeposito,
            stockLoja: r.stockLoja,
            minStockDeposito: r.minStockDeposito,
            minStockLoja: r.minStockLoja,
            costPrice: r.costPrice,
            sellPrice: r.sellPrice,
            expirationDate: r.expirationDate,
            batchNumber: r.batchNumber,
            lastUpdated: r.updatedAt ? r.updatedAt.toISOString() : new Date().toISOString(),
            totalSalesQuantity: 0,
            totalSalesValue: 0,
          }));
          inMemoryProducts = mapped;
          return mapped;
        }
        return inMemoryProducts;
      });
    } catch (error) {
      console.warn('⚠️ [Postgres Fallback] Falha ao buscar produtos no PostgreSQL:', error);
    }
  }

  return inMemoryProducts;
}

/**
 * Upsert/Save product in PostgreSQL / In-memory store
 */
export async function saveProduct(p: Product): Promise<Product> {
  // Update in-memory store
  const idx = inMemoryProducts.findIndex((item) => item.id === p.id);
  if (idx >= 0) {
    inMemoryProducts[idx] = { ...p, lastUpdated: new Date().toISOString() };
  } else {
    inMemoryProducts.push({ ...p, lastUpdated: new Date().toISOString() });
  }

  if (isPostgresConfigured && db) {
    try {
      await withRetry(async () => {
        await db
          .insert(products)
          .values({
            id: p.id,
            sku: p.sku,
            ean: p.ean,
            name: p.name,
            category: p.category,
            unit: p.unit,
            stockDeposito: p.stockDeposito,
            stockLoja: p.stockLoja,
            minStockDeposito: p.minStockDeposito,
            minStockLoja: p.minStockLoja,
            costPrice: p.costPrice,
            sellPrice: p.sellPrice,
            expirationDate: p.expirationDate,
            batchNumber: p.batchNumber,
            updatedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: products.id,
            set: {
              sku: p.sku,
              ean: p.ean,
              name: p.name,
              category: p.category,
              unit: p.unit,
              stockDeposito: p.stockDeposito,
              stockLoja: p.stockLoja,
              minStockDeposito: p.minStockDeposito,
              minStockLoja: p.minStockLoja,
              costPrice: p.costPrice,
              sellPrice: p.sellPrice,
              expirationDate: p.expirationDate,
              batchNumber: p.batchNumber,
              updatedAt: new Date(),
            },
          });
      });
    } catch (error) {
      console.warn('⚠️ [Postgres Fallback] Falha ao salvar produto no PostgreSQL:', error);
    }
  }

  return p;
}

/**
 * Delete product by ID from PostgreSQL / In-memory store
 */
export async function deleteProductById(id: string): Promise<boolean> {
  inMemoryProducts = inMemoryProducts.filter((p) => p.id !== id);

  if (isPostgresConfigured && db) {
    try {
      await withRetry(async () => {
        const res = await db.delete(products).where(eq(products.id, id));
        return Boolean(res.rowCount && res.rowCount > 0);
      });
    } catch (error) {
      console.warn('⚠️ [Postgres Fallback] Falha ao remover produto no PostgreSQL:', error);
    }
  }

  return true;
}

/**
 * Fetch all stock movements from PostgreSQL / In-memory store
 */
export async function getAllMovements(): Promise<StockMovement[]> {
  if (isPostgresConfigured && db) {
    try {
      return await withRetry(async () => {
        const rows = await db.select().from(stockMovements);
        if (rows && rows.length > 0) {
          const mapped = rows.map((r) => ({
            id: r.id,
            date: r.timestamp,
            productId: r.productId,
            productName: r.productName,
            type: r.type as any,
            quantity: r.quantity,
            location: (r.destination === 'Loja Nova Friburgo' ? 'loja' : 'deposito') as any,
            reason: r.reason || undefined,
            userName: r.createdBy,
          }));
          inMemoryMovements = mapped;
          return mapped;
        }
        return inMemoryMovements;
      });
    } catch (error) {
      console.warn('⚠️ [Postgres Fallback] Falha ao buscar movimentações no PostgreSQL:', error);
    }
  }

  return inMemoryMovements;
}

/**
 * Insert stock movement
 */
export async function insertMovement(m: StockMovement): Promise<StockMovement> {
  inMemoryMovements.unshift(m);

  if (isPostgresConfigured && db) {
    try {
      await withRetry(async () => {
        await db
          .insert(stockMovements)
          .values({
            id: m.id,
            productId: m.productId,
            productName: m.productName,
            type: m.type,
            origin: m.location === 'deposito' ? 'Depósito Central' : 'Loja Nova Friburgo',
            destination: m.location === 'loja' ? 'Loja Nova Friburgo' : 'Depósito Central',
            quantity: m.quantity,
            batchNumber: 'LOTE-DEFAULT',
            reason: m.reason || 'Movimentação de estoque',
            createdBy: m.userName || 'Sistema',
            timestamp: m.date || new Date().toISOString(),
          })
          .onConflictDoNothing();
      });
    } catch (error) {
      console.warn('⚠️ [Postgres Fallback] Falha ao inserir movimentação no PostgreSQL:', error);
    }
  }

  return m;
}

/**
 * Fetch all NF Entries with nested items from PostgreSQL / In-memory store
 */
export async function getAllNFEntries(): Promise<NFEntry[]> {
  if (isPostgresConfigured && db) {
    try {
      return await withRetry(async () => {
        const entries = await db.select().from(nfEntries);
        const items = await db.select().from(nfItems);

        if (entries && entries.length > 0) {
          const mapped = entries.map((entry) => {
            const entryItems = items
              .filter((item) => item.nfId === entry.id)
              .map((item) => ({
                productId: item.productId,
                productName: item.productName,
                quantity: item.quantity,
                costPrice: item.costPrice,
                totalCost: item.totalCost,
                batchNumber: item.batchNumber || '',
                expirationDate: item.expirationDate || '',
              }));

            return {
              id: entry.id,
              numberNF: entry.numberNF,
              accessKey: entry.accessKey || undefined,
              supplier: entry.supplier,
              cnpjSupplier: entry.cnpjSupplier,
              issueDate: entry.issueDate,
              receiveDate: entry.createdAt,
              totalValue: entry.totalValue,
              notes: entry.notes || undefined,
              createdBy: entry.createdBy,
              items: entryItems,
            };
          });
          inMemoryNFEntries = mapped;
          return mapped;
        }
        return inMemoryNFEntries;
      });
    } catch (error) {
      console.warn('⚠️ [Postgres Fallback] Falha ao buscar notas fiscais no PostgreSQL:', error);
    }
  }

  return inMemoryNFEntries;
}

/**
 * Insert or Update NF Entry with items in PostgreSQL / In-memory store
 */
export async function insertNFEntry(nf: NFEntry): Promise<NFEntry> {
  const existingIdx = inMemoryNFEntries.findIndex((item) => item.id === nf.id);
  if (existingIdx >= 0) {
    inMemoryNFEntries[existingIdx] = nf;
  } else {
    inMemoryNFEntries.unshift(nf);
  }

  if (isPostgresConfigured && db) {
    try {
      await withRetry(async () => {
        await db
          .insert(nfEntries)
          .values({
            id: nf.id,
            numberNF: nf.numberNF,
            accessKey: nf.accessKey || '',
            supplier: nf.supplier,
            cnpjSupplier: nf.cnpjSupplier,
            issueDate: nf.issueDate,
            totalValue: nf.totalValue,
            notes: nf.notes || '',
            createdBy: nf.createdBy || 'Operador',
            createdAt: nf.receiveDate || new Date().toISOString(),
          })
          .onConflictDoUpdate({
            target: nfEntries.id,
            set: {
              numberNF: nf.numberNF,
              accessKey: nf.accessKey || '',
              supplier: nf.supplier,
              cnpjSupplier: nf.cnpjSupplier,
              issueDate: nf.issueDate,
              totalValue: nf.totalValue,
              notes: nf.notes || '',
              createdBy: nf.createdBy || 'Operador',
              createdAt: nf.receiveDate || new Date().toISOString(),
            },
          });

        // Delete existing items for this entry to prevent duplicates
        await db.delete(nfItems).where(eq(nfItems.nfId, nf.id));

        // Insert updated items
        if (nf.items && nf.items.length > 0) {
          for (const item of nf.items) {
            await db.insert(nfItems).values({
              nfId: nf.id,
              productId: item.productId,
              productName: item.productName,
              quantity: item.quantity,
              costPrice: item.costPrice,
              totalCost: item.totalCost,
              batchNumber: item.batchNumber || 'LOTE-PADRAO',
              expirationDate: item.expirationDate || new Date().toISOString().slice(0, 10),
            });
          }
        }
      });
    } catch (error) {
      console.warn('⚠️ [Postgres Fallback] Falha ao registrar NF no PostgreSQL:', error);
    }
  }

  return nf;
}

/**
 * Fetch all store sales from PostgreSQL / In-memory store
 */
export async function getAllSales(): Promise<Sale[]> {
  if (isPostgresConfigured && db) {
    try {
      return await withRetry(async () => {
        const rows = await db.select().from(storeSales);
        if (rows && rows.length > 0) {
          const mapped = rows.map((r) => ({
            id: r.id,
            productId: r.productId,
            productName: r.productName,
            quantity: r.quantity,
            unitPrice: r.unitPrice,
            totalAmount: r.totalAmount,
            paymentMethod: r.paymentMethod as any,
            sellerName: r.sellerName,
            timestamp: r.timestamp,
          }));
          inMemorySales = mapped;
          return mapped;
        }
        return inMemorySales;
      });
    } catch (error) {
      console.warn('⚠️ [Postgres Fallback] Falha ao buscar vendas no PostgreSQL:', error);
    }
  }

  return inMemorySales;
}

/**
 * Insert store sale
 */
export async function insertSale(s: Sale): Promise<Sale> {
  inMemorySales.unshift(s);

  if (isPostgresConfigured && db) {
    try {
      await withRetry(async () => {
        await db
          .insert(storeSales)
          .values({
            id: s.id,
            productId: s.productId,
            productName: s.productName,
            quantity: s.quantity,
            unitPrice: s.unitPrice,
            totalAmount: s.totalAmount,
            paymentMethod: s.paymentMethod,
            sellerName: s.sellerName,
            timestamp: s.timestamp,
          })
          .onConflictDoNothing();
      });
    } catch (error) {
      console.warn('⚠️ [Postgres Fallback] Falha ao salvar venda no PostgreSQL:', error);
    }
  }

  return s;
}

/**
 * Wipe all stock-related tables in PostgreSQL / In-memory store.
 */
export async function wipeAllStockData(): Promise<{ success: boolean; message: string }> {
  inMemoryProducts = [];
  inMemoryMovements = [];
  inMemoryNFEntries = [];
  inMemorySales = [];

  if (isPostgresConfigured && db) {
    try {
      await withRetry(async () => {
        await db.transaction(async (tx: any) => {
          await tx.delete(nfItems);
          await tx.delete(nfEntries);
          await tx.delete(stockMovements);
          await tx.delete(storeSales);
          await tx.delete(products);
        });
      });
    } catch (error) {
      console.warn('⚠️ [Postgres Fallback] Falha ao zerar tabelas no PostgreSQL:', error);
    }
  }

  return {
    success: true,
    message: 'Todos os registros de produtos, estoque, notas fiscais, movimentações e vendas foram apagados com sucesso.',
  };
}
