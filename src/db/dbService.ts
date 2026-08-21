import { db, withRetry } from './index.ts';
import { products, stockMovements, nfEntries, nfItems, storeSales } from './schema.ts';
import { eq } from 'drizzle-orm';
import { Product, StockMovement, NFEntry, Sale } from '../types.ts';

/**
 * Fetch all products from PostgreSQL / Supabase
 */
export async function getAllProducts(): Promise<Product[]> {
  return withRetry(async () => {
    try {
      const rows = await db.select().from(products);
      return rows.map((r) => ({
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
    } catch (error) {
      console.error('Error fetching products from database:', error);
      throw new Error('Falha ao buscar produtos do banco de dados', { cause: error });
    }
  });
}

/**
 * Upsert/Save product in PostgreSQL / Supabase
 */
export async function saveProduct(p: Product): Promise<Product> {
  return withRetry(async () => {
    try {
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
      return p;
    } catch (error) {
      console.error('Error saving product in database:', error);
      throw new Error('Falha ao salvar produto no banco de dados', { cause: error });
    }
  });
}

/**
 * Delete product by ID from PostgreSQL / Supabase
 */
export async function deleteProductById(id: string): Promise<boolean> {
  return withRetry(async () => {
    try {
      const res = await db.delete(products).where(eq(products.id, id));
      return Boolean(res.rowCount && res.rowCount > 0);
    } catch (error) {
      console.error('Error deleting product from database:', error);
      throw new Error('Falha ao remover produto do banco de dados', { cause: error });
    }
  });
}

/**
 * Fetch all stock movements from PostgreSQL / Supabase
 */
export async function getAllMovements(): Promise<StockMovement[]> {
  return withRetry(async () => {
    try {
      const rows = await db.select().from(stockMovements);
      return rows.map((r) => ({
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
    } catch (error) {
      console.error('Error fetching movements from database:', error);
      throw new Error('Falha ao buscar movimentações de estoque do banco de dados', { cause: error });
    }
  });
}

/**
 * Insert stock movement
 */
export async function insertMovement(m: StockMovement): Promise<StockMovement> {
  return withRetry(async () => {
    try {
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
      return m;
    } catch (error) {
      console.error('Error inserting movement:', error);
      throw new Error('Falha ao registrar movimentação de estoque no banco de dados', { cause: error });
    }
  });
}

/**
 * Fetch all NF Entries with nested items from PostgreSQL / Supabase
 */
export async function getAllNFEntries(): Promise<NFEntry[]> {
  return withRetry(async () => {
    try {
      const entries = await db.select().from(nfEntries);
      const items = await db.select().from(nfItems);

      return entries.map((entry) => {
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
    } catch (error) {
      console.error('Error fetching NF entries from database:', error);
      throw new Error('Falha ao buscar notas fiscais do banco de dados', { cause: error });
    }
  });
}

/**
 * Insert or Update NF Entry with items in PostgreSQL / Supabase
 */
export async function insertNFEntry(nf: NFEntry): Promise<NFEntry> {
  return withRetry(async () => {
    try {
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

      return nf;
    } catch (error) {
      console.error('Error inserting NF entry in database:', error);
      throw new Error('Falha ao salvar nota fiscal no banco de dados', { cause: error });
    }
  });
}

/**
 * Fetch all store sales from PostgreSQL / Supabase
 */
export async function getAllSales(): Promise<Sale[]> {
  return withRetry(async () => {
    try {
      const rows = await db.select().from(storeSales);
      return rows.map((r) => ({
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
    } catch (error) {
      console.error('Error fetching sales from database:', error);
      throw new Error('Falha ao buscar vendas do banco de dados', { cause: error });
    }
  });
}

/**
 * Insert store sale
 */
export async function insertSale(s: Sale): Promise<Sale> {
  return withRetry(async () => {
    try {
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
      return s;
    } catch (error) {
      console.error('Error inserting store sale:', error);
      throw new Error('Falha ao salvar venda da loja no banco de dados', { cause: error });
    }
  });
}

/**
 * Wipe all stock-related tables in PostgreSQL inside a single atomic transaction.
 * Tables deleted in order: nf_items -> nf_entries -> stock_movements -> store_sales -> products.
 * Note: The 'users' table is strictly preserved to prevent locking out administrators and users.
 */
export async function wipeAllStockData(): Promise<{ success: boolean; message: string }> {
  return withRetry(async () => {
    try {
      await db.transaction(async (tx) => {
        // 1. Delete NF items first (foreign key references nf_entries)
        await tx.delete(nfItems);
        // 2. Delete NF entries
        await tx.delete(nfEntries);
        // 3. Delete Stock Movements
        await tx.delete(stockMovements);
        // 4. Delete Store Sales
        await tx.delete(storeSales);
        // 5. Delete Products
        await tx.delete(products);
      });

      return {
        success: true,
        message: 'Todos os registros de produtos, estoque, notas fiscais, movimentações e vendas foram apagados com sucesso.',
      };
    } catch (error) {
      console.error('Error wiping system stock data in transaction:', error);
      throw new Error('Falha ao zerar dados do sistema no banco de dados. Nenhuma alteração foi realizada (rollback executado).', { cause: error });
    }
  });
}
