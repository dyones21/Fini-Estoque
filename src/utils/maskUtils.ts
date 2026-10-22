/**
 * Utilitários de Máscaras e Formatação para Formulários
 * Desenvolvido para atender Contas a Pagar e Fornecedores
 */

/**
 * Aplica máscara de CNPJ (00.000.000/0000-00) limitando a 14 dígitos numéricos.
 */
export function maskCnpj(value: string | undefined | null): string {
  if (!value) return '';
  const digits = String(value).replace(/\D/g, '').slice(0, 14);
  if (!digits) return '';
  if (digits.length <= 2) return digits;
  if (digits.length <= 5) return `${digits.slice(0, 2)}.${digits.slice(2)}`;
  if (digits.length <= 8) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5)}`;
  if (digits.length <= 12) {
    return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8)}`;
  }
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12, 14)}`;
}

/**
 * Aplica máscara de Telefone brasileiro com DDD:
 * - 10 dígitos: (00) 0000-0000
 * - 11 dígitos: (00) 00000-0000
 */
export function maskPhone(value: string | undefined | null): string {
  if (!value) return '';
  const digits = String(value).replace(/\D/g, '').slice(0, 11);
  if (!digits) return '';
  if (digits.length <= 2) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7, 11)}`;
}

/**
 * Aplica máscara de CEP (00000-000)
 */
export function maskCep(value: string | undefined | null): string {
  if (!value) return '';
  const digits = String(value).replace(/\D/g, '').slice(0, 8);
  if (!digits) return '';
  if (digits.length <= 5) return digits;
  return `${digits.slice(0, 5)}-${digits.slice(5, 8)}`;
}

/**
 * Aplica máscara de moeda em tempo real (R$ 0,00).
 * Conforme o usuário digita os números, os centavos são deslocados automaticamente,
 * no padrão dos sistemas bancários e ERPs brasileiros.
 */
export function maskCurrency(value: string | number | undefined | null): string {
  if (value === undefined || value === null || value === '') return '';

  if (typeof value === 'number') {
    if (isNaN(value)) return '';
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  }

  const rawDigits = String(value).replace(/\D/g, '');
  if (!rawDigits) return '';

  const num = parseInt(rawDigits, 10) / 100;
  if (isNaN(num)) return '';

  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(num);
}

/**
 * Converte com segurança uma string formatada em moeda (ex: 'R$ 1.250,50' ou '1250,50')
 * para um número float de precisão (1250.50).
 */
export function parseCurrencyToNumber(value: string | number | undefined | null): number {
  if (value === undefined || value === null || value === '') return 0;
  if (typeof value === 'number') return isNaN(value) ? 0 : value;

  const rawDigits = String(value).replace(/\D/g, '');
  if (!rawDigits) return 0;

  const parsed = parseInt(rawDigits, 10) / 100;
  return isNaN(parsed) ? 0 : parsed;
}

/**
 * Formata data ISO (YYYY-MM-DD ou YYYY-MM-DDTHH:mm:ss...) para o padrão brasileiro DD/MM/AAAA.
 * Realiza divisão direta de strings para evitar deslocamento de fuso horário.
 */
export function formatDisplayDate(dateStr: string | undefined | null): string {
  if (!dateStr) return '—';
  const clean = String(dateStr).trim();
  if (!clean) return '—';
  const datePart = clean.slice(0, 10);
  const parts = datePart.split('-');
  if (parts.length === 3 && parts[0].length === 4) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return clean;
}

