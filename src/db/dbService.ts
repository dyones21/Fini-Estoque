import { db } from './index.ts';
import { products, stockMovements, nfEntries, nfItems, storeSales } from './schema.ts';
import { eq } from 'drizzle-orm';
import { Product, StockMovement, NFEntry, Sale } from '../types.ts';

/**
 * Fetch all products from Cloud SQL
 */
export async function getAllProducts(): Promise<Product[]> {
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
    console.error('Error fetching products from Cloud SQL:', error);
    throw new Error('Falha ao buscar produtos do banco de dados Cloud SQL', { cause: error });
  }
}

/**
 * Upsert/Save product in Cloud SQL
 */
export async function saveProduct(p: Product): Promise<Product> {
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
    console.error('Error saving product in Cloud SQL:', error);
    throw new Error('Falha ao salvar produto no Cloud SQL', { cause: error });
  }
}

/**
 * Delete product in Cloud SQL
 */
export async function deleteProductById(id: string): Promise<void> {
  try {
    await db.delete(products).where(eq(products.id, id));
  } catch (error) {
    console.error('Error deleting product in Cloud SQL:', error);
    throw new Error('Falha ao excluir produto no Cloud SQL', { cause: error });
  }
}

/**
 * Fetch all stock movements
 */
export async function getAllMovements(): Promise<StockMovement[]> {
  try {
    const rows = await db.select().from(stockMovements);
    return rows.map((r) => ({
      id: r.id,
      date: r.timestamp,
      productId: r.productId,
      productName: r.productName,
      type: r.type as any,
      quantity: r.quantity,
      location: (r.destination === 'loja' ? 'loja' : r.destination === 'deposito' ? 'deposito' : 'ambos') as any,
      unitPrice: 0,
      totalValue: 0,
      reason: r.reason,
      userName: r.createdBy,
    }));
  } catch (error) {
    console.error('Error fetching movements:', error);
    throw new Error('Falha ao buscar movimentações de estoque', { cause: error });
  }
}

/**
 * Insert new stock movement
 */
export async function insertMovement(m: StockMovement): Promise<StockMovement> {
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
        reason: m.reason || 'Movimentação de Estoque',
        createdBy: m.userName || 'Sistema',
        timestamp: m.date || new Date().toISOString(),
      })
      .onConflictDoNothing();
    return m;
  } catch (error) {
    console.error('Error inserting movement:', error);
    throw new Error('Falha ao salvar movimentação no Cloud SQL', { cause: error });
  }
}

/**
 * Fetch all NF Entries with items
 */
export async function getAllNFEntries(): Promise<NFEntry[]> {
  try {
    const entries = await db.select().from(nfEntries);
    const result: NFEntry[] = [];

    for (const entry of entries) {
      const items = await db.select().from(nfItems).where(eq(nfItems.nfId, entry.id));
      result.push({
        id: entry.id,
        numberNF: entry.numberNF,
        accessKey: entry.accessKey || '',
        supplier: entry.supplier,
        cnpjSupplier: entry.cnpjSupplier,
        issueDate: entry.issueDate,
        receiveDate: entry.createdAt ? entry.createdAt.slice(0, 10) : new Date().toISOString().slice(0, 10),
        totalValue: entry.totalValue,
        notes: entry.notes || '',
        createdBy: entry.createdBy,
        items: items.map((i) => ({
          productId: i.productId,
          productName: i.productName,
          quantity: i.quantity,
          costPrice: i.costPrice,
          totalCost: i.totalCost,
          batchNumber: i.batchNumber,
          expirationDate: i.expirationDate,
        })),
      });
    }

    return result;
  } catch (error) {
    console.error('Error fetching NF Entries:', error);
    throw new Error('Falha ao buscar notas fiscais do Cloud SQL', { cause: error });
  }
}

/**
 * Insert NF Entry with items
 */
