import { XMLParser } from 'fast-xml-parser';

export interface ParsedNFItem {
  id: string;
  itemNumber: number;
  cProd: string;
  codeEAN: string;
  description: string;
  quantity: number;
  costPrice: number;
  totalCost: number;
  unit: string;
  batchNumber: string;
  expirationDate: string;
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
  items: ParsedNFItem[];
}

function cleanCnpj(cnpj: string | undefined | null): string {
  if (!cnpj) return '';
  return String(cnpj).replace(/\D/g, '');
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

  // 5. Itens (<det>)
  const rawDets = infNFe.det;
  if (!rawDets) {
    throw new Error('Nenhum item (<det>) encontrado no XML da NF-e.');
  }

  const detList = Array.isArray(rawDets) ? rawDets : [rawDets];
  if (detList.length === 0) {
    throw new Error('A lista de itens da NF-e está vazia.');
  }

  const items: ParsedNFItem[] = [];
  let totalValue = 0;

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

    const qCom = parseFloat(String(prod.qCom || '0').replace(',', '.'));
    if (isNaN(qCom) || qCom <= 0) {
      throw new Error(`Quantidade inválida para o produto "${xProd}" no item ${i + 1}.`);
    }

    const vUnCom = parseFloat(String(prod.vUnCom || '0').replace(',', '.'));
    if (isNaN(vUnCom) || vUnCom < 0) {
      throw new Error(`Valor unitário inválido para o produto "${xProd}" no item ${i + 1}.`);
    }

    const uCom = String(prod.uCom || 'UN').trim();
    const itemTotalCost = Math.round(qCom * vUnCom * 100) / 100;
    totalValue += itemTotalCost;

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

    items.push({
      id: `xml-item-${i + 1}-${Date.now()}`,
      itemNumber: i + 1,
      cProd,
      codeEAN: rawEan,
      description: xProd,
      quantity: qCom,
      costPrice: vUnCom,
      totalCost: itemTotalCost,
      unit: uCom,
      batchNumber,
      expirationDate,
    });
  }

  // Valor total da nota do <total> se existir
  const vNF = infNFe.total?.ICMSTot?.vNF;
  const parsedVNF = vNF ? parseFloat(String(vNF).replace(',', '.')) : null;
  const finalTotalValue = parsedVNF && !isNaN(parsedVNF) ? parsedVNF : Math.round(totalValue * 100) / 100;

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
    items,
  };
}
