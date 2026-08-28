import { db, pool, isPostgresConfigured, withRetry } from './index.ts';
import { products, stockMovements, nfEntries, nfItems, storeSales, companyInfo, categories } from './schema.ts';
import { eq, asc } from 'drizzle-orm';
import { Product, StockMovement, NFEntry, Sale, CompanyInfo } from '../types.ts';

export const DEFAULT_CATEGORIES = [
  'Balas de Gelatina',
  'Marshmallows',
  'Regaliz & Tubes',
  'Chicletes',
  'Balas Azedas',
  'Caixas & Displays',
  'Linha Importada & Especiais',
];

let schemaCheckPromise: Promise<void> | null = null;

/**
 * Garante automaticamente a criação/migração de colunas e índices essenciais no PostgreSQL em runtime.
 */
export async function ensureDbSchema(): Promise<void> {
  if (!isPostgresConfigured || !pool) return;
  if (schemaCheckPromise) return schemaCheckPromise;

  schemaCheckPromise = (async () => {
    try {
      await pool.query(`
        ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS nf_entry_id TEXT;
        CREATE UNIQUE INDEX IF NOT EXISTS nf_entries_access_key_unique_idx 
          ON nf_entries (access_key) 
          WHERE access_key != '' AND access_key IS NOT NULL;
        ALTER TABLE company_info ADD COLUMN IF NOT EXISTS default_markup_percent DOUBLE PRECISION DEFAULT 85;
      `);
    } catch (err: any) {
      console.warn('Auto-schema check notice:', err.message);
    }
  })();

  return schemaCheckPromise;
}

function checkDbConnection() {
  if (!isPostgresConfigured || !db) {
    throw new Error('Banco de dados PostgreSQL / Supabase não está configurado ou acessível.');
  }
}

/**
 * Busca todos os produtos diretamente do PostgreSQL.
 * Lança erro caso o banco esteja inacessível.
 */
export async function getAllProducts(): Promise<Product[]> {
  checkDbConnection();

  return await withRetry(async () => {
    const rows = await db.select().from(products);
    if (!rows || rows.length === 0) {
      return [];
    }

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
  });
}

/**
 * Insere ou atualiza um produto diretamente no PostgreSQL.
 * Lança erro caso o banco esteja inacessível ou ocorra falha.
 */
export async function saveProduct(p: Product): Promise<Product> {
  checkDbConnection();

  const eanVal = p.ean || (p as any).codeEAN || '';
  const skuVal = p.sku || `SKU-${Date.now().toString().slice(-6)}`;
  const batchVal = p.batchNumber || `LOTE-${new Date().getFullYear()}`;
  const expVal = p.expirationDate || '2027-12-31';
  const depStock = Math.round(Number(p.stockDeposito) || 0);
  const lojStock = Math.round(Number(p.stockLoja) || 0);
  const minDep = Math.round(Number(p.minStockDeposito) || 10);
  const minLoj = Math.round(Number(p.minStockLoja) || 5);
  const cost = Number(p.costPrice) || 0;
  const sell = Number(p.sellPrice) || 0;

  await withRetry(async () => {
    await db
      .insert(products)
      .values({
        id: p.id,
        sku: skuVal,
        ean: eanVal,
        name: p.name || 'Produto Fini',
        category: p.category || 'Balas de Gelatina',
        unit: p.unit || 'Pacote 500g',
        stockDeposito: depStock,
        stockLoja: lojStock,
        minStockDeposito: minDep,
        minStockLoja: minLoj,
        costPrice: cost,
        sellPrice: sell,
        expirationDate: expVal,
        batchNumber: batchVal,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: products.id,
        set: {
          sku: skuVal,
          ean: eanVal,
          name: p.name || 'Produto Fini',
          category: p.category || 'Balas de Gelatina',
          unit: p.unit || 'Pacote 500g',
          stockDeposito: depStock,
          stockLoja: lojStock,
          minStockDeposito: minDep,
          minStockLoja: minLoj,
          costPrice: cost,
          sellPrice: sell,
          expirationDate: expVal,
          batchNumber: batchVal,
          updatedAt: new Date(),
        },
      });
  });

  return {
    ...p,
    sku: skuVal,
    ean: eanVal,
    stockDeposito: depStock,
    stockLoja: lojStock,
    costPrice: cost,
    sellPrice: sell,
  };
}

