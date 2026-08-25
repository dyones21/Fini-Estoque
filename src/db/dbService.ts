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
      location: (r.destination === 'Loja Nova Friburgo' ? 'loja' : 'deposito') as any,
      reason: r.reason || undefined,
      userName: r.createdBy,
    }));
  });
}

/**
 * Insere movimentação de estoque diretamente no PostgreSQL.
 * Lança erro caso ocorra falha.
 */
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
 * Insere ou atualiza nota fiscal e seus itens no PostgreSQL em transação.
 * Lança erro se o banco falhar.
 */
export async function insertNFEntry(nf: NFEntry): Promise<NFEntry> {
  checkDbConnection();

  await withRetry(async () => {
    await db.transaction(async (tx: any) => {
      await tx
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

      // Remove itens anteriores da NF para evitar duplicidade
      await tx.delete(nfItems).where(eq(nfItems.nfId, nf.id));

      // Insere os novos itens da NF
      if (nf.items && nf.items.length > 0) {
        for (const item of nf.items) {
          await tx.insert(nfItems).values({
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
  });

  return nf;
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
        isConfigured: false,
        active: true,
        isMaster: true,
      };
    }

    const r = rows[0];
    return {
      id: r.id,
      name: r.name || '',
      tradeName: r.tradeName || '',
      cnpj: r.cnpj || '',
      address: r.address || '',
      city: r.city || '',
      state: r.state || '',
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

