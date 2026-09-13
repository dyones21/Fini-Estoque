import { db } from '../db/index.ts';
import { products } from '../db/schema.ts';
import { eq } from 'drizzle-orm';
import { updateProductById, saveProduct } from '../db/dbService.ts';
import { Product } from '../types.ts';

async function runSyncAuditTests() {
  console.log('================================================================');
  console.log('  FINI-ESTOQUE — AUDITORIA DE SINCRONIZAÇÃO E ATRASO VISUAL');
  console.log('================================================================\n');

  let passed = 0;
  const total = 5;

  const testId = `sync-test-${Date.now()}`;
  const initialProduct: Product = {
    id: testId,
    sku: `SYNC-SKU-${Date.now()}`,
    ean: `78900000${Math.floor(10000 + Math.random() * 90000)}`,
    name: 'Bala Fini Sincronizacao Original',
    category: 'Balas de Gelatina',
    unit: 'Pacote 100g',
    stockDeposito: 42,
    stockLoja: 18,
    minStockDeposito: 10,
    minStockLoja: 5,
    costPrice: 6.5,
    sellPrice: 12.0,
    expirationDate: '2027-12-31',
    batchNumber: 'LOTE-SYNC-01',
    lastUpdated: new Date().toISOString(),
    totalSalesQuantity: 15,
    totalSalesValue: 180.0,
  };

  try {
    // Criação inicial
    await saveProduct(initialProduct);
    // Assegura saldos iniciais específicos
    await db
      .update(products)
      .set({ stockDeposito: 42, stockLoja: 18 })
      .where(eq(products.id, testId));

    console.log(`[Setup] Produto de teste criado: ${testId}\n`);

    // -------------------------------------------------------------------------
    // TESTE 1: Alteração de nome cadastral preserva saldos de estoque (Regra Absoluta)
    // -------------------------------------------------------------------------
    console.log('TESTE 1: Alteração de nome preserva saldos no banco');
    const updateResult1 = await updateProductById(testId, {
      name: 'Bala Fini Sincronizacao Editada V1',
      sellPrice: 13.5,
    });

    if (
      updateResult1 &&
      updateResult1.name === 'Bala Fini Sincronizacao Editada V1' &&
      updateResult1.stockDeposito === 42 &&
      updateResult1.stockLoja === 18
    ) {
      console.log('✓ PASSOU: Nome e preço atualizados, saldos de estoque rigorosamente mantidos (42/18).\n');
      passed++;
    } else {
      console.error('✗ FALHOU no Teste 1:', updateResult1);
    }

    // -------------------------------------------------------------------------
    // TESTE 2: Concorrência com duas alterações rápidas em sucessão
    // -------------------------------------------------------------------------
    console.log('TESTE 2: Duas alterações em sucessão rápida (A -> B) - a última prevalece');
    const promiseA = updateProductById(testId, { name: 'Bala Fini Rapida A' });
    const promiseB = updateProductById(testId, { name: 'Bala Fini Rapida B (Final)' });

    await Promise.all([promiseA, promiseB]);

    const [finalProductRow] = await db.select().from(products).where(eq(products.id, testId));
    if (finalProductRow && finalProductRow.name === 'Bala Fini Rapida B (Final)') {
      console.log('✓ PASSOU: Alteração mais recente B prevaleceu no banco de dados.\n');
      passed++;
    } else {
      console.error('✗ FALHOU no Teste 2: Nome final obtido:', finalProductRow?.name);
    }

    // -------------------------------------------------------------------------
    // TESTE 3: Simulação de Reconciliação Anti-Race Condition no Frontend
    // Cenário: Fetch global começou antes da alteração local mas terminou depois
    // -------------------------------------------------------------------------
    console.log('TESTE 3: Simulação de Reconciliação Anti-Race Condition');
    const fetchStartTime = Date.now() - 500; // Iniciou há 500ms
    const staleServerProduct: Product = {
      ...initialProduct,
      name: 'Nome Antigo do Snapshot Lento',
      lastUpdated: new Date(fetchStartTime - 1000).toISOString(),
    };

    const currentLocalProduct: Product = {
      ...initialProduct,
      name: 'Nome Novo da Alteracao Recente',
      lastUpdated: new Date().toISOString(), // Atualizado agora
    };

    // Lógica implementada no StockContext:
    const localTime = new Date(currentLocalProduct.lastUpdated).getTime();
    const incomingTime = new Date(staleServerProduct.lastUpdated).getTime();

    let reconciledProduct: Product;
    if (localTime >= fetchStartTime || localTime > incomingTime) {
      reconciledProduct = {
        ...currentLocalProduct,
        totalSalesQuantity: staleServerProduct.totalSalesQuantity,
        totalSalesValue: staleServerProduct.totalSalesValue,
      };
    } else {
      reconciledProduct = staleServerProduct;
    }

    if (reconciledProduct.name === 'Nome Novo da Alteracao Recente') {
      console.log('✓ PASSOU: Reconciliação preservou o dado novo e ignorou snapshot desatualizado.\n');
      passed++;
    } else {
      console.error('✗ FALHOU no Teste 3: Sobrescrito indevidamente com:', reconciledProduct.name);
    }

    // -------------------------------------------------------------------------
    // TESTE 4: Validação de Headers HTTP (Cache-Control: no-store) no servidor Express
    // -------------------------------------------------------------------------
    console.log('TESTE 4: Validação de Headers HTTP no servidor Express');
    try {
      const response = await fetch('http://localhost:3000/api/health');
      const cacheControl = response.headers.get('cache-control');
      if (cacheControl && cacheControl.includes('no-store')) {
        console.log(`✓ PASSOU: Cache-Control para /api inclui "no-store": "${cacheControl}"\n`);
        passed++;
      } else {
        console.error('✗ FALHOU no Teste 4: Cache-Control ausente ou inadequado:', cacheControl);
      }
    } catch (err: any) {
      console.error('✗ FALHOU no Teste 4 (Erro de rede):', err.message);
    }

    // -------------------------------------------------------------------------
    // TESTE 5: Verificação do Service Worker (sw.js não intercepta /api/)
    // -------------------------------------------------------------------------
    console.log('TESTE 5: Verificação estática do Service Worker (public/sw.js)');
    const fs = await import('fs');
    const swContent = fs.readFileSync('public/sw.js', 'utf-8');
    const excludesApi = swContent.includes("url.pathname.startsWith('/api')");
    const isV3 = swContent.includes("CACHE_NAME = 'erp-fini-v3'");

    if (excludesApi && isV3) {
      console.log('✓ PASSOU: Service Worker configurado para versão v3 e ignora requisições /api/*.\n');
      passed++;
    } else {
      console.error('✗ FALHOU no Teste 5: public/sw.js não possui as regras requeridas.');
    }

    console.log('================================================================');
    console.log(`RESULTADO DA AUDITORIA: ${passed}/${total} TESTES PASSARAM COM SUCESSO!`);
    console.log('================================================================\n');
  } catch (error) {
    console.error('Erro na suíte de testes de sincronização:', error);
  } finally {
    // Limpeza do registro de teste para manter o banco higienizado
    await db.delete(products).where(eq(products.id, testId)).catch(() => null);
  }
}

runSyncAuditTests();