/**
 * Atualiza campos parciais de um produto existente no PostgreSQL por ID.
 * Mescla os campos alterados com o produto existente sem apagar dados não enviados.
 * Retorna null caso o produto não seja encontrado.
 */
export async function updateProductById(id: string, updates: Partial<Product>): Promise<Product | null> {
  checkDbConnection();

  return await withRetry(async () => {
    const existing = await db.select().from(products).where(eq(products.id, id));
    
    if (!existing || existing.length === 0) {
      return null;
    }

    const current = existing[0];
    const eanVal = updates.ean !== undefined ? String(updates.ean) : (updates as any)?.codeEAN !== undefined ? String((updates as any)?.codeEAN) : current.ean;
    const skuVal = updates.sku !== undefined ? String(updates.sku) : current.sku;
    const nameVal = updates.name !== undefined ? String(updates.name) : current.name;
    const categoryVal = updates.category !== undefined ? String(updates.category) : current.category;
    const unitVal = updates.unit !== undefined ? String(updates.unit) : current.unit;
    const depStock = updates.stockDeposito !== undefined ? Math.round(Number(updates.stockDeposito) || 0) : current.stockDeposito;
    const lojStock = updates.stockLoja !== undefined ? Math.round(Number(updates.stockLoja) || 0) : current.stockLoja;
    const minDep = updates.minStockDeposito !== undefined ? Math.round(Number(updates.minStockDeposito) || 0) : current.minStockDeposito;
    const minLoj = updates.minStockLoja !== undefined ? Math.round(Number(updates.minStockLoja) || 0) : current.minStockLoja;
    const cost = updates.costPrice !== undefined ? Number(updates.costPrice) || 0 : current.costPrice;
    const sell = updates.sellPrice !== undefined ? Number(updates.sellPrice) || 0 : current.sellPrice;
    const expVal = updates.expirationDate !== undefined ? String(updates.expirationDate) : current.expirationDate;
    const batchVal = updates.batchNumber !== undefined ? String(updates.batchNumber) : current.batchNumber;

    await db
      .update(products)
      .set({
        sku: skuVal,
        ean: eanVal,
        name: nameVal,
        category: categoryVal,
        unit: unitVal,
        stockDeposito: depStock,
        stockLoja: lojStock,
        minStockDeposito: minDep,
        minStockLoja: minLoj,
        costPrice: cost,
        sellPrice: sell,
        expirationDate: expVal,
        batchNumber: batchVal,
        updatedAt: new Date(),
      })
      .where(eq(products.id, id));

    return {
      id,
      sku: skuVal,
      ean: eanVal,
      name: nameVal,
      category: categoryVal as any,
      unit: unitVal as any,
      stockDeposito: depStock,
      stockLoja: lojStock,
      minStockDeposito: minDep,
      minStockLoja: minLoj,
      costPrice: cost,
      sellPrice: sell,
      expirationDate: expVal,
      batchNumber: batchVal,
      lastUpdated: new Date().toISOString(),
      totalSalesQuantity: 0,
      totalSalesValue: 0,
    };
  });
}

/**
 * Remove um produto por ID diretamente do PostgreSQL.
 * Lança erro caso a query falhe.
 */
export async function deleteProductById(id: string): Promise<boolean> {
  checkDbConnection();

  return await withRetry(async () => {
    const res = await db.delete(products).where(eq(products.id, id));
    return Boolean(res.rowCount && res.rowCount > 0);
  });
}

/**
 * Busca todas as movimentações de estoque diretamente do PostgreSQL.
 * Lança erro caso o banco esteja inacessível.
 */
