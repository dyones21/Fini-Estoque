import { XMLParser } from 'fast-xml-parser';

export interface NFXmlTotals {
  vProd: number;     // Valor total dos produtos
  vFrete: number;    // Frete total
  vSeg: number;      // Seguro total
  vOutro: number;    // Outras despesas acessórias
  vDesc: number;     // Desconto total
  vICMSST: number;   // Total de ICMS-ST (vST ou vICMSST)
  vIPI: number;      // Total de IPI
  vII: number;       // Total de Imposto de Importação
  vNF: number;       // Valor total da nota fiscal
}

export interface CalculateAllocationsParams {
  itemProdValue: number;
  quantity: number;
  totalVProd: number;
  freightTotal: number;
  insuranceTotal: number;
  otherExpensesTotal: number;
  discountTotal: number;
  icmsStTotal: number;
  ipiTotal: number;
  iiTotal: number;
  difalTotal: number;
  recoverableTaxesTotal: number;
  itemCount: number;
}

export interface ItemAllocationResult {
  weight: number;
  freightAllocated: number;
  insuranceAllocated: number;
  otherExpensesAllocated: number;
  discountAllocated: number;
  icmsStAllocated: number;
  ipiAllocated: number;
  iiAllocated: number;
  difalAllocated: number;
  recoverableTaxesAllocated: number;
  costPrice: number;
  totalCost: number;
}

/**
 * Calcula o rateio proporcional de frete, despesas, impostos e descontos para um item da NF-e.
 * Fórmula oficial de custo de aquisição:
 * Custo Real = (vProd) + (frete + seguro + outras despesas - desconto) + (ICMS-ST + IPI + II) + (DIFAL) - (impostos recuperáveis)
 */
export function calculateItemAllocations(params: CalculateAllocationsParams): ItemAllocationResult {
  const {
    itemProdValue,
    quantity,
    totalVProd,
    freightTotal,
    insuranceTotal,
    otherExpensesTotal,
    discountTotal,
    icmsStTotal,
    ipiTotal,
    iiTotal,
    difalTotal,
    recoverableTaxesTotal,
    itemCount,
  } = params;

  // Participação proporcional (peso = vProd do item ÷ vProd total da nota)
  const weight = totalVProd > 0 ? itemProdValue / totalVProd : (itemCount > 0 ? 1 / itemCount : 1);

  const freightAllocated = Math.round((freightTotal || 0) * weight * 100) / 100;
  const insuranceAllocated = Math.round((insuranceTotal || 0) * weight * 100) / 100;
  const otherExpensesAllocated = Math.round((otherExpensesTotal || 0) * weight * 100) / 100;
  const discountAllocated = Math.round((discountTotal || 0) * weight * 100) / 100;
  const icmsStAllocated = Math.round((icmsStTotal || 0) * weight * 100) / 100;
  const ipiAllocated = Math.round((ipiTotal || 0) * weight * 100) / 100;
  const iiAllocated = Math.round((iiTotal || 0) * weight * 100) / 100;
  const difalAllocated = Math.round((difalTotal || 0) * weight * 100) / 100;
  const recoverableTaxesAllocated = Math.round((recoverableTaxesTotal || 0) * weight * 100) / 100;

  // Custo Real Total do Item
  const calculatedTotal =
    itemProdValue +
    (freightAllocated + insuranceAllocated + otherExpensesAllocated - discountAllocated) +
    (icmsStAllocated + ipiAllocated + iiAllocated) +
    difalAllocated -
    recoverableTaxesAllocated;

  const totalCost = Math.max(0, Math.round(calculatedTotal * 100) / 100);
  const qty = quantity > 0 ? quantity : 1;
  const costPrice = Math.round((totalCost / qty) * 10000) / 10000;

  return {
    weight,
    freightAllocated,
    insuranceAllocated,
    otherExpensesAllocated,
    discountAllocated,
    icmsStAllocated,
    ipiAllocated,
    iiAllocated,
    difalAllocated,
    recoverableTaxesAllocated,
    costPrice,
    totalCost,
  };
}

export interface ParsedNFItem {
  id: string;
  itemNumber: number;
  cProd: string;
  codeEAN: string;
  description: string;
  quantity: number;
  unit: string;
  batchNumber: string;
  expirationDate: string;