export async function insertNFEntry(entry: NFEntry): Promise<NFEntry> {
  try {
    await db
      .insert(nfEntries)
      .values({
        id: entry.id,
        numberNF: entry.numberNF,
        accessKey: entry.accessKey || '',
        supplier: entry.supplier,
        cnpjSupplier: entry.cnpjSupplier,
        issueDate: entry.issueDate,
        totalValue: entry.totalValue,
        notes: entry.notes || '',
        createdBy: entry.createdBy,
        createdAt: entry.receiveDate || new Date().toISOString(),
      })
      .onConflictDoNothing();

    if (entry.items && entry.items.length > 0) {
      await db
        .insert(nfItems)
        .values(
          entry.items.map((i) => ({
            nfId: entry.id,
            productId: i.productId,
            productName: i.productName,
            quantity: i.quantity,
            costPrice: i.costPrice,
            totalCost: i.totalCost,
            batchNumber: i.batchNumber,
            expirationDate: i.expirationDate,
          }))
        );
    }

    return entry;
  } catch (error) {
    console.error('Error inserting NF Entry:', error);
    throw new Error('Falha ao inserir Nota Fiscal no Cloud SQL', { cause: error });
  }
}

/**
 * Fetch all store sales
 */
export async function getAllSales(): Promise<Sale[]> {
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
    console.error('Error fetching store sales:', error);
    throw new Error('Falha ao buscar vendas da loja', { cause: error });
  }
}

/**
 * Insert store sale
 */
export async function insertSale(s: Sale): Promise<Sale> {
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
    throw new Error('Falha ao salvar venda da loja no Cloud SQL', { cause: error });
  }
}

/**
 * Realtime Stock Summary diretamente do PostgreSQL
 */
export async function getRealtimeStockSummary() {
  const start = performance.now();
  try {
    const allProds = await getAllProducts();
    const allMovs = await getAllMovements();
    const allSales = await getAllSales();

    let totalDepositoUnits = 0;
    let totalLojaUnits = 0;
    let totalCostValue = 0;
    let totalSellValue = 0;
    let lowStockCount = 0;
    let criticalStockCount = 0;

    const itemsWithMetrics = allProds.map((p) => {
      const totalUnits = p.stockDeposito + p.stockLoja;
      totalDepositoUnits += p.stockDeposito;
      totalLojaUnits += p.stockLoja;
      totalCostValue += totalUnits * p.costPrice;
      totalSellValue += totalUnits * p.sellPrice;

      const isLowDeposito = p.stockDeposito <= p.minStockDeposito;
      const isLowLoja = p.stockLoja <= p.minStockLoja;
      const isZero = totalUnits === 0;

      let status: 'critico' | 'alerta' | 'normal' = 'normal';
      if (isZero || (p.stockDeposito === 0 && p.stockLoja === 0)) {
        status = 'critico';
        criticalStockCount++;
      } else if (isLowDeposito || isLowLoja) {
        status = 'alerta';
        lowStockCount++;
      }

      // Sales for this product
      const pSales = allSales.filter((s) => s.productId === p.id);
      const totalSalesQty = pSales.reduce((acc, s) => acc + (s.quantity || 0), 0);
      const totalSalesVal = pSales.reduce((acc, s) => acc + (s.totalAmount || 0), 0);

      return {
        ...p,
        totalStock: totalUnits,
        totalSalesQuantity: totalSalesQty,
        totalSalesValue: totalSalesVal,
        totalCostValue: Math.round(totalUnits * p.costPrice * 100) / 100,
        totalSellValue: Math.round(totalUnits * p.sellPrice * 100) / 100,
        stockStatus: status,
      };
    });

    const latencyMs = Math.round((performance.now() - start) * 10) / 10;

    return {
      timestamp: new Date().toISOString(),
      latencyMs,
      summary: {
        productsCount: allProds.length,
        totalDepositoUnits,
        totalLojaUnits,
        totalUnits: totalDepositoUnits + totalLojaUnits,
        totalCostValue: Math.round(totalCostValue * 100) / 100,
        totalSellValue: Math.round(totalSellValue * 100) / 100,
        lowStockCount,
        criticalStockCount,
        movementsCount: allMovs.length,
        salesCount: allSales.length,
      },
      products: itemsWithMetrics,
      recentMovements: allMovs.slice(0, 10),
    };
  } catch (error) {
    console.error('Error computing realtime stock summary from PostgreSQL:', error);
    throw new Error('Falha ao gerar sumário de estoque em tempo real do PostgreSQL', { cause: error });
  }
}