export async function getAllMovements(): Promise<StockMovement[]> {
  checkDbConnection();

  return await withRetry(async () => {
    const rows = await db.select().from(stockMovements);
    if (!rows || rows.length === 0) {
      return [];
    }

    return rows.map((r) => ({
      id: r.id,
      date: r.timestamp,
      productId: r.productId,
      productName: r.productName,
      type: r.type as any,
      quantity: r.quantity,
      location: (r.destination === 'Loja Nova Friburgo' || r.destination === 'Loja' ? 'loja' : 'deposito') as any,
      reason: r.reason || undefined,
      userName: r.createdBy,
      nfEntryId: r.nfEntryId || undefined,
    }));
  });
}

/**
 * Insere movimentação de estoque diretamente no PostgreSQL.
 * Lança erro caso ocorra falha.
 */
export async function processStockTransfer(transfer: {
  id?: string;
  productId: string;
  productName?: string;
  quantity: number;
  date?: string;
  origin?: string;
  destination?: string;
  operatorName?: string;
  notes?: string;
}): Promise<{ success: boolean; movement: StockMovement; updatedProduct: Product }> {
  checkDbConnection();

  return await withRetry(async () => {
    return await db.transaction(async (tx: any) => {
      const rows = await tx.select().from(products).where(eq(products.id, transfer.productId));
      if (!rows || rows.length === 0) {
        throw new Error('Produto não localizado no banco de dados.');
      }
      const prod = rows[0];

      if (prod.stockDeposito < transfer.quantity) {
        throw new Error(`Estoque insuficiente no Depósito Central (${prod.stockDeposito} disponível).`);
      }

      const newStockDeposito = prod.stockDeposito - transfer.quantity;
      const newStockLoja = prod.stockLoja + transfer.quantity;

      await tx
        .update(products)
        .set({
          stockDeposito: newStockDeposito,
          stockLoja: newStockLoja,
          updatedAt: new Date(),
        })
        .where(eq(products.id, transfer.productId));

      const movementId = transfer.id
        ? transfer.id.startsWith('mov-')
          ? transfer.id
          : `mov-${transfer.id}`
        : `mov-transf-${Date.now()}`;
      const timestamp = transfer.date || new Date().toISOString();
      const createdBy = transfer.operatorName || 'Operador';
      const reasonText = transfer.notes
        ? `Transferência: ${transfer.notes}`
        : 'Transferência Depósito ➔ Loja';

      await tx
        .insert(stockMovements)
        .values({
          id: movementId,
          productId: transfer.productId,
          productName: transfer.productName || prod.name,
          type: 'transferencia_deposito_loja',
          origin: 'Depósito Central',
          destination: 'Loja',
          quantity: transfer.quantity,
          batchNumber: prod.batchNumber || 'LOTE-DEFAULT',
          reason: reasonText,
          createdBy,
          timestamp,
        })
        .onConflictDoNothing();

      return {
        success: true,
        movement: {
          id: movementId,
          productId: transfer.productId,
          productName: transfer.productName || prod.name,
          type: 'transferencia_deposito_loja' as any,
          quantity: transfer.quantity,
          location: 'ambos' as any,
          date: timestamp,
          userName: createdBy,
          reason: reasonText,
          unitPrice: prod.sellPrice,
        },
        updatedProduct: {
          id: prod.id,
          sku: prod.sku,
          ean: prod.ean,
          name: prod.name,
          category: prod.category as any,
          unit: prod.unit as any,
          stockDeposito: newStockDeposito,
          stockLoja: newStockLoja,
          minStockDeposito: prod.minStockDeposito,
          minStockLoja: prod.minStockLoja,
          costPrice: prod.costPrice,
          sellPrice: prod.sellPrice,
          expirationDate: prod.expirationDate,
          batchNumber: prod.batchNumber,
          lastUpdated: new Date().toISOString(),
          totalSalesQuantity: 0,
          totalSalesValue: 0,
        },
      };
    });
  });
}

