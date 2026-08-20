import { authFetch } from './apiAuth';
import { Product, StockMovement } from '../types';

export interface PostgresConnectionInfo {
  host: string;
  port: number;
  user: string;
  database: string;
  ssl: boolean;
  poolTotal?: number;
  poolIdle?: number;
  poolWaiting?: number;
  configured: boolean;
}

export interface PostgresHealthStatus {
  status: 'healthy' | 'unhealthy';
  latencyMs: number;
  serverTime?: string;
  version?: string;
  database?: string;
  connection?: PostgresConnectionInfo;
  counts?: {
    products: number;
    movements: number;
    nfEntries: number;
    sales: number;
    users: number;
  };
  error?: string;
}

export interface PostgresStockSummary {
  timestamp: string;
  latencyMs: number;
  summary: {
    productsCount: number;
    totalDepositoUnits: number;
    totalLojaUnits: number;
    totalUnits: number;
    totalCostValue: number;
    totalSellValue: number;
    lowStockCount: number;
    criticalStockCount: number;
    movementsCount: number;
    salesCount: number;
  };
  products: Array<
    Product & {
      totalStock: number;
      totalCostValue: number;
      totalSellValue: number;
      stockStatus: 'critico' | 'alerta' | 'normal';
    }
  >;
  recentMovements: StockMovement[];
}

export interface PostgresDiagnosticsResult {
  success: boolean;
  latencyMs: number;
  timestamp: string;
  tables: Array<{ table_name: string; columns_count: string | number }>;
  connection: PostgresConnectionInfo;
  error?: string;
}

/**
 * Consulta o status de saúde e latência do PostgreSQL
 */
export async function fetchPostgresHealth(): Promise<PostgresHealthStatus> {
  const response = await authFetch('/api/postgres/status');
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Erro HTTP ${response.status} ao consultar status do PostgreSQL`);
  }
  return response.json();
}

/**
 * Busca o estoque em tempo real com métricas diretamente do PostgreSQL
 */
export async function fetchPostgresStockRealtime(): Promise<PostgresStockSummary> {
  const response = await authFetch('/api/postgres/stock-realtime');
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Erro HTTP ${response.status} ao buscar estoque em tempo real`);
  }
  return response.json();
}

/**
 * Executa diagnóstico de integridade das tabelas do PostgreSQL
 */
export async function runPostgresDiagnostics(): Promise<PostgresDiagnosticsResult> {
  const response = await authFetch('/api/postgres/diagnostics', {
    method: 'POST',
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Erro HTTP ${response.status} ao executar diagnóstico`);
  }
  return response.json();
}
