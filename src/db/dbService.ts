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
    const rows = await db.select().from(products).orderBy(products.name);
    if (!rows || rows.length === 0) {
      return [];
    }

    return rows.map((r) => ({
      id: r.id,
      sku: r.sku,
      ean: r.ean || '',
      codeEAN: r.ean || '',
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
    codeEAN: eanVal,
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
    const minDep = updates.minStockDeposito !== undefined ? Math.round(Number(updates.minStockDeposito) || 0) : current.minStockDeposito;
    const minLoj = updates.minStockLoja !== undefined ? Math.round(Number(updates.minStockLoja) || 0) : current.minStockLoja;
    const cost = updates.costPrice !== undefined ? Number(updates.costPrice) || 0 : current.costPrice;
    const sell = updates.sellPrice !== undefined ? Number(updates.sellPrice) || 0 : current.sellPrice;
    const expVal = updates.expirationDate !== undefined ? String(updates.expirationDate) : current.expirationDate;
    const batchVal = updates.batchNumber !== undefined ? String(updates.batchNumber) : current.batchNumber;

    // REGRA ABSOLUTA: Cadastro NÃO pode alterar estoque!
    // stockDeposito e stockLoja NUNCA são alterados em updateProductById.
    // O banco preserva rigorosamente os saldos atuais de estoque.
    await db
      .update(products)
      .set({
        sku: skuVal,
        ean: eanVal,
        name: nameVal,
        category: categoryVal,
        unit: unitVal,
        minStockDeposito: minDep,
        minStockLoja: minLoj,
        costPrice: cost,
        sellPrice: sell,
        expirationDate: expVal,
        batchNumber: batchVal,
        updatedAt: new Date(),
      })
      .where(eq(products.id, id));

    // Busca o registro atualizado diretamente do banco para garantir integridade e saldos vigentes
    const [refreshed] = await db.select().from(products).where(eq(products.id, id));

    return {
      id,
      sku: refreshed.sku,
      ean: refreshed.ean || '',
      codeEAN: refreshed.ean || '',
      name: refreshed.name,
      category: refreshed.category as any,
      unit: refreshed.unit as any,
      stockDeposito: refreshed.stockDeposito,
      stockLoja: refreshed.stockLoja,
      minStockDeposito: refreshed.minStockDeposito,
      minStockLoja: refreshed.minStockLoja,
      costPrice: refreshed.costPrice,
      sellPrice: refreshed.sellPrice,
      expirationDate: refreshed.expirationDate,
      batchNumber: refreshed.batchNumber,
      lastUpdated: (refreshed.updatedAt || new Date()).toISOString(),
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
      previousQuantity: r.previousQuantity !== null && r.previousQuantity !== undefined ? r.previousQuantity : undefined,
      lossCategory: r.lossCategory || undefined,
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
      const movementId = transfer.id
        ? transfer.id.startsWith('mov-')
          ? transfer.id
          : `mov-${transfer.id}`
        : `mov-transf-${Date.now()}`;

      // 1. Idempotência: Se a movimentação já foi processada anteriormente, retorna o estado atual sem alterar estoque
      if (transfer.id) {
        const existing = await tx
          .select()
          .from(stockMovements)
          .where(eq(stockMovements.id, movementId))
          .limit(1);

        if (existing && existing.length > 0) {
          const [currentProd] = await tx.select().from(products).where(eq(products.id, transfer.productId));
          return {
            success: true,
            movement: {
              id: existing[0].id,
              productId: existing[0].productId,
              productName: existing[0].productName,
              type: existing[0].type as any,
              quantity: existing[0].quantity,
              location: 'ambos' as any,
              date: existing[0].timestamp,
              userName: existing[0].createdBy,
              reason: existing[0].reason,
              unitPrice: currentProd?.sellPrice || 0,
            },
            updatedProduct: currentProd,
          };
        }
      }

      // 2. Concorrência: Trava a linha do produto no PostgreSQL (SELECT FOR UPDATE)
      const rows = await tx
        .select()
        .from(products)
        .where(eq(products.id, transfer.productId))
        .for('update');

      if (!rows || rows.length === 0) {
        throw new Error('Produto não localizado no banco de dados.');
      }
      const prod = rows[0];

      const qty = Number(transfer.quantity);
      if (isNaN(qty) || qty <= 0) {
        throw new Error('Quantidade inválida para transferência: deve ser maior que zero.');
      }

      // Validação de saldo disponível
      if (prod.stockDeposito < qty) {
        throw new Error(`Operação rejeitada: Saldo insuficiente no Depósito Central (${prod.stockDeposito} disponível, solicitado ${qty}).`);
      }

      const newStockDeposito = prod.stockDeposito - qty;
      const newStockLoja = prod.stockLoja + qty;

      await tx
        .update(products)
        .set({
          stockDeposito: newStockDeposito,
          stockLoja: newStockLoja,
          updatedAt: new Date(),
        })
        .where(eq(products.id, transfer.productId));

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
          quantity: qty,
          batchNumber: prod.batchNumber || 'LOTE-DEFAULT',
          reason: reasonText,
          createdBy,
          timestamp,
        });

      return {
        success: true,
        movement: {
          id: movementId,
          productId: transfer.productId,
          productName: transfer.productName || prod.name,
          type: 'transferencia_deposito_loja' as any,
          quantity: qty,
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

/**
 * Processa movimentação de estoque (venda_loja, perda_avaria, ajuste_inventario)
 * de forma atômica no PostgreSQL dentro de db.transaction com lock de linha (SELECT FOR UPDATE).
 * Atualiza o saldo real em `products` e insere o histórico em `stock_movements`.
 * Rejeita operações que resultariam em estoque negativo (não reduz para zero silenciosamente).
 */
export async function processStockMovement(m: {
  id?: string;
  productId: string;
  productName?: string;
  type: StockMovement['type'];
  quantity: number;
  previousQuantity?: number;
  lossCategory?: string;
  location: 'loja' | 'deposito' | 'ambos';
  reason?: string;
  date?: string;
  userName?: string;
  unitPrice?: number;
  nfEntryId?: string;
}): Promise<{ success: boolean; movement: StockMovement; product: Product }> {
  // 1. Validação estrita de Produto
  if (!m || !m.productId || typeof m.productId !== 'string' || !m.productId.trim()) {
    throw new Error('Produto é obrigatório para registrar a movimentação de estoque.');
  }

  // 2. Whitelist estrita de Tipo de Movimentação
  const ALLOWED_TYPES = ['venda_loja', 'perda_avaria', 'ajuste_inventario'] as const;
  if (!m.type || !ALLOWED_TYPES.includes(m.type as any)) {
    if ((m.type as string) === 'transferencia_deposito_loja') {
      throw new Error('Transferências entre Depósito e Loja devem ser processadas exclusivamente via processStockTransfer().');
    }
    throw new Error(`Tipo de movimentação inválido: "${m.type}". Tipos suportados: ${ALLOWED_TYPES.join(', ')}.`);
  }

  // Validação de motivo obrigatório para perda/avaria e ajuste de inventário
  if (m.type === 'perda_avaria') {
    const hasCategory = Boolean(m.lossCategory && String(m.lossCategory).trim());
    const hasReason = Boolean(m.reason && String(m.reason).trim());
    if (!hasCategory && !hasReason) {
      throw new Error('Categoria e/ou motivo são obrigatórios para registrar perda/avaria.');
    }
  } else if (m.type === 'ajuste_inventario') {
    if (!m.reason || !String(m.reason).trim()) {
      throw new Error('Motivo/justificativa é obrigatório para registrar ajuste de inventário.');
    }
  }

  // 3. Validação de Localização (Location)
  const ALLOWED_LOCATIONS = ['loja', 'deposito', 'ambos'] as const;
  if (!m.location || !ALLOWED_LOCATIONS.includes(m.location as any)) {
    throw new Error(`Localização inválida: "${m.location}". Localizações permitidas: loja, deposito, ambos.`);
  }
  if (m.type === 'venda_loja' && m.location !== 'loja') {
    throw new Error('Para baixa de venda/baleiro (venda_loja), a localização deve ser exclusivamente "loja".');
  }

  // 4. Validação estrita de Quantidade (Rejeita NaN, Infinity, -Infinity, booleans, strings inválidas)
  if (m.quantity === null || m.quantity === undefined || typeof (m as any).quantity === 'boolean' || typeof (m as any).quantity === 'object') {
    throw new Error('Quantidade é obrigatória e deve ser um número válido.');
  }
  const qty = Number(m.quantity);
  if (!Number.isFinite(qty)) {
    throw new Error('Quantidade inválida: deve ser um número finito.');
  }
  if (m.type === 'venda_loja' || m.type === 'perda_avaria') {
    if (qty <= 0) {
      throw new Error(
        m.type === 'venda_loja'
          ? 'Quantidade para baixa de baleiro deve ser maior que zero.'
          : 'Quantidade para registro de perda/avaria deve ser maior que zero.'
      );
    }
  } else if (m.type === 'ajuste_inventario') {
    if (qty < 0) {
      throw new Error('Quantidade para ajuste de inventário não pode ser negativa.');
    }
  }

  checkDbConnection();

  return await withRetry(async () => {
    return await db.transaction(async (tx: any) => {
      const movementId = m.id
        ? m.id.startsWith('mov-') ? m.id : `mov-${m.id}`
        : `mov-${Date.now()}`;

      // 1. Idempotência: Se esta movimentação já foi processada anteriormente com o mesmo ID,
      // não altera o estoque novamente e retorna o produto no estado atual.
      if (m.id) {
        const existingMov = await tx
          .select()
          .from(stockMovements)
          .where(eq(stockMovements.id, movementId))
          .limit(1);

        if (existingMov && existingMov.length > 0) {
          const [currentProd] = await tx.select().from(products).where(eq(products.id, m.productId));
          return {
            success: true,
            movement: {
              id: existingMov[0].id,
              productId: existingMov[0].productId,
              productName: existingMov[0].productName,
              type: existingMov[0].type as any,
              quantity: existingMov[0].quantity,
              previousQuantity: existingMov[0].previousQuantity !== null && existingMov[0].previousQuantity !== undefined ? existingMov[0].previousQuantity : undefined,
              lossCategory: existingMov[0].lossCategory || undefined,
              location: m.location,
              date: existingMov[0].timestamp,
              userName: existingMov[0].createdBy,
              reason: existingMov[0].reason,
              unitPrice: m.unitPrice !== undefined ? m.unitPrice : (currentProd?.sellPrice || 0),
              nfEntryId: existingMov[0].nfEntryId || undefined,
            },
            product: currentProd,
          };
        }
      }

      // 2. Concorrência: Trava a linha do produto no PostgreSQL (SELECT FOR UPDATE)
      const rows = await tx
        .select()
        .from(products)
        .where(eq(products.id, m.productId))
        .for('update');

      if (!rows || rows.length === 0) {
        throw new Error(`Produto não localizado no banco de dados (ID: ${m.productId}).`);
      }
      const prod = rows[0];

      // 3. Calcular o novo estoque e validar disponibilidade (ESTOQUE NÃO PODE FICAR NEGATIVO)
      let newStockDeposito = prod.stockDeposito;
      let newStockLoja = prod.stockLoja;

      if (m.type === 'venda_loja') {
        // Baixa para Baleiro / Pacote Aberto: quantidade deve ser estritamente maior que zero
        if (qty <= 0) {
          throw new Error('Quantidade para baixa de baleiro deve ser maior que zero.');
        }
        // Valida disponibilidade: REJEITA se quantidade > estoque (NUNCA reduz para zero)
        if (prod.stockLoja < qty) {
          throw new Error(
            `Operação rejeitada: Quantidade solicitada (${qty}) é maior que o estoque disponível na loja (${prod.stockLoja} un).`
          );
        }
        newStockLoja = prod.stockLoja - qty;
      } else if (m.type === 'perda_avaria') {
        if (qty <= 0) {
          throw new Error('Quantidade para registro de perda/avaria deve ser maior que zero.');
        }
        if (m.location === 'deposito') {
          if (prod.stockDeposito < qty) {
            throw new Error(
              `Operação rejeitada: Quantidade solicitada (${qty}) é maior que o estoque disponível no depósito (${prod.stockDeposito} un).`
            );
          }
          newStockDeposito = prod.stockDeposito - qty;
        } else if (m.location === 'loja') {
          if (prod.stockLoja < qty) {
            throw new Error(
              `Operação rejeitada: Quantidade solicitada (${qty}) é maior que o estoque disponível na loja (${prod.stockLoja} un).`
            );
          }
          newStockLoja = prod.stockLoja - qty;
        } else if (m.location === 'ambos') {
          if (prod.stockDeposito < qty || prod.stockLoja < qty) {
            throw new Error(
              `Operação rejeitada: Quantidade solicitada (${qty}) excede o saldo disponível (Depósito: ${prod.stockDeposito}, Loja: ${prod.stockLoja}).`
            );
          }
          newStockDeposito = prod.stockDeposito - qty;
          newStockLoja = prod.stockLoja - qty;
        }
      } else if (m.type === 'ajuste_inventario') {
        // Ajuste de inventário: define contagem física absoluta. Não pode ser negativo.
        if (qty < 0) {
          throw new Error('Quantidade para ajuste de inventário não pode ser negativa.');
        }
        const roundedQty = Math.round(qty);
        if (m.location === 'deposito' || m.location === 'ambos') {
          newStockDeposito = roundedQty;
        }
        if (m.location === 'loja' || m.location === 'ambos') {
          newStockLoja = roundedQty;
        }
      } else if (m.type === 'transferencia_deposito_loja') {
        if (qty <= 0) {
          throw new Error('Quantidade para transferência deve ser maior que zero.');
        }
        if (prod.stockDeposito < qty) {
          throw new Error(
            `Operação rejeitada: Saldo insuficiente no depósito (${prod.stockDeposito} disponível, solicitado ${qty}).`
          );
        }
        newStockDeposito = prod.stockDeposito - qty;
        newStockLoja = prod.stockLoja + qty;
      }

      // 5. Atualizar o produto com o novo estoque dentro da mesma transação
      await tx
        .update(products)
        .set({
          stockDeposito: newStockDeposito,
          stockLoja: newStockLoja,
          updatedAt: new Date(),
        })
        .where(eq(products.id, m.productId));

      // 6. Inserir o registro em stock_movements dentro da mesma transação
      const timestamp = m.date || new Date().toISOString();
      const createdBy = m.userName || 'Operador';

      let origin = 'Loja';
      let destination = 'Cliente Final';
      let defaultReason = `Movimentação de estoque: ${m.type}`;

      let prevCount: number | null = null;
      let lossCategoryVal: string | null = null;

      if (m.type === 'venda_loja') {
        origin = 'Loja';
        destination = 'Baleiro / Consumidor Final';
        defaultReason = 'Baixa para Baleiro / Pacote Aberto';
      } else if (m.type === 'perda_avaria') {
        origin = m.location === 'deposito' ? 'Depósito Central' : m.location === 'ambos' ? 'Depósito e Loja' : 'Loja';
        destination = 'Descarte / Perda / Avaria';
        lossCategoryVal = m.lossCategory ? String(m.lossCategory).trim() : 'Outro';
        defaultReason = `Perda / Avaria [${lossCategoryVal}]`;
      } else if (m.type === 'ajuste_inventario') {
        origin = 'Auditoria / Contagem Física';
        destination = m.location === 'deposito' ? 'Depósito Central' : m.location === 'ambos' ? 'Depósito e Loja' : 'Loja';
        prevCount = m.location === 'deposito' ? prod.stockDeposito : prod.stockLoja;
        const diff = Math.round(qty) - prevCount;
        const diffStr = diff >= 0 ? `+${diff}` : `${diff}`;
        defaultReason = `Ajuste de Inventário (Anterior: ${prevCount}, Atual: ${Math.round(qty)}, Dif: ${diffStr})`;
      } else if (m.type === 'transferencia_deposito_loja') {
        origin = 'Depósito Central';
        destination = 'Loja';
        defaultReason = 'Transferência Depósito ➔ Loja';
      } else if (m.location === 'deposito') {
        origin = 'Depósito Central';
        destination = 'Depósito Central';
      } else if (m.location === 'ambos') {
        origin = 'Depósito e Loja';
        destination = 'Depósito e Loja';
      } else {
        origin = 'Loja';
        destination = 'Loja';
      }

      const movementReason = m.reason ? m.reason : defaultReason;
      const unitCostOrSellPrice = m.unitPrice !== undefined
        ? m.unitPrice
        : (m.type === 'perda_avaria' ? prod.costPrice : prod.sellPrice);

      await tx
        .insert(stockMovements)
        .values({
          id: movementId,
          productId: m.productId,
          productName: m.productName || prod.name,
          type: m.type,
          origin,
          destination,
          quantity: qty,
          previousQuantity: prevCount,
          lossCategory: lossCategoryVal,
          batchNumber: prod.batchNumber || 'LOTE-DEFAULT',
          reason: movementReason,
          createdBy,
          timestamp,
          nfEntryId: m.nfEntryId || null,
        });

      // 7. Retornar produto atualizado e movimentação confirmada
      const updatedProduct: Product = {
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
      };

      const movement: StockMovement = {
        id: movementId,
        productId: m.productId,
        productName: m.productName || prod.name,
        type: m.type,
        quantity: qty,
        previousQuantity: prevCount !== null ? prevCount : undefined,
        lossCategory: lossCategoryVal || undefined,
        location: m.location,
        date: timestamp,
        userName: createdBy,
        reason: movementReason,
        unitPrice: unitCostOrSellPrice,
        nfEntryId: m.nfEntryId || undefined,
      };

      return {
        success: true,
        movement,
        product: updatedProduct,
      };
    });
  });
}

export const insertMovement = processStockMovement;

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
 * Processa a entrada e edição de Nota Fiscal e seus itens no PostgreSQL em transação atômica rigorosa.
 * - Na criação de NF: adiciona as quantidades ao stockDeposito no Depósito Central.
 * - Na edição de NF: calcula a reconciliação (delta = nova_qtd - antiga_qtd) para cada produto,
 *   garantindo que não ocorra duplicação de estoque (ex: 100 -> 120 adiciona apenas +20, resultando em +120).
 * - Se uma redução for solicitada e o estoque disponível no depósito for inferior, a operação é rejeitada.
 * - Registra movimentações em stock_movements com vínculo nfEntryId e auditoria completa.
 */
export async function processNFEntry(nf: NFEntry): Promise<NFEntry> {
  checkDbConnection();

  return await withRetry(async () => {
    return await db.transaction(async (tx: any) => {
      const cleanAccessKey = (nf.accessKey || '').trim();

      // 1. Verifica se a NF já existe no banco de dados (Modo Edição vs Modo Nova Inserção)
      const existingNfRows = await tx
        .select()
        .from(nfEntries)
        .where(eq(nfEntries.id, nf.id))
        .for('update');
      const isEditing = existingNfRows && existingNfRows.length > 0;

      // 2. Se for edição, busca os itens antigos da NF para calcular o impacto anterior
      const oldQtyByProduct: Record<string, { quantity: number; productName: string }> = {};
      if (isEditing) {
        const previousItems = await tx
          .select()
          .from(nfItems)
          .where(eq(nfItems.nfId, nf.id));

        for (const pItem of previousItems) {
          if (!oldQtyByProduct[pItem.productId]) {
            oldQtyByProduct[pItem.productId] = { quantity: 0, productName: pItem.productName };
          }
          oldQtyByProduct[pItem.productId].quantity += Number(pItem.quantity) || 0;
        }
      }

      // 3. Agrupa as novas quantidades informadas para esta NF por produto
      const newQtyByProduct: Record<string, { quantity: number; productName: string }> = {};
      if (nf.items && nf.items.length > 0) {
        for (const item of nf.items) {
          const itemQty = Number(item.quantity);
          if (isNaN(itemQty) || itemQty <= 0) {
            throw new Error(`Quantidade inválida para o item "${item.productName}": deve ser maior que zero.`);
          }
          if (!newQtyByProduct[item.productId]) {
            newQtyByProduct[item.productId] = { quantity: 0, productName: item.productName };
          }
          newQtyByProduct[item.productId].quantity += itemQty;
        }
      }

      // 4. Reconciliação atômica de saldo: calcula o delta para todos os produtos envolvidos
      const allProductIds = Array.from(
        new Set([...Object.keys(oldQtyByProduct), ...Object.keys(newQtyByProduct)])
      );

      for (const productId of allProductIds) {
        const oldQty = oldQtyByProduct[productId]?.quantity || 0;
        const newQty = newQtyByProduct[productId]?.quantity || 0;
        const delta = newQty - oldQty;

        // Se não houve alteração na quantidade deste produto, nada a ajustar no saldo
        if (delta === 0) continue;

        // Trava a linha do produto no PostgreSQL (SELECT FOR UPDATE)
        const prodRows = await tx
          .select()
          .from(products)
          .where(eq(products.id, productId))
          .for('update');

        if (!prodRows || prodRows.length === 0) {
          const prodName = newQtyByProduct[productId]?.productName || oldQtyByProduct[productId]?.productName || productId;
          throw new Error(`Produto "${prodName}" não foi localizado no banco de dados para reconciliação de estoque.`);
        }
        const prod = prodRows[0];

        // Se delta < 0 (redução de quantidade na NF ou remoção de item), verifica disponibilidade no depósito
        if (delta < 0 && prod.stockDeposito < Math.abs(delta)) {
          throw new Error(
            `Não é possível alterar a NF: parte do estoque do produto "${prod.name}" já foi movimentada (vendida ou transferida). Saldo disponível no Depósito Central: ${prod.stockDeposito} un, redução solicitada: ${Math.abs(delta)} un.`
          );
        }

        // Aplica o delta no estoque do Depósito Central
        const newStockDeposito = prod.stockDeposito + delta;
        await tx
          .update(products)
          .set({
            stockDeposito: newStockDeposito,
            updatedAt: new Date(),
          })
          .where(eq(products.id, productId));
      }

      // 5. Persiste/Atualiza o cabeçalho da NF (nfEntries)
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

      // 6. Remove itens e movimentações anteriores desta NF para recriá-los sincronizados
      await tx.delete(nfItems).where(eq(nfItems.nfId, nf.id));
      await tx.delete(stockMovements).where(eq(stockMovements.nfEntryId, nf.id));

      // 7. Insere os novos itens da NF, atualiza metadados cadastrais do produto e insere movimentações
      if (nf.items && nf.items.length > 0) {
        for (const item of nf.items) {
          const itemQty = Number(item.quantity);

          // Atualiza dados de custo, lote e validade no cadastro do produto (sem alterar estoque)
          const prodRows = await tx.select().from(products).where(eq(products.id, item.productId));
          if (prodRows && prodRows.length > 0) {
            const currentProd = prodRows[0];
            await tx
              .update(products)
              .set({
                costPrice: item.costPrice > 0 ? item.costPrice : currentProd.costPrice,
                batchNumber: item.batchNumber || currentProd.batchNumber,
                expirationDate: item.expirationDate || currentProd.expirationDate,
                updatedAt: new Date(),
              })
              .where(eq(products.id, item.productId));
          }

          // 7.1. Insere item da NF em nf_items
          await tx.insert(nfItems).values({
            nfId: nf.id,
            productId: item.productId,
            productName: item.productName,
            quantity: itemQty,
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

          // 7.2. Registra movimentação de entrada vinculada à NF (nfEntryId) em stock_movements
          const movementId = `mov-nf-${nf.id}-${item.productId}-${Date.now()}`;
          const reasonText = isEditing
            ? `Entrada por NF ${nf.numberNF} (${nf.supplier || 'Fornecedor'}) [Atualizada]`
            : `Entrada por NF ${nf.numberNF} (${nf.supplier || 'Fornecedor'})`;

          await tx.insert(stockMovements).values({
            id: movementId,
            productId: item.productId,
            productName: item.productName,
            type: 'entrada_nf',
            origin: nf.supplier || 'Fornecedor NF',
            destination: 'Depósito Central',
            quantity: itemQty,
            batchNumber: item.batchNumber || 'LOTE-PADRAO',
            reason: reasonText,
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
      // 1. Busca e trava os dados da NF
      const nfRows = await tx.select().from(nfEntries).where(eq(nfEntries.id, id)).for('update');
      if (!nfRows || nfRows.length === 0) {
        throw new Error('Nota Fiscal não encontrada no banco de dados.');
      }
      const nf = nfRows[0];

      // 2. Busca itens da NF e movimentações vinculadas
      const items = await tx.select().from(nfItems).where(eq(nfItems.nfId, id));
      const linkedMovements = await tx
        .select()
        .from(stockMovements)
        .where(eq(stockMovements.nfEntryId, id));

      // 3. Agrupa a quantidade a subtrair por produto no Depósito Central
      const qtyToSubtractByProduct: Record<string, { quantity: number; productName: string }> = {};

      if (items && items.length > 0) {
        for (const it of items) {
          if (!qtyToSubtractByProduct[it.productId]) {
            qtyToSubtractByProduct[it.productId] = { quantity: 0, productName: it.productName };
          }
          qtyToSubtractByProduct[it.productId].quantity += Number(it.quantity) || 0;
        }
      } else if (linkedMovements && linkedMovements.length > 0) {
        for (const mov of linkedMovements) {
          if (!qtyToSubtractByProduct[mov.productId]) {
            qtyToSubtractByProduct[mov.productId] = { quantity: 0, productName: mov.productName };
          }
          qtyToSubtractByProduct[mov.productId].quantity += Number(mov.quantity) || 0;
        }
      } else {
        throw new Error('Esta nota fiscal não possui itens nem movimentações registradas para reversão de estoque.');
      }

      // 4. Verifica se cada produto possui saldo suficiente no estoque do depósito para subtrair
      for (const [productId, info] of Object.entries(qtyToSubtractByProduct)) {
        const prodRows = await tx
          .select()
          .from(products)
          .where(eq(products.id, productId))
          .for('update');

        if (!prodRows || prodRows.length === 0) {
          throw new Error(
            `Produto "${info.productName}" não foi localizado no cadastro para reversão de estoque.`
          );
        }
        const prod = prodRows[0];

        if (prod.stockDeposito < info.quantity) {
          throw new Error(
            `Não é possível excluir a NF: parte do estoque do produto "${prod.name}" já foi movimentado (vendido ou transferido). Saldo disponível no Depósito Central: ${prod.stockDeposito} un, quantidade a estornar: ${info.quantity} un. Ajuste o estoque manualmente em vez de excluir a nota fiscal.`
          );
        }
      }

      // 5. Aplica a reversão de estoque no Depósito Central para todos os produtos
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