export async function insertMovement(m: StockMovement): Promise<StockMovement> {
  checkDbConnection();

  await withRetry(async () => {
    await db
      .insert(stockMovements)
      .values({
        id: m.id,
        productId: m.productId,
        productName: m.productName,
        type: m.type,
        origin: m.location === 'deposito' ? 'Depósito Central' : 'Loja',
        destination: m.location === 'loja' ? 'Loja' : 'Depósito Central',
        quantity: m.quantity,
        batchNumber: 'LOTE-DEFAULT',
        reason: m.reason || 'Movimentação de estoque',
        createdBy: m.userName || 'Sistema',
        timestamp: m.date || new Date().toISOString(),
        nfEntryId: m.nfEntryId || null,
      })
      .onConflictDoNothing();
  });

  return m;
}

/**
 * Busca todas as notas fiscais e seus itens diretamente do PostgreSQL.
 * Lança erro caso o banco esteja inacessível.
 */
export async function getAllNFEntries(): Promise<NFEntry[]> {
  checkDbConnection();

  return await withRetry(async () => {
    const entries = await db.select().from(nfEntries);
    const items = await db.select().from(nfItems);

    if (!entries || entries.length === 0) {
      return [];
    }

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
          freightAllocated: item.freightAllocated || 0,
          insuranceAllocated: item.insuranceAllocated || 0,
          otherExpensesAllocated: item.otherExpensesAllocated || 0,
          discountAllocated: item.discountAllocated || 0,
          icmsStAllocated: item.icmsStAllocated || 0,
          ipiAllocated: item.ipiAllocated || 0,
          iiAllocated: item.iiAllocated || 0,
          difalAllocated: item.difalAllocated || 0,
          recoverableTaxesAllocated: item.recoverableTaxesAllocated || 0,
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
  });
}

/**
 * Busca uma nota fiscal pela chave de acesso (accessKey).
 */
export async function getNFEntryByAccessKey(accessKey: string): Promise<NFEntry | null> {
  checkDbConnection();
  const cleanKey = (accessKey || '').trim();
  if (!cleanKey) return null;

  return await withRetry(async () => {
    const rows = await db
      .select()
      .from(nfEntries)
      .where(eq(nfEntries.accessKey, cleanKey))
      .limit(1);

    if (!rows || rows.length === 0) return null;
    const r = rows[0];
    return {
      id: r.id,
      numberNF: r.numberNF,
      accessKey: r.accessKey || undefined,
      supplier: r.supplier,
      cnpjSupplier: r.cnpjSupplier,
      issueDate: r.issueDate,
      receiveDate: r.createdAt,
      totalValue: r.totalValue,
      notes: r.notes || undefined,
      createdBy: r.createdBy,
      items: [],
    };
  });
}

/**
 * Processa a entrada de Nota Fiscal e seus itens no PostgreSQL em transação atômica rigorosa.
 * Persiste a NF em nf_entries, os itens em nf_items, atualiza o stockDeposito dos produtos e
 * registra as movimentações em stock_movements com vínculo nfEntryId.
 * Se qualquer etapa falhar, toda a transação é revertida.
 */