  // Valores originais do produto no XML
  unitProdPrice: number; // vUnCom (valor unitário base)
  itemProdValue: number; // vProd (valor total do produto no item)

  // Detalhamento do rateio proporcional (R$)
  freightAllocated: number;
  insuranceAllocated: number;
  otherExpensesAllocated: number;
  discountAllocated: number;
  icmsStAllocated: number;
  ipiAllocated: number;
  iiAllocated: number;
  difalAllocated: number;
  recoverableTaxesAllocated: number;

  // Custo Real de Aquisição (resultado com tudo rateado)
  costPrice: number; // Custo unitário de aquisição
  totalCost: number; // Custo total de aquisição do item
}

export interface ParsedNFData {
  numberNF: string;
  accessKey: string;
  issueDate: string;
  supplier: string;
  cnpjSupplier: string;
  recipientCnpj: string;
  recipientName: string;
  totalValue: number;
  notes: string;
  totals: NFXmlTotals;
  difalTotal?: number;
  recoverableTaxesTotal?: number;
  items: ParsedNFItem[];
}

function cleanCnpj(cnpj: string | undefined | null): string {
  if (!cnpj) return '';
  return String(cnpj).replace(/\D/g, '');
}

function parseXmlFloat(value: any): number {
  if (value === undefined || value === null) return 0;
  const num = parseFloat(String(value).replace(',', '.').trim());
  return isNaN(num) ? 0 : num;
}

function findInfNFe(parsedObj: any): any {
  if (!parsedObj || typeof parsedObj !== 'object') return null;
  if (parsedObj.infNFe) return parsedObj.infNFe;
  if (parsedObj.NFe?.infNFe) return parsedObj.NFe.infNFe;
  if (parsedObj.nfeProc?.NFe?.infNFe) return parsedObj.nfeProc.NFe.infNFe;

  for (const key of Object.keys(parsedObj)) {
    if (key.toLowerCase().endsWith('infnfe')) return parsedObj[key];
    if (typeof parsedObj[key] === 'object' && parsedObj[key] !== null) {
      const nested = findInfNFe(parsedObj[key]);
      if (nested) return nested;
    }
  }
  return null;
}

