import * as XLSX from 'xlsx';

/**
 * Utilitário universal para exportação client-side de dados para Excel (.xlsx) e CSV (.csv).
 * Não depende de chamadas de backend - gera os arquivos diretamente na memória do navegador.
 */

export interface ExportColumn<T> {
  header: string;
  key: keyof T | string;
  formatter?: (value: any, item: T) => string | number;
}

/**
 * Exporta uma lista de objetos para arquivo Excel (.xlsx) nativo
 */
export function exportToExcel<T extends Record<string, any>>(
  data: T[],
  fileName: string,
  sheetName: string = 'Dados',
  customHeaders?: Record<string, string>
): void {
  if (!data || data.length === 0) {
    alert('Nenhum dado visível para exportar.');
    return;
  }

  // Se houver mapeamento de cabeçalhos amigáveis
  const formattedData = data.map((item) => {
    if (!customHeaders) return item;
    const newObj: Record<string, any> = {};
    for (const [key, value] of Object.entries(item)) {
      const headerName = customHeaders[key] || key;
      newObj[headerName] = value;
    }
    return newObj;
  });

  const worksheet = XLSX.utils.json_to_sheet(formattedData);

  // Auto-ajustar a largura das colunas
  const keys = Object.keys(formattedData[0] || {});
  const colWidths = keys.map((key) => {
    let maxLen = key.length;
    formattedData.forEach((row) => {
      const val = row[key];
      if (val !== undefined && val !== null) {
        maxLen = Math.max(maxLen, String(val).length);
      }
    });
    return { wch: Math.min(Math.max(maxLen + 3, 10), 60) };
  });
  worksheet['!cols'] = colWidths;

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);

  const cleanFileName = fileName.toLowerCase().endsWith('.xlsx')
    ? fileName
    : `${fileName}.xlsx`;

  XLSX.writeFile(workbook, cleanFileName);
}

/**
 * Exporta uma lista formatada para CSV com BOM UTF-8 (compatibilidade 100% com Excel e Google Sheets)
 */
export function exportToCSV(
  headers: string[],
  rows: (string | number | boolean | null | undefined)[][],
  fileName: string
): void {
  if (!rows || rows.length === 0) {
    alert('Nenhum dado visível para exportar.');
    return;
  }

  const escapeCSV = (val: any): string => {
    if (val === null || val === undefined) return '';
    const str = String(val);
    if (str.includes(';') || str.includes('\n') || str.includes('"')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const csvRows: string[] = [];
  csvRows.push(headers.map(escapeCSV).join(';'));

  rows.forEach((row) => {
    csvRows.push(row.map(escapeCSV).join(';'));
  });

  // \uFEFF garante que o Microsoft Excel em qualquer idioma reconheça acentos (UTF-8 com BOM)
  const csvContent = '\uFEFF' + csvRows.join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const cleanFileName = fileName.toLowerCase().endsWith('.csv')
    ? fileName
    : `${fileName}.csv`;

  link.setAttribute('href', url);
  link.setAttribute('download', cleanFileName);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