export async function processNFEntry(nf: NFEntry): Promise<NFEntry> {
  checkDbConnection();

  return await withRetry(async () => {
    return await db.transaction(async (tx: any) => {
      const cleanAccessKey = (nf.accessKey || '').trim();

      await tx
        .insert(nfEntries)
        .values({
          id: nf.id,
          numberNF: nf.numberNF,
          accessKey: cleanAccessKey,
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
            accessKey: cleanAccessKey,
            supplier: nf.supplier,
            cnpjSupplier: nf.cnpjSupplier,
            issueDate: nf.issueDate,
            totalValue: nf.totalValue,
            notes: nf.notes || '',
            createdBy: nf.createdBy || 'Operador',
            createdAt: nf.receiveDate || new Date().toISOString(),
          },
        });

      // Remove itens e movimentações anteriores da NF para evitar duplicidade em updates
      await tx.delete(nfItems).where(eq(nfItems.nfId, nf.id));
      await tx.delete(stockMovements).where(eq(stockMovements.nfEntryId, nf.id));

      // Insere os novos itens da NF, atualiza estoque do produto e cria movimentações
      if (nf.items && nf.items.length > 0) {
        for (const item of nf.items) {
          // 1. Insere item da NF
          await tx.insert(nfItems).values({
            nfId: nf.id,
            productId: item.productId,
            productName: item.productName,
            quantity: item.quantity,
            costPrice: item.costPrice,
            totalCost: item.totalCost,
            batchNumber: item.batchNumber || 'LOTE-PADRAO',
            expirationDate: item.expirationDate || new Date().toISOString().slice(0, 10),
            freightAllocated: item.freightAllocated || 0,
            insuranceAllocated: item.insuranceAllocated || 0,
            otherExpensesAllocated: item.otherExpensesAllocated || 0,
            discountAllocated: item.discountAllocated || 0,
            icmsStAllocated: item.icmsStAllocated || 0,
            ipiAllocated: item.ipiAllocated || 0,
            iiAllocated: item.iiAllocated || 0,
            difalAllocated: item.difalAllocated || 0,
            recoverableTaxesAllocated: item.recoverableTaxesAllocated || 0,
          });

          // 2. Atualiza estoque no Depósito Central e preço de custo no cadastro do produto
          const prodRows = await tx.select().from(products).where(eq(products.id, item.productId));
          if (prodRows && prodRows.length > 0) {
            const currentProd = prodRows[0];
            await tx
              .update(products)
              .set({
                stockDeposito: currentProd.stockDeposito + item.quantity,
                costPrice: item.costPrice > 0 ? item.costPrice : currentProd.costPrice,
                batchNumber: item.batchNumber || currentProd.batchNumber,
                expirationDate: item.expirationDate || currentProd.expirationDate,
                updatedAt: new Date(),
              })
              .where(eq(products.id, item.productId));
          } else {
            throw new Error(
              `Produto "${item.productName}" (ID: ${item.productId}) não foi encontrado no banco de dados para atualização de estoque.`
            );
          }

          // 3. Registra movimentação de entrada vinculada à NF (nfEntryId)
          const movementId = `mov-nf-${nf.id}-${item.productId}-${Date.now()}`;
          await tx.insert(stockMovements).values({
            id: movementId,
            productId: item.productId,
            productName: item.productName,
            type: 'entrada_nf',
            origin: nf.supplier || 'Fornecedor NF',
            destination: 'Depósito Central',
            quantity: item.quantity,
            batchNumber: item.batchNumber || 'LOTE-PADRAO',
            reason: `Entrada por NF ${nf.numberNF} (${nf.supplier || 'Fornecedor'})`,
            createdBy: nf.createdBy || 'Operador',
            timestamp: nf.receiveDate || new Date().toISOString(),
            nfEntryId: nf.id,
          });
        }
      }

      return nf;
    });
  });
}

/**
 * Alias de retrocompatibilidade para processNFEntry.
 */
export const insertNFEntry = processNFEntry;

/**
 * Exclui uma Nota Fiscal lançada e reverte o estoque adicionado no Depósito Central.
 * Executado em transação atômica rigorosa. Se o saldo for insuficiente (estoque já movimentado/vendido),
 * a exclusão é abortada para impedir qualquer estoque negativo.
 */