export function parseNFeXml(xmlString: string, expectedCompanyCnpj?: string): ParsedNFData {
  if (!xmlString || typeof xmlString !== 'string' || xmlString.trim().length === 0) {
    throw new Error('Arquivo XML vazio ou inválido.');
  }

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    allowBooleanAttributes: true,
    parseTagValue: false, // Keep raw strings to avoid truncating leading zeros in CNPJ/EAN/NF
    trimValues: true,
  });

  let parsed: any;
  try {
    parsed = parser.parse(xmlString);
  } catch (err: any) {
    throw new Error(`Erro ao interpretar o arquivo XML: ${err?.message || 'Sintaxe XML corrompida'}`);
  }

  const infNFe = findInfNFe(parsed);
  if (!infNFe) {
    throw new Error('O arquivo enviado não possui a estrutura oficial de NF-e (tag <infNFe> não encontrada).');
  }

  // 1. Chave de Acesso
  const rawId = infNFe['@_Id'] || infNFe['Id'] || '';
  const accessKey = String(rawId).replace(/^NFe/i, '').trim();

  // 2. Cabeçalho (<ide>)
  const ide = infNFe.ide;
  if (!ide) {
    throw new Error('A tag de identificação da NF-e (<ide>) não foi encontrada no XML.');
  }

  const rawNNF = ide.nNF;
  if (!rawNNF) {
    throw new Error('Número da Nota Fiscal (nNF) ausente no XML.');
  }
  const numberNF = String(rawNNF).trim();

  const rawDate = ide.dhEmi || ide.dEmi || '';
  if (!rawDate) {
    throw new Error('Data de emissão (dhEmi ou dEmi) ausente no XML da NF-e.');
  }
  const issueDate = String(rawDate).slice(0, 10);

  // 3. Emitente (<emit>)
  const emit = infNFe.emit;
  if (!emit) {
    throw new Error('Dados do emitente da NF-e (<emit>) ausentes no XML.');
  }
  const cnpjSupplier = String(emit.CNPJ || emit.CPF || '').trim();
  const supplier = String(emit.xNome || emit.xFant || 'Fornecedor NF-e').trim();
  if (!cnpjSupplier) {
    throw new Error('CNPJ/CPF do fornecedor emitente não informado no XML.');
  }

  // 4. Destinatário (<dest>)
  const dest = infNFe.dest;
  if (!dest) {
    throw new Error('Dados do destinatário da NF-e (<dest>) ausentes no XML.');
  }
  const recipientCnpj = String(dest.CNPJ || dest.CPF || '').trim();
  const recipientName = String(dest.xNome || 'Destinatário').trim();

  if (!recipientCnpj) {
    throw new Error('CNPJ/CPF do destinatário não informado no XML da NF-e.');
  }

  // Validação estrita do CNPJ da empresa
  if (expectedCompanyCnpj) {
    const cleanExpected = cleanCnpj(expectedCompanyCnpj);
    const cleanRecipient = cleanCnpj(recipientCnpj);

    if (cleanExpected && cleanRecipient && cleanExpected !== cleanRecipient) {
      throw new Error('Esta nota fiscal não foi emitida para o CNPJ desta empresa');
    }
  }

  // 5. Extração dos Totais da NF (<total><ICMSTot>)
  const icmsTot = infNFe.total?.ICMSTot || {};
  const xmlTotals: NFXmlTotals = {
    vProd: parseXmlFloat(icmsTot.vProd),
    vFrete: parseXmlFloat(icmsTot.vFrete),
    vSeg: parseXmlFloat(icmsTot.vSeg),
    vOutro: parseXmlFloat(icmsTot.vOutro),
    vDesc: parseXmlFloat(icmsTot.vDesc),
    vICMSST: parseXmlFloat(icmsTot.vST !== undefined ? icmsTot.vST : icmsTot.vICMSST),
    vIPI: parseXmlFloat(icmsTot.vIPI),
    vII: parseXmlFloat(icmsTot.vII),
    vNF: parseXmlFloat(icmsTot.vNF),
  };

  // 6. Itens (<det>)
  const rawDets = infNFe.det;
  if (!rawDets) {
    throw new Error('Nenhum item (<det>) encontrado no XML da NF-e.');
  }

  const detList = Array.isArray(rawDets) ? rawDets : [rawDets];
  if (detList.length === 0) {
    throw new Error('A lista de itens da NF-e está vazia.');
  }

  // Primeiro passo: parse dos produtos brutos para calcular soma real de vProd
  interface RawParsedItem {
    detIndex: number;
    cProd: string;
    codeEAN: string;
    description: string;
    quantity: number;
    unitProdPrice: number;
    itemProdValue: number;
    unit: string;
    batchNumber: string;
    expirationDate: string;
  }

  const rawItems: RawParsedItem[] = [];
  let calculatedSumVProd = 0;

  for (let i = 0; i < detList.length; i++) {
    const det = detList[i];
    const prod = det.prod;
    if (!prod) {
      throw new Error(`Dados do produto no item ${i + 1} (<prod>) ausentes no XML.`);
    }

    const cProd = String(prod.cProd || '').trim();
    const xProd = String(prod.xProd || '').trim();
    if (!xProd) {
      throw new Error(`Descrição do produto no item ${i + 1} (xProd) ausente no XML.`);
    }

    // EAN logic: fallback to cEANTrib if empty or "SEM GTIN"
    let rawEan = String(prod.cEAN || '').trim();
    if (!rawEan || rawEan.toUpperCase() === 'SEM GTIN' || rawEan.toUpperCase() === 'SEMGTIN') {
      const eanTrib = String(prod.cEANTrib || '').trim();
      if (eanTrib && eanTrib.toUpperCase() !== 'SEM GTIN' && eanTrib.toUpperCase() !== 'SEMGTIN') {
        rawEan = eanTrib;
      } else {
        rawEan = '';
      }
    }

    const qCom = parseXmlFloat(prod.qCom);
    if (isNaN(qCom) || qCom <= 0) {
      throw new Error(`Quantidade inválida para o produto "${xProd}" no item ${i + 1}.`);
    }

    const vUnCom = parseXmlFloat(prod.vUnCom);
    if (isNaN(vUnCom) || vUnCom < 0) {
      throw new Error(`Valor unitário inválido para o produto "${xProd}" no item ${i + 1}.`);
    }

    const rawVProd = parseXmlFloat(prod.vProd);
    const itemProdValue = rawVProd > 0 ? rawVProd : Math.round(qCom * vUnCom * 100) / 100;
    calculatedSumVProd += itemProdValue;

    const uCom = String(prod.uCom || 'UN').trim();

    // Rastro / Lote / Validade
    let batchNumber = `LOTE-${new Date().getFullYear()}-XML`;
    let expirationDate = '2027-12-31';

    if (det.rastro) {
      const rastro = Array.isArray(det.rastro) ? det.rastro[0] : det.rastro;
      if (rastro?.nLote) batchNumber = String(rastro.nLote).trim();
      if (rastro?.dVal) expirationDate = String(rastro.dVal).slice(0, 10);
    } else if (det.med) {
      const med = Array.isArray(det.med) ? det.med[0] : det.med;
      if (med?.nLote) batchNumber = String(med.nLote).trim();
      if (med?.dVal) expirationDate = String(med.dVal).slice(0, 10);
    }

    rawItems.push({
      detIndex: i + 1,
      cProd,
      codeEAN: rawEan,
      description: xProd,
      quantity: qCom,
      unitProdPrice: vUnCom,
      itemProdValue,
      unit: uCom,
      batchNumber,
      expirationDate,
    });
  }

  // Base total de produtos para cálculo do rateio
  const totalVProdForRateio = xmlTotals.vProd > 0 ? xmlTotals.vProd : calculatedSumVProd;

  // Segundo passo: aplicar a fórmula de rateio proporcional para cada item
  const items: ParsedNFItem[] = rawItems.map((raw) => {
    const allocations = calculateItemAllocations({
      itemProdValue: raw.itemProdValue,
      quantity: raw.quantity,
      totalVProd: totalVProdForRateio,
      freightTotal: xmlTotals.vFrete,
      insuranceTotal: xmlTotals.vSeg,
      otherExpensesTotal: xmlTotals.vOutro,
      discountTotal: xmlTotals.vDesc,
      icmsStTotal: xmlTotals.vICMSST,
      ipiTotal: xmlTotals.vIPI,
      iiTotal: xmlTotals.vII,
      difalTotal: 0,
      recoverableTaxesTotal: 0,
      itemCount: rawItems.length,
    });

    return {
      id: `xml-item-${raw.detIndex}-${Date.now()}`,
      itemNumber: raw.detIndex,
      cProd: raw.cProd,
      codeEAN: raw.codeEAN,
      description: raw.description,
      quantity: raw.quantity,
      unit: raw.unit,
      batchNumber: raw.batchNumber,
      expirationDate: raw.expirationDate,

      unitProdPrice: raw.unitProdPrice,
      itemProdValue: raw.itemProdValue,

      freightAllocated: allocations.freightAllocated,
      insuranceAllocated: allocations.insuranceAllocated,
      otherExpensesAllocated: allocations.otherExpensesAllocated,
      discountAllocated: allocations.discountAllocated,
      icmsStAllocated: allocations.icmsStAllocated,
      ipiAllocated: allocations.ipiAllocated,
      iiAllocated: allocations.iiAllocated,
      difalAllocated: allocations.difalAllocated,
      recoverableTaxesAllocated: allocations.recoverableTaxesAllocated,

      costPrice: allocations.costPrice,
      totalCost: allocations.totalCost,
    };
  });

  // Valor total final da nota
  const finalTotalValue = xmlTotals.vNF > 0 ? xmlTotals.vNF : Math.round(calculatedSumVProd * 100) / 100;

  return {
    numberNF,
    accessKey,
    issueDate,
    supplier,
    cnpjSupplier,
    recipientCnpj,
    recipientName,
    totalValue: finalTotalValue,
    notes: `Importação direta de arquivo XML NF-e (Chave ${accessKey || numberNF})`,
    totals: xmlTotals,
    difalTotal: 0,
    recoverableTaxesTotal: 0,
    items,
  };
}

