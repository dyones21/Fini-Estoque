import { Product, ABCAnalysisItem, LocationType } from '../types';

/**
 * Format numbers to Brazilian Real currency format (R$)
 */
export function formatCurrency(value: number): string {
  const safeVal = isNaN(value) ? 0 : value;
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(safeVal);
}

/**
 * Safely parse numeric input string supporting both comma and dot decimals
 */
export function parseNumber(value: string | number | undefined | null, fallback = 0): number {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'number') return isNaN(value) ? fallback : value;
  const cleaned = String(value).replace(/\s/g, '').replace(',', '.');
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? fallback : parsed;
}

/**
 * Format ISO date string to PT-BR date format (DD/MM/YYYY)
 */
export function formatDate(isoString: string): string {
  if (!isoString) return '-';
  try {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return isoString;
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(date);
  } catch {
    return isoString;
  }
}

/**
 * Format ISO date string to PT-BR Date & Time format
 */
export function formatDateTime(isoString: string): string {
  if (!isoString) return '-';
  try {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return isoString;
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  } catch {
    return isoString;
  }
}

/**
 * Get total stock for a product based on location view
 */
export function getProductStock(product: Product, location: LocationType): number {
  if (location === 'loja') return product.stockLoja;
  if (location === 'deposito') return product.stockDeposito;
  return product.stockLoja + product.stockDeposito; // geral
}

/**
 * Check if product is in low stock condition
 */
export function isLowStock(product: Product, location: LocationType): boolean {
  if (location === 'loja') return product.stockLoja <= product.minStockLoja;
  if (location === 'deposito') return product.stockDeposito <= product.minStockDeposito;
  // Geral: low in either or total
  return (
    product.stockLoja <= product.minStockLoja ||
    product.stockDeposito <= product.minStockDeposito
  );
}

/**
 * Check days until expiration
 */
export function getDaysToExpiration(expirationDateStr: string): number {
  if (!expirationDateStr) return 999;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expDate = new Date(expirationDateStr);
  const diffTime = expDate.getTime() - today.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

/**
 * Perform Curva ABC Analysis (Pareto Classification)
 * Class A: Up to 80% of cumulative revenue
 * Class B: Next 15% (up to 95%)
 * Class C: Remaining 5%
 */
export function calculateCurvaABC(products: Product[]): ABCAnalysisItem[] {
  // 1. Calculate total revenue across all products
  const productsWithSales = products.map((p) => {
    // If product totalSalesValue is 0, estimate based on stock value to ensure ABC works even for new items
    const rev = p.totalSalesValue > 0 ? p.totalSalesValue : (p.stockDeposito + p.stockLoja) * p.sellPrice;
    return { product: p, revenue: rev };
  });

  const totalRevenue = productsWithSales.reduce((acc, curr) => acc + curr.revenue, 0);

  if (totalRevenue === 0) {
    return products.map((p) => ({
      product: p,
      totalRevenue: 0,
      revenuePercentage: 0,
      cumulativePercentage: 0,
      classABC: 'C',
    }));
  }

  // 2. Sort descending by revenue
  productsWithSales.sort((a, b) => b.revenue - a.revenue);

  // 3. Compute cumulative %
  let cumulativeValue = 0;
  return productsWithSales.map((item) => {
    cumulativeValue += item.revenue;
    const revenuePct = (item.revenue / totalRevenue) * 100;
    const cumulativePct = (cumulativeValue / totalRevenue) * 100;

    let classABC: 'A' | 'B' | 'C' = 'C';
    if (cumulativePct <= 80 || (cumulativePct - revenuePct) < 80) {
      classABC = 'A';
    } else if (cumulativePct <= 95 || (cumulativePct - revenuePct) < 95) {
      classABC = 'B';
    } else {
      classABC = 'C';
    }

    return {
      product: item.product,
      totalRevenue: item.revenue,
      revenuePercentage: Math.round(revenuePct * 100) / 100,
      cumulativePercentage: Math.round(cumulativePct * 100) / 100,
      classABC,
    };
  });
}

/**
 * Export product data to CSV format
 */
export function exportToCSV(filename: string, rows: Record<string, any>[]): void {
  if (!rows || rows.length === 0) return;
  const keys = Object.keys(rows[0]);
  const csvContent = [
    keys.join(';'),
    ...rows.map((row) =>
      keys
        .map((k) => {
          const val = row[k];
          const strVal = val === null || val === undefined ? '' : String(val);
          return `"${strVal.replace(/"/g, '""')}"`;
        })
        .join(';')
    ),
  ].join('\n');

  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `${filename}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