export async function deleteNFEntryById(id: string): Promise<{ success: boolean; message: string }> {
  checkDbConnection();

  return await withRetry(async () => {
    return await db.transaction(async (tx: any) => {
      // 1. Busca os dados da NF
      const nfRows = await tx.select().from(nfEntries).where(eq(nfEntries.id, id));
      if (!nfRows || nfRows.length === 0) {
        throw new Error('Nota Fiscal não encontrada no banco de dados.');
      }
      const nf = nfRows[0];

      // 2. Busca todas as movimentações de estoque vinculadas a essa NF (nfEntryId)
      const linkedMovements = await tx
        .select()
        .from(stockMovements)
        .where(eq(stockMovements.nfEntryId, id));

      if (!linkedMovements || linkedMovements.length === 0) {
        throw new Error(
          'Esta nota fiscal é antiga e não possui movimentações vinculadas para reversão automática de estoque. A correção deve ser realizada manualmente através do ajuste de estoque.'
        );
      }

      // 3. Agrupa a quantidade a subtrair por produto no Depósito Central
      const qtyToSubtractByProduct: Record<string, { quantity: number; productName: string }> = {};
      for (const mov of linkedMovements) {
        if (!qtyToSubtractByProduct[mov.productId]) {
          qtyToSubtractByProduct[mov.productId] = { quantity: 0, productName: mov.productName };
        }
        qtyToSubtractByProduct[mov.productId].quantity += mov.quantity;
      }

      // 4. Verifica se cada produto possui saldo suficiente no estoque do depósito para subtrair
      for (const [productId, info] of Object.entries(qtyToSubtractByProduct)) {
        const prodRows = await tx.select().from(products).where(eq(products.id, productId));
        if (!prodRows || prodRows.length === 0) {
          throw new Error(
            `Produto "${info.productName}" não foi localizado no cadastro para reversão de estoque.`
          );
        }
        const prod = prodRows[0];

        if (prod.stockDeposito < info.quantity) {
          throw new Error(
            'Não é possível excluir: parte do estoque desta nota já foi movimentado (vendido ou transferido). Ajuste o estoque manualmente em vez de excluir.'
          );
        }
      }

      // 5. Aplica a reversão de estoque no depósito para todos os produtos
      for (const [productId, info] of Object.entries(qtyToSubtractByProduct)) {
        const prodRows = await tx.select().from(products).where(eq(products.id, productId));
        const prod = prodRows[0];
        const newStockDeposito = prod.stockDeposito - info.quantity;

        await tx
          .update(products)
          .set({
            stockDeposito: newStockDeposito,
            updatedAt: new Date(),
          })
          .where(eq(products.id, productId));
      }

      // 6. Apaga movimentações vinculadas
      await tx.delete(stockMovements).where(eq(stockMovements.nfEntryId, id));

      // 7. Apaga itens da NF
      await tx.delete(nfItems).where(eq(nfItems.nfId, id));

      // 8. Apaga a própria NF
      await tx.delete(nfEntries).where(eq(nfEntries.id, id));

      return {
        success: true,
        message: `Nota Fiscal nº ${nf.numberNF} excluída e estoque do depósito revertido com sucesso.`,
      };
    });
  });
}

/**
 * Busca todas as vendas diretamente do PostgreSQL.
 * Lança erro caso o banco esteja inacessível.
 */
export async function getAllSales(): Promise<Sale[]> {
  checkDbConnection();

  return await withRetry(async () => {
    const rows = await db.select().from(storeSales);
    if (!rows || rows.length === 0) {
      return [];
    }

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
  });
}

/**
 * Insere registro de venda diretamente no PostgreSQL.
 * Lança erro se a inserção falhar.
 */
export async function insertSale(s: Sale): Promise<Sale> {
  checkDbConnection();

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

  return s;
}

/**
 * Zera todos os registros operacionais e de estoque no PostgreSQL em transação atômica.
 * Se a exclusão falhar, LANÇA o erro para que a rota HTTP responda com 500 e nunca com falso sucesso.
 */
export async function wipeAllStockData(): Promise<{ success: boolean; message: string }> {
  checkDbConnection();

  await withRetry(async () => {
    await db.transaction(async (tx: any) => {
      await tx.delete(nfItems);
      await tx.delete(nfEntries);
      await tx.delete(stockMovements);
      await tx.delete(storeSales);
      await tx.delete(products);
    });
  });

  return {
    success: true,
    message: 'Todos os registros de produtos, estoque, notas fiscais, movimentações e vendas foram permanentemente apagados do banco de dados.',
  };
}

/**
 * Busca os dados da empresa cadastrada no PostgreSQL.
 * Se não existir nenhum registro ainda, retorna campos vazios com isConfigured: false sem gravar no banco.
 */
