import {
  processNFEntry,
  deleteNFEntryById,
  processStockTransfer,
  processStockMovement,
  saveProduct,
} from '../db/dbService.ts';
import { db } from '../db/index.ts';
import { products, nfEntries, nfItems, stockMovements } from '../db/schema.ts';
import { eq } from 'drizzle-orm';
import { NFEntry, Product } from '../types.ts';

async function runMovementAuditTests() {
  console.log('====================================================');
  console.log('  FINI-ESTOQUE — AUDITORIA DE MOVIMENTAÇÕES (ETAPA 2)');
  console.log('====================================================\n');

  let passedTests = 0;
  let totalTests = 7;

  // Produto de teste isolado para os testes de auditoria
  const testProductId = `prod-audit-test-${Date.now()}`;
  const testProductData: Product = {
    id: testProductId,
    sku: `TEST-AUD-${Date.now()}`,
    ean: `78900000${Math.floor(10000 + Math.random() * 90000)}`,
    name: 'Produto Teste Auditoria Fini',
    category: 'Balas de Gelatina',
    unit: 'Pacote 100g',
    stockDeposito: 0,
    stockLoja: 0,
    minStockDeposito: 10,
    minStockLoja: 5,
    costPrice: 5.0,
    sellPrice: 10.0,
    expirationDate: '2027-12-31',
    batchNumber: 'LOTE-AUD-01',
    lastUpdated: new Date().toISOString(),
    totalSalesQuantity: 0,
    totalSalesValue: 0,
  };

  try {
    // 0. Cria o produto de teste
    await saveProduct(testProductData);
    // Ajusta o saldo inicial para 0/0
    await db
      .update(products)
      .set({ stockDeposito: 0, stockLoja: 0 })
      .where(eq(products.id, testProductId));

    console.log(`✓ Produto de teste criado com sucesso (ID: ${testProductId})\n`);

    // =========================================================================
    // TESTE 1: EDIÇÃO DE NF (CENÁRIO CRÍTICO 100 -> 120 UNIDADES)
    // =========================================================================
    console.log('----------------------------------------------------');
    console.log('TESTE 1: Edição de NF (100 -> 120 un, sem duplicar estoque)');
    console.log('----------------------------------------------------');
    const testNfId = `nf-audit-${Date.now()}`;
    const initialNF: NFEntry = {
      id: testNfId,
      numberNF: 'NF-AUD-100',
      accessKey: `AUDIT${Date.now()}`,
      supplier: 'Fornecedor Fini Teste',
      cnpjSupplier: '00.000.000/0001-91',
      issueDate: '2026-09-01',
      receiveDate: '2026-09-01',
      totalValue: 500.0,
      notes: 'Nota original com 100 unidades',
      createdBy: 'Auditor',
      items: [
        {
          productId: testProductId,
          productName: testProductData.name,
          quantity: 100,
          costPrice: 5.0,
          totalCost: 500.0,
          batchNumber: 'LOTE-100',
          expirationDate: '2027-12-31',
        },
      ],
    };

    // 1.1. Lança a NF inicial com 100 un
    await processNFEntry(initialNF);
    let [prodRow] = await db.select().from(products).where(eq(products.id, testProductId));
    if (prodRow.stockDeposito !== 100) {
      throw new Error(`Falha no lançamento inicial da NF: esperado 100 no depósito, obtido ${prodRow.stockDeposito}`);
    }
    console.log(`  [Passo 1] NF lançada com 100 un. Saldo no Depósito: ${prodRow.stockDeposito} un.`);

    // 1.2. Edita a mesma NF para 120 un
    const editedNF: NFEntry = {
      ...initialNF,
      totalValue: 600.0,
      notes: 'Nota editada para 120 unidades',
      items: [
        {
          productId: testProductId,
          productName: testProductData.name,
          quantity: 120,
          costPrice: 5.0,
          totalCost: 600.0,
          batchNumber: 'LOTE-120',
          expirationDate: '2027-12-31',
        },
      ],
    };
    await processNFEntry(editedNF);

    [prodRow] = await db.select().from(products).where(eq(products.id, testProductId));
    if (prodRow.stockDeposito === 220) {
      throw new Error('FALHA GRAVE: Estoque foi duplicado para 220 un em vez de reconciliado para 120 un!');
    }
    if (prodRow.stockDeposito !== 120) {
      throw new Error(`Falha na reconciliação: esperado 120 un, obtido ${prodRow.stockDeposito} un.`);
    }
    console.log(`  [Passo 2] NF editada para 120 un. Saldo final no Depósito: ${prodRow.stockDeposito} un (Correto: +120, NÃO +220).`);
    console.log('✓ TESTE 1 APROVADO: Edição de NF reconciliada atomicamente com precisão matemática.\n');
    passedTests++;

    // =========================================================================
    // TESTE 2: EXCLUSÃO DE NF (REVERSÃO SEGURA DE ESTOQUE)
    // =========================================================================
    console.log('----------------------------------------------------');
    console.log('TESTE 2: Exclusão de NF com Reversão de Estoque');
    console.log('----------------------------------------------------');
    // Saldo atual é 120. A exclusão da NF deve reverter exatamente os 120 adicionados por ela.
    const deleteResult = await deleteNFEntryById(testNfId);
    if (!deleteResult.success) {
      throw new Error(`Falha ao executar exclusão da NF: ${deleteResult.message}`);
    }

    [prodRow] = await db.select().from(products).where(eq(products.id, testProductId));
    if (prodRow.stockDeposito !== 0) {
      throw new Error(`Falha na reversão do estoque após excluir NF: esperado 0 un, obtido ${prodRow.stockDeposito} un.`);
    }

    // Valida que itens e movimentações vinculadas foram removidos
    const remainingItems = await db.select().from(nfItems).where(eq(nfItems.nfId, testNfId));
    const remainingMovs = await db.select().from(stockMovements).where(eq(stockMovements.nfEntryId, testNfId));
    if (remainingItems.length > 0 || remainingMovs.length > 0) {
      throw new Error('Falha de integridade: restaram itens ou movimentações vinculadas à NF excluída.');
    }

    console.log(`  Reversão concluída: saldo no Depósito voltou para ${prodRow.stockDeposito} un.`);
    console.log('✓ TESTE 2 APROVADO: Exclusão de NF reverteu estoque e higienizou histórico com integridade.\n');
    passedTests++;

    // =========================================================================
    // TESTE 3: TRANSFERÊNCIA VÁLIDA (DEPÓSITO = 100, LOJA = 20, TRANSF = 30 -> 70 / 50)
    // =========================================================================
    console.log('----------------------------------------------------');
    console.log('TESTE 3: Transferência Válida (Depósito 100, Loja 20 -> Transferir 30 -> 70 / 50)');
    console.log('----------------------------------------------------');
    // Prepara saldos do produto de teste: Depósito = 100, Loja = 20
    await db
      .update(products)
      .set({ stockDeposito: 100, stockLoja: 20 })
      .where(eq(products.id, testProductId));

    const transferResult = await processStockTransfer({
      id: `transf-audit-${Date.now()}`,
      productId: testProductId,
      quantity: 30,
      operatorName: 'Operador Auditor',
      notes: 'Transferência de teste Depósito -> Loja',
    });

    if (!transferResult.success) {
      throw new Error('Falha na execução da transferência válida.');
    }

    [prodRow] = await db.select().from(products).where(eq(products.id, testProductId));
    if (prodRow.stockDeposito !== 70 || prodRow.stockLoja !== 50) {
      throw new Error(`Resultado incorreto da transferência: esperado 70/50, obtido Depósito: ${prodRow.stockDeposito}, Loja: ${prodRow.stockLoja}`);
    }

    console.log(`  Transferência executada: Depósito: ${prodRow.stockDeposito} un, Loja: ${prodRow.stockLoja} un.`);
    console.log('✓ TESTE 3 APROVADO: Transferência válida processada atomicamente (70 no Depósito e 50 na Loja).\n');
    passedTests++;

    // =========================================================================
    // TESTE 4: TRANSFERÊNCIA INVÁLIDA (SALDO INSUFICIENTE -> REJEIÇÃO)
    // =========================================================================
    console.log('----------------------------------------------------');
    console.log('TESTE 4: Transferência Inválida (Depósito = 10, Transferir = 20 -> Rejeição)');
    console.log('----------------------------------------------------');
    // Prepara saldos: Depósito = 10, Loja = 50
    await db
      .update(products)
      .set({ stockDeposito: 10, stockLoja: 50 })
      .where(eq(products.id, testProductId));

    let rejectedAsExpected = false;
    try {
      await processStockTransfer({
        id: `transf-inv-${Date.now()}`,
        productId: testProductId,
        quantity: 20, // Solicita 20 tendo apenas 10
        operatorName: 'Operador Auditor',
      });
    } catch (err: any) {
      rejectedAsExpected = true;
      console.log(`  Operação rejeitada com sucesso pelo backend: "${err.message}"`);
    }

    if (!rejectedAsExpected) {
      throw new Error('FALHA GRAVE: Transferência com saldo insuficiente foi autorizada!');
    }

    // Confirma que os saldos permaneceram intocados
    [prodRow] = await db.select().from(products).where(eq(products.id, testProductId));
    if (prodRow.stockDeposito !== 10 || prodRow.stockLoja !== 50) {
      throw new Error('FALHA DE ROLLBACK: Saldos foram alterados indevidamente após transferência inválida.');
    }

    console.log(`  Saldos preservados intactos: Depósito: ${prodRow.stockDeposito} un, Loja: ${prodRow.stockLoja} un.`);
    console.log('✓ TESTE 4 APROVADO: Transferência sem saldo rejeitada com rollback absoluto.\n');
    passedTests++;

    // =========================================================================
    // TESTE 5: PERDA COM ESTOQUE SUFICIENTE
    // =========================================================================
    console.log('----------------------------------------------------');
    console.log('TESTE 5: Perda / Avaria com Estoque Suficiente');
    console.log('----------------------------------------------------');
    // Saldos atuais: Depósito = 10, Loja = 50. Registra perda de 15 na Loja.
    const perdaResult = await processStockMovement({
      id: `mov-perda-val-${Date.now()}`,
      productId: testProductId,
      type: 'perda_avaria',
      quantity: 15,
      location: 'loja',
      reason: 'Avaria em display durante reposição',
      userName: 'Auditor Fiscal',
    });

    if (!perdaResult.success) {
      throw new Error('Falha no processamento de perda/avaria válida.');
    }

    [prodRow] = await db.select().from(products).where(eq(products.id, testProductId));
    if (prodRow.stockLoja !== 35) {
      throw new Error(`Falha no cálculo de perda: esperado Loja = 35, obtido ${prodRow.stockLoja}`);
    }

    console.log(`  Perda de 15 un registrada. Saldo na Loja atualizado para: ${prodRow.stockLoja} un.`);
    console.log('✓ TESTE 5 APROVADO: Perda/avaria registrada e estoque deduzido corretamente.\n');
    passedTests++;

    // =========================================================================
    // TESTE 6: PERDA COM ESTOQUE INSUFICIENTE (REJEIÇÃO)
    // =========================================================================
    console.log('----------------------------------------------------');
    console.log('TESTE 6: Perda / Avaria com Estoque Insuficiente (Rejeição)');
    console.log('----------------------------------------------------');
    // Saldo atual na Loja = 35. Tenta registrar perda de 50.
    let perdaRejeitada = false;
    try {
      await processStockMovement({
        id: `mov-perda-inv-${Date.now()}`,
        productId: testProductId,
        type: 'perda_avaria',
        quantity: 50,
        location: 'loja',
        reason: 'Tentativa inválida de perda maior que o saldo',
        userName: 'Auditor Fiscal',
      });
    } catch (err: any) {
      perdaRejeitada = true;
      console.log(`  Operação rejeitada com sucesso pelo backend: "${err.message}"`);
    }

    if (!perdaRejeitada) {
      throw new Error('FALHA GRAVE: Perda superior ao saldo disponível foi aceita!');
    }

    [prodRow] = await db.select().from(products).where(eq(products.id, testProductId));
    if (prodRow.stockLoja !== 35) {
      throw new Error(`Saldo foi corrompido após rejeição: ${prodRow.stockLoja}`);
    }

    console.log(`  Saldo na Loja mantido intacto em ${prodRow.stockLoja} un.`);
    console.log('✓ TESTE 6 APROVADO: Perda sem saldo rejeitada, impedindo saldo negativo.\n');
    passedTests++;

    // =========================================================================
    // TESTE 7: IDEMPOTÊNCIA (REPETIÇÃO DE MOVIMENTAÇÃO NÃO DUPLICA ESTOQUE)
    // =========================================================================
    console.log('----------------------------------------------------');
    console.log('TESTE 7: Idempotência de Movimentação');
    console.log('----------------------------------------------------');
    const idempotencyMovId = `mov-idem-${Date.now()}`;
    // Executa baixa de baleiro de 5 un na Loja (saldo atual = 35 -> novo saldo = 30)
    await processStockMovement({
      id: idempotencyMovId,
      productId: testProductId,
      type: 'venda_loja',
      quantity: 5,
      location: 'loja',
      reason: 'Baixa para Baleiro',
      userName: 'Caixa 01',
    });

    [prodRow] = await db.select().from(products).where(eq(products.id, testProductId));
    if (prodRow.stockLoja !== 30) {
      throw new Error(`Falha na primeira execução: esperado 30, obtido ${prodRow.stockLoja}`);
    }
    console.log(`  Primeira execução: Saldo na Loja = ${prodRow.stockLoja} un.`);

    // Executa exatamente a MESMA movimentação (mesmo ID) novamente
    await processStockMovement({
      id: idempotencyMovId,
      productId: testProductId,
      type: 'venda_loja',
      quantity: 5,
      location: 'loja',
      reason: 'Baixa para Baleiro (Retry/Repetição)',
      userName: 'Caixa 01',
    });

    [prodRow] = await db.select().from(products).where(eq(products.id, testProductId));
    if (prodRow.stockLoja !== 30) {
      throw new Error(`FALHA DE IDEMPOTÊNCIA: Movimentação repetida alterou o estoque para ${prodRow.stockLoja} un!`);
    }
    console.log(`  Segunda execução com mesmo ID: Saldo permaneceu em ${prodRow.stockLoja} un (Não duplicou).`);
    console.log('✓ TESTE 7 APROVADO: Idempotência garantida contra envios duplicados.\n');
    passedTests++;

    // =========================================================================
    // LIMPEZA SEGURA DO REGISTRO DE TESTE
    // =========================================================================
    console.log('----------------------------------------------------');
    console.log('Higienização dos dados do teste automatizado...');
    await db.delete(stockMovements).where(eq(stockMovements.productId, testProductId));
    await db.delete(products).where(eq(products.id, testProductId));
    console.log('✓ Registro de teste removido. Base de dados original preservada intacta.');

    console.log('\n====================================================');
    console.log(`  RESULTADO: ${passedTests}/${totalTests} TESTES EXECUTADOS COM SUCESSO!`);
    console.log('  INTEGRIDADE DE MOVIMENTAÇÕES 100% HOMOLOGADA');
    console.log('====================================================\n');
    process.exit(0);
  } catch (err: any) {
    console.error('\n❌ ERRO NA AUDITORIA DE MOVIMENTAÇÕES:', err);
    // Tenta limpar o produto de teste
    try {
      await db.delete(stockMovements).where(eq(stockMovements.productId, testProductId));
      await db.delete(products).where(eq(products.id, testProductId));
    } catch {}
    process.exit(1);
  }
}

runMovementAuditTests();