export async function getCompanyInfo(): Promise<CompanyInfo> {
  checkDbConnection();

  return await withRetry(async () => {
    const rows = await db.select().from(companyInfo).limit(1);
    if (!rows || rows.length === 0) {
      return {
        id: 'default-company',
        name: '',
        tradeName: '',
        cnpj: '',
        address: '',
        city: '',
        state: '',
        defaultMarkupPercent: 85,
        isConfigured: false,
        active: true,
        isMaster: true,
      };
    }

    const r = rows[0];
    const markup =
      r.defaultMarkupPercent !== null && r.defaultMarkupPercent !== undefined
        ? Number(r.defaultMarkupPercent)
        : 85;

    return {
      id: r.id,
      name: r.name || '',
      tradeName: r.tradeName || '',
      cnpj: r.cnpj || '',
      address: r.address || '',
      city: r.city || '',
      state: r.state || '',
      defaultMarkupPercent: isNaN(markup) || markup < 0 ? 85 : markup,
      isConfigured: Boolean(r.name && r.cnpj),
      active: true,
      isMaster: true,
      updatedAt: r.updatedAt ? r.updatedAt.toISOString() : undefined,
    };
  });
}

/**
 * Salva ou atualiza os dados da empresa no PostgreSQL quando submetido pelo usuário.
 */
export async function saveCompanyInfo(info: Partial<CompanyInfo>): Promise<CompanyInfo> {
  checkDbConnection();

  const id = info.id || 'default-company';
  const name = info.name?.trim() || '';
  const tradeName = info.tradeName?.trim() || '';
  const cnpj = info.cnpj?.trim() || '';
  const address = info.address?.trim() || '';
  const city = info.city?.trim() || '';
  const state = info.state?.trim().toUpperCase() || '';
  const rawMarkup = info.defaultMarkupPercent;
  const defaultMarkupPercent =
    typeof rawMarkup === 'number' && !isNaN(rawMarkup) && rawMarkup >= 0
      ? rawMarkup
      : rawMarkup !== undefined && !isNaN(Number(rawMarkup)) && Number(rawMarkup) >= 0
      ? Number(rawMarkup)
      : 85;

  return await withRetry(async () => {
    await db
      .insert(companyInfo)
      .values({
        id,
        name,
        tradeName,
        cnpj,
        address,
        city,
        state,
        defaultMarkupPercent,
      })
      .onConflictDoUpdate({
        target: companyInfo.id,
        set: {
          name,
          tradeName,
          cnpj,
          address,
          city,
          state,
          defaultMarkupPercent,
          updatedAt: new Date(),
        },
      });

    return {
      id,
      name,
      tradeName,
      cnpj,
      address,
      city,
      state,
      defaultMarkupPercent,
      isConfigured: true,
      active: true,
      isMaster: true,
      updatedAt: new Date().toISOString(),
    };
  });
}

/**
 * Retorna diretamente o CNPJ da empresa salvo no banco de dados para validação de NF-e
 */
export async function getCompanyCnpj(): Promise<string> {
  try {
    const comp = await getCompanyInfo();
    return comp.cnpj ? comp.cnpj.trim() : '';
  } catch (e) {
    return '';
  }
}

/**
 * Busca todas as categorias de produtos cadastradas no PostgreSQL.
 * Na primeira execução, caso a tabela esteja vazia, popula com as categorias padrão (DEFAULT_CATEGORIES).
 */
export async function getAllCategories(): Promise<string[]> {
  checkDbConnection();

  return await withRetry(async () => {
    const rows = await db.select().from(categories).orderBy(asc(categories.name));
    if (!rows || rows.length === 0) {
      const inserted = await db
        .insert(categories)
        .values(DEFAULT_CATEGORIES.map((name) => ({ name })))
        .onConflictDoNothing()
        .returning();

      if (inserted && inserted.length > 0) {
        return inserted.map((c) => c.name).sort();
      }
      return DEFAULT_CATEGORIES;
    }

    return rows.map((r) => r.name);
  });
}

/**
 * Insere uma nova categoria de produto no PostgreSQL.
 */
export async function insertCategory(name: string): Promise<string> {
  checkDbConnection();
  const trimmed = name.trim();
  if (!trimmed) {
    throw new Error('O nome da categoria não pode ser vazio.');
  }

  return await withRetry(async () => {
    await db
      .insert(categories)
      .values({ name: trimmed })
      .onConflictDoNothing();

    return trimmed;
  });
}

